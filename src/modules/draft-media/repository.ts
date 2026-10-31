import { randomUUID, createHash } from "node:crypto";
import type postgres from "postgres";
import { db } from "../../lib/db";
import { mediaLimits } from "./config";
import { MediaError, mediaOrderSchema, photoUrl, type MediaCollection } from "./validation";
import { privateStorage, type PrivateStorage } from "./storage";
import { processPhoto } from "./processing";

async function locked(sql:postgres.TransactionSql,userId:string,draftId:string){
  await sql`SELECT id FROM auth_user WHERE id=${userId} FOR UPDATE`;
  const profiles=await sql`SELECT p.advertiser_id FROM advertiser_profiles p JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id)
    WHERE p.user_id=${userId} AND p.status='active' AND NOT a.is_demo FOR UPDATE OF p,a`;
  if(!profiles.length)throw new MediaError(404,"Draft photographs not found.");
  const [draft]=await sql`SELECT id FROM listing_drafts WHERE id=${draftId} AND user_id=${userId} FOR UPDATE`;
  if(!draft)throw new MediaError(404,"Draft photographs not found.");
  await sql`INSERT INTO draft_media_state(draft_id) VALUES (${draftId}) ON CONFLICT DO NOTHING`;
  return (await sql`SELECT version FROM draft_media_state WHERE draft_id=${draftId}`)[0].version as number;
}
export async function authorizeMedia(userId:string,draftId:string){
  const rows=await db()`SELECT d.id FROM listing_drafts d JOIN advertiser_profiles p ON (p.advertiser_id,p.user_id)=(d.advertiser_id,d.user_id)
    JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id)
    WHERE d.id=${draftId} AND d.user_id=${userId} AND p.status='active' AND NOT a.is_demo`;
  if(!rows.length)throw new MediaError(404,"Draft photographs not found.");
}
export async function mediaBudget(userId:string,draftId:string){
  await authorizeMedia(userId,draftId);
  const rows=await db()`INSERT INTO draft_media_limits(user_id,attempts) VALUES (${userId},1)
    ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN draft_media_limits.started_at<now()-interval '1 minute' THEN 1 ELSE draft_media_limits.attempts+1 END,
    started_at=CASE WHEN draft_media_limits.started_at<now()-interval '1 minute' THEN now() ELSE draft_media_limits.started_at END
    WHERE draft_media_limits.started_at<now()-interval '1 minute' OR draft_media_limits.attempts<40 RETURNING user_id`;
  if(!rows.length)throw new MediaError(429,"Too many photo changes. Please wait a minute.");
}
async function collection(sql:postgres.TransactionSql,draftId:string,version:number):Promise<MediaCollection>{
  const rows=await sql`SELECT id,width,height,byte_size,is_cover FROM draft_photographs WHERE draft_id=${draftId} AND state='ready' ORDER BY display_order,id`;
  return {version,images:rows.map(row=>({id:row.id,width:row.width,height:row.height,size:row.byte_size,cover:row.is_cover,url:photoUrl(draftId,row.id)}))};
}
export async function listMedia(userId:string,draftId:string):Promise<MediaCollection>{
  return db().begin(async sql=>{const version=await locked(sql,userId,draftId);return collection(sql,draftId,version);});
}
async function bump(sql:postgres.TransactionSql,draftId:string){return (await sql`UPDATE draft_media_state SET version=version+1 WHERE draft_id=${draftId} RETURNING version`)[0].version as number;}

