import { createHash } from "node:crypto";
import { db } from "../../lib/db";
import { createDraftSchema, deleteDraftSchema, draftContentSchema, draftIdSchema, DRAFT_LIMIT, updateDraftSchema, type ListingDraft } from "./validation";

export class DraftError extends Error {
  constructor(public code:"ineligible"|"not-found"|"conflict"|"limited"|"full") { super(code); }
}
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value!==null&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function project(row:Record<string,unknown>):ListingDraft {
  return {id:String(row.id),version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),content:draftContentSchema.parse(row.content)};
}
/** Internal boundary: userId always comes from a verified server session. */
export async function draftEligibility(userId:string):Promise<boolean> {
  const rows=await db()`SELECT 1 FROM advertiser_profiles p JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id)
    WHERE p.user_id=${userId} AND p.status='active' AND NOT a.is_demo`;
  return rows.length>0;
}
export async function listDrafts(userId:string):Promise<ListingDraft[]> {
  if(!await draftEligibility(userId))throw new DraftError("ineligible");
  const rows=await db()`SELECT d.* FROM listing_drafts d JOIN advertiser_profiles p ON (p.advertiser_id,p.user_id)=(d.advertiser_id,d.user_id)
    JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id)
    WHERE d.user_id=${userId} AND p.status='active' AND NOT a.is_demo ORDER BY d.updated_at DESC,d.id LIMIT ${DRAFT_LIMIT}`;
  return rows.map(project);
}
export async function readDraft(userId:string,inputId:string):Promise<ListingDraft|null> {
  const id=draftIdSchema.parse(inputId);
  const [row]=await db()`SELECT d.* FROM listing_drafts d JOIN advertiser_profiles p ON (p.advertiser_id,p.user_id)=(d.advertiser_id,d.user_id)
    JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id)
    WHERE d.id=${id} AND d.user_id=${userId} AND p.status='active' AND NOT a.is_demo`;
  return row?project(row):null;
}
type Mutation = {kind:"create";input:unknown}|{kind:"update";id:string;input:unknown}|{kind:"delete";id:string;input:unknown};
async function mutate(userId:string,operation:Mutation):Promise<ListingDraft|null> {
  const create=operation.kind==="create"?createDraftSchema.parse(operation.input):null;
  const update=operation.kind==="update"?updateDraftSchema.parse(operation.input):null;
  const deletion=operation.kind==="delete"?deleteDraftSchema.parse(operation.input):null;
  const id=operation.kind!=="create"?draftIdSchema.parse(operation.id):null;
  // Return expected failures from the transaction so the write budget is committed.
  const result=await db().begin(async sql=>{
    const users=await sql`SELECT id FROM auth_user WHERE id=${userId} FOR UPDATE`;
    if(!users.length)return {error:"ineligible" as const};
    const [profile]=await sql`SELECT p.advertiser_id FROM advertiser_profiles p JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id)
      WHERE p.user_id=${userId} AND p.status='active' AND NOT a.is_demo FOR UPDATE OF p,a`;
    if(!profile)return {error:"ineligible" as const};
    const budget=await sql`INSERT INTO listing_draft_write_limits(user_id,request_count) VALUES (${userId},1)
      ON CONFLICT(user_id) DO UPDATE SET
      request_count=CASE WHEN listing_draft_write_limits.window_started_at<=now()-interval '1 minute' THEN 1 ELSE listing_draft_write_limits.request_count+1 END,
      window_started_at=CASE WHEN listing_draft_write_limits.window_started_at<=now()-interval '1 minute' THEN now() ELSE listing_draft_write_limits.window_started_at END
      WHERE listing_draft_write_limits.window_started_at<=now()-interval '1 minute' OR listing_draft_write_limits.request_count<30 RETURNING user_id`;
    if(!budget.length)return {error:"limited" as const};
    if(create){
      const hash=createHash("sha256").update(canonical(create.content)).digest("hex");
      const [receipt]=await sql`SELECT draft_id,payload_hash FROM listing_draft_requests WHERE user_id=${userId} AND request_id=${create.requestId}`;
      if(receipt){
        if(receipt.payload_hash!==hash||!receipt.draft_id)return {error:"conflict" as const};
        const [row]=await sql`SELECT * FROM listing_drafts WHERE id=${receipt.draft_id} AND user_id=${userId}`;
        return row?{draft:project(row)}:{error:"conflict" as const};
      }
      const [count]=await sql`SELECT count(*)::int AS n FROM listing_drafts WHERE user_id=${userId}`;
      const [requests]=await sql`SELECT count(*)::int AS n FROM listing_draft_requests WHERE user_id=${userId}`;
      if(count.n>=DRAFT_LIMIT||requests.n>=1000)return {error:"full" as const};
      const [row]=await sql`INSERT INTO listing_drafts(user_id,advertiser_id,category,content)
        VALUES (${userId},${profile.advertiser_id},${create.content.category},${sql.json(create.content)}) RETURNING *`;
      await sql`INSERT INTO listing_draft_requests(user_id,request_id,draft_id,payload_hash) VALUES (${userId},${create.requestId},${row.id},${hash})`;
      return {draft:project(row)};
    }
    const [existing]=await sql`SELECT * FROM listing_drafts WHERE id=${id!} AND user_id=${userId} AND advertiser_id=${profile.advertiser_id} FOR UPDATE`;
    if(!existing)return {error:"not-found" as const};
    if(existing.version!==(update?.version??deletion!.version))return {error:"conflict" as const};
    if(update){
      if(update.content.category!==existing.category)return {error:"conflict" as const};
      const [row]=await sql`UPDATE listing_drafts SET content=${sql.json(update.content)} WHERE id=${id!} AND user_id=${userId} AND version=${update.version} RETURNING *`;
      return {draft:project(row)};
    }
    await sql`DELETE FROM listing_drafts WHERE id=${id!} AND user_id=${userId} AND version=${deletion!.version}`;
    return {draft:null};
  });
  if("error" in result)throw new DraftError(result.error!);
  return result.draft;
}
export async function createDraft(userId:string,input:unknown):Promise<ListingDraft> { return (await mutate(userId,{kind:"create",input}))!; }
export async function updateDraft(userId:string,id:string,input:unknown):Promise<ListingDraft> { return (await mutate(userId,{kind:"update",id,input}))!; }
export async function deleteDraft(userId:string,id:string,input:unknown):Promise<void> { await mutate(userId,{kind:"delete",id,input}); }