/** Reserve before processing/storage; durable tombstones also cover ambiguous DB commits. */
export async function uploadPhoto(userId:string,draftId:string,requestId:string,bytes:Buffer,storage:PrivateStorage=privateStorage()):Promise<MediaCollection>{
  const limits=mediaLimits(),hash=createHash("sha256").update(bytes).digest("hex");
  const reservation=await db().begin(async sql=>{
    const version=await locked(sql,userId,draftId);
    const [previous]=await sql`SELECT * FROM draft_photographs WHERE owner_id=${userId} AND request_id=${requestId}`;
    if(previous){
      if(previous.draft_id!==draftId||previous.input_hash!==hash)throw new MediaError(409,"This upload request was already used for another photograph.");
      if(previous.state==='ready')return {existing:await collection(sql,draftId,version)};
      throw new MediaError(409,previous.state==='pending'?"This upload is still processing. Retry shortly.":"This upload was removed or failed. Choose Retry as a new upload.");
    }
    const [duplicate]=await sql`SELECT id FROM draft_photographs WHERE draft_id=${draftId} AND input_hash=${hash} AND state IN ('pending','ready')`;
    if(duplicate)throw new MediaError(409,"This photograph is already uploaded or processing.");
    const [counts]=await sql`SELECT count(*) FILTER(WHERE draft_id=${draftId} AND state IN ('pending','ready'))::int AS draft_count,
      count(*) FILTER(WHERE state IN ('pending','ready','deleting'))::int AS total,
      coalesce(sum(CASE WHEN state='pending' THEN ${limits.processed} ELSE coalesce(byte_size,${limits.processed}) END) FILTER(WHERE state<>'deleted'),0)::bigint AS bytes,
      count(*)::int AS receipts FROM draft_photographs WHERE owner_id=${userId}`;
    if(counts.draft_count>=limits.count)throw new MediaError(409,`A draft can have at most ${limits.count} photographs.`);
    if(counts.total>=limits.accountImages||Number(counts.bytes)+limits.processed>limits.accountBytes||counts.receipts>=5000)throw new MediaError(409,"Your account photo quota is full. Delete unused photographs or contact support.");
    const id=randomUUID(),key=`drafts/${draftId}/${id}.webp`;
    await sql`INSERT INTO draft_photographs(id,draft_id,owner_id,request_id,input_hash,storage_key,state)
      VALUES (${id},${draftId},${userId},${requestId},${hash},${key},'pending')`;
    return {id,key};
  });
  if("existing" in reservation)return reservation.existing!;
  try{
    const processed=await processPhoto(bytes);
    // Write while holding the short account/draft lock. Deletion and cleanup cannot
    // race a delayed object PUT; the client has a bounded storage timeout.
    return await db().begin(async sql=>{
      const version=await locked(sql,userId,draftId);
      const [row]=await sql`SELECT state,expires_at FROM draft_photographs WHERE id=${reservation.id!} FOR UPDATE`;
      if(!row||row.state!=='pending'||new Date(row.expires_at).getTime()<Date.now())throw new MediaError(409,"Upload expired. Retry this photograph.");
      await storage.put(reservation.key!,processed.bytes);
      const [order]=await sql`SELECT coalesce(max(display_order)+1,0)::int AS n,count(*)::int AS total FROM draft_photographs WHERE draft_id=${draftId} AND state='ready'`;
      await sql`UPDATE draft_photographs SET state='ready',width=${processed.width},height=${processed.height},byte_size=${processed.bytes.length},display_order=${order.n},is_cover=${order.total===0},updated_at=now() WHERE id=${reservation.id!}`;
      return collection(sql,draftId,await bump(sql,draftId)||version);
    });
  }catch(error){
    // Never delete immediately after a possibly committed transaction: reconciliation
    // inspects persisted state and deletes only non-ready records.
    await db()`UPDATE draft_photographs SET state='deleting',expires_at=now(),updated_at=now() WHERE id=${reservation.id!} AND state='pending'`.catch(()=>{});
    throw error;
  }
}

export async function arrangeMedia(userId:string,draftId:string,input:unknown):Promise<MediaCollection>{
  const data=mediaOrderSchema.parse(input);
  return db().begin(async sql=>{
    const version=await locked(sql,userId,draftId);
    if(version!==data.version)throw new MediaError(409,"Photographs changed in another request. Reload the photos and try again.");
    const rows=await sql`SELECT id FROM draft_photographs WHERE draft_id=${draftId} AND state='ready' ORDER BY display_order,id`;
    if(rows.length!==data.ids.length||rows.some(row=>!data.ids.includes(row.id))||(data.ids.length>0&&!data.ids.includes(data.coverId||""))||(!data.ids.length&&data.coverId!==null))throw new MediaError(400,"Provide every photograph exactly once and choose one cover.");
    // Temporarily move out of the partial unique indexes while replacing the set.
    await sql`UPDATE draft_photographs SET state='pending',is_cover=false WHERE draft_id=${draftId} AND state='ready'`;
    for(const [order,id] of data.ids.entries())await sql`UPDATE draft_photographs SET state='ready',display_order=${order},is_cover=${id===data.coverId},updated_at=now() WHERE id=${id} AND draft_id=${draftId}`;
    return collection(sql,draftId,await bump(sql,draftId));
  });
}
export async function removePhoto(userId:string,draftId:string,id:string,version:number):Promise<MediaCollection>{
  return db().begin(async sql=>{
    const current=await locked(sql,userId,draftId);
    if(current!==version)throw new MediaError(409,"Photographs changed. Reload before deleting.");
    const rows=await sql`UPDATE draft_photographs SET state='deleting',is_cover=false,expires_at=now(),updated_at=now() WHERE id=${id} AND draft_id=${draftId} AND state='ready' RETURNING id`;
    if(!rows.length)throw new MediaError(404,"Photograph not found.");
    const remaining=await sql`SELECT id,is_cover FROM draft_photographs WHERE draft_id=${draftId} AND state='ready' ORDER BY display_order,id`;
    await sql`UPDATE draft_photographs SET state='pending',is_cover=false WHERE draft_id=${draftId} AND state='ready'`;
    const cover=remaining.find(row=>row.is_cover)?.id??remaining[0]?.id;
    for(const [order,row] of remaining.entries())await sql`UPDATE draft_photographs SET state='ready',display_order=${order},is_cover=${row.id===cover},updated_at=now() WHERE id=${row.id} AND draft_id=${draftId}`;
    return collection(sql,draftId,await bump(sql,draftId));
  });
}
export async function retrievePhoto(userId:string,draftId:string,id:string,storage:PrivateStorage=privateStorage()){
  await authorizeMedia(userId,draftId);
  const [row]=await db()`SELECT storage_key,byte_size FROM draft_photographs WHERE id=${id} AND draft_id=${draftId} AND state='ready'`;
  if(!row)throw new MediaError(404,"Photograph not found.");
  const bytes=await storage.get(row.storage_key);
  // Recheck after I/O: suspension/deletion during retrieval must fail closed.
  await authorizeMedia(userId,draftId);
  const stillReady=await db()`SELECT id FROM draft_photographs WHERE id=${id} AND draft_id=${draftId} AND state='ready'`;
  if(!stillReady.length)throw new MediaError(404,"Photograph not found.");
  if(bytes.length!==row.byte_size)throw new Error("Private image size mismatch");
  return bytes;
}

/** Bounded, retryable reclamation. Durable records survive draft/account deletion. */
export async function cleanupMedia(storage:PrivateStorage=privateStorage(),limit=20){
  const rows=await db()`SELECT id FROM draft_photographs WHERE
    (draft_id IS NULL OR owner_id IS NULL OR state='deleting' OR (state='pending' AND expires_at<now())) AND state<>'deleted'
    ORDER BY expires_at,id LIMIT ${Math.min(100,Math.max(1,limit))}`;
  let removed=0;
  for(const candidate of rows){
    try{await db().begin(async sql=>{
      // Same lock order as mutations; object PUT is protected by the account lock.
      const [snapshot]=await sql`SELECT owner_id FROM draft_photographs WHERE id=${candidate.id}`;
      if(snapshot?.owner_id)await sql`SELECT id FROM auth_user WHERE id=${snapshot.owner_id} FOR UPDATE`;
      const [row]=await sql`SELECT * FROM draft_photographs WHERE id=${candidate.id} FOR UPDATE`;
      if(!row||row.state==='deleted'||(row.draft_id&&row.owner_id&&row.state==='ready')||(row.state==='pending'&&row.draft_id&&row.owner_id&&new Date(row.expires_at).getTime()>Date.now()))return;
      await storage.remove(row.storage_key);
      await sql`UPDATE draft_photographs SET state='deleted',is_cover=false,updated_at=now() WHERE id=${row.id}`;removed++;
    });}catch{/* Keep the durable record for a later bounded retry. */}
  }
  // Orphaned tombstones have no identity to protect; retained owner receipts stay bounded.
  await db()`DELETE FROM draft_photographs WHERE id IN (SELECT id FROM draft_photographs WHERE state='deleted' AND owner_id IS NULL LIMIT 100)`;
  return removed;
}