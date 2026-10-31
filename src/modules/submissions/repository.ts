import { createHash } from "node:crypto";
import type postgres from "postgres";
import { db } from "../../lib/db";
import { privateStorage, type PrivateStorage } from "../draft-media/storage";
import { draftContentSchema } from "../listing-drafts/validation";
import { actionSchema, canResubmit, POLICY_VERSION, submissionReadiness, submitSchema, type Submission, type SubmissionEvent, type SubmissionState, type SubmittedPhoto } from "./validation";

export class SubmissionError extends Error {constructor(public status:number,message:string){super(message);}}
export function photosExpired(submission:Submission){return !!submission.retainUntil&&new Date(submission.retainUntil).getTime()<=Date.now();}
const missing=()=>new SubmissionError(404,"Submission not found.");
function project(row:Record<string,unknown>):Submission{return {id:String(row.id),draftId:String(row.draft_id),userId:String(row.user_id),advertiserId:Number(row.advertiser_id),advertiserName:String(row.advertiser_name),previousId:row.previous_id?String(row.previous_id):null,version:Number(row.version),state:row.state as SubmissionState,createdAt:String(row.created_at),decidedAt:row.decided_at?String(row.decided_at):null,retainUntil:row.retain_until?String(row.retain_until):null,policyVersion:String(row.policy_version),textVersion:Number(row.text_version),mediaVersion:Number(row.media_version),content:draftContentSchema.parse(row.content),photos:row.photos as SubmittedPhoto[]};}
export async function isModerator(userId:string){return (await db()`SELECT 1 FROM account_capabilities c JOIN auth_user u ON u.id=c.user_id WHERE c.user_id=${userId} AND c.capability='moderator' AND u."emailVerified"`).length>0;}
async function moderator(sql:postgres.TransactionSql,userId:string){
  const rows=await sql`SELECT c.user_id FROM account_capabilities c JOIN auth_user u ON u.id=c.user_id WHERE c.user_id=${userId} AND c.capability='moderator' AND u."emailVerified" FOR SHARE OF c`;
  if(!rows.length)throw new SubmissionError(403,"Moderator access required.");
}
async function owner(sql:postgres.TransactionSql,userId:string){
  await sql`SELECT id FROM auth_user WHERE id=${userId} FOR UPDATE`;
  const [profile]=await sql`SELECT p.advertiser_id,a.display_name FROM advertiser_profiles p JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id) WHERE p.user_id=${userId} AND p.status='active' AND NOT a.is_demo FOR UPDATE OF p,a`;
  if(!profile)throw new SubmissionError(403,"An active advertiser profile is required.");
  return profile;
}
export async function submissionBudget(userId:string){
  const rows=await db()`INSERT INTO submission_write_limits(user_id,attempts) VALUES (${userId},1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN submission_write_limits.started_at<now()-interval '1 minute' THEN 1 ELSE submission_write_limits.attempts+1 END,started_at=CASE WHEN submission_write_limits.started_at<now()-interval '1 minute' THEN now() ELSE submission_write_limits.started_at END WHERE submission_write_limits.started_at<now()-interval '1 minute' OR submission_write_limits.attempts<30 RETURNING user_id`;
  if(!rows.length)throw new SubmissionError(429,"Too many review actions. Wait a minute and try again.");
}
export async function submitDraft(userId:string,input:unknown):Promise<Submission>{
  const data=submitSchema.parse(input),hash=createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return db().begin(async sql=>{
    const profile=await owner(sql,userId);
    const [receipt]=await sql`SELECT * FROM listing_submissions WHERE user_id=${userId} AND request_id=${data.requestId}`;
    if(receipt){if(receipt.request_hash!==hash)throw new SubmissionError(409,"Submission request key already used for different information.");return project(receipt);}
    const [count]=await sql`SELECT count(*)::int AS n FROM listing_submissions WHERE user_id=${userId}`;
    if(count.n>=1000)throw new SubmissionError(409,"Submission history limit reached. Contact the operator.");
    const [draft]=await sql`SELECT * FROM listing_drafts WHERE id=${data.draftId} AND user_id=${userId} AND advertiser_id=${profile.advertiser_id} FOR UPDATE`;
    if(!draft)throw missing();
    await sql`INSERT INTO draft_media_state(draft_id) VALUES (${data.draftId}) ON CONFLICT DO NOTHING`;
    const [media]=await sql`SELECT version FROM draft_media_state WHERE draft_id=${data.draftId} FOR UPDATE`;
    if(draft.version!==data.version||media.version!==data.mediaVersion)throw new SubmissionError(409,"Draft details or photographs changed. Reload and review before submitting.");
    const [previous]=await sql`SELECT id,state FROM listing_submissions WHERE draft_id=${data.draftId} ORDER BY created_at DESC,id DESC LIMIT 1`;
    if(!canResubmit(previous?.state))throw new SubmissionError(409,"Resolve or withdraw the pending review first. Approved and rejected drafts cannot be reopened.");
    const pending=await sql`SELECT id FROM draft_photographs WHERE draft_id=${data.draftId} AND state='pending'`;
    if(pending.length)throw new SubmissionError(409,"Finish pending photo uploads or run cleanup before submitting.");
    const photos=await sql`SELECT * FROM draft_photographs WHERE draft_id=${data.draftId} AND state='ready' ORDER BY display_order,id FOR UPDATE`;
    const content=draftContentSchema.parse(draft.content),issues=submissionReadiness(content,photos.length);
    if(issues.length)throw new SubmissionError(422,issues.map(issue=>issue.message).join(" "));
    const snapshot:SubmittedPhoto[]=photos.map(row=>({id:row.id,key:row.storage_key,width:row.width,height:row.height,size:row.byte_size,cover:row.is_cover,order:row.display_order}));
    const [row]=await sql`INSERT INTO listing_submissions(draft_id,user_id,advertiser_id,advertiser_name,request_id,request_hash,previous_id,category,content,photos,policy_version,text_version,media_version) VALUES (${draft.id},${userId},${profile.advertiser_id},${profile.display_name},${data.requestId},${hash},${previous?.id??null},${content.category},${sql.json(content)},${sql.json(snapshot)},${POLICY_VERSION},${draft.version},${media.version}) RETURNING *`;
    await sql`INSERT INTO submission_events(submission_id,actor_id,state,reason,version) VALUES (${row.id},${userId},'pending','Submitted for human review',1)`;
    return project(row);
  });
}
export async function ownSubmissions(userId:string):Promise<Submission[]>{
  return db().begin(async sql=>{await owner(sql,userId);return (await sql`SELECT * FROM listing_submissions WHERE user_id=${userId} ORDER BY created_at DESC,id DESC LIMIT 1000`).map(project);});
}
export async function reviewQueue(userId:string,page=1):Promise<Submission[]>{
  if(!Number.isInteger(page)||page<1||page>10000)throw new SubmissionError(400,"Invalid page.");
  return db().begin(async sql=>{await moderator(sql,userId);return (await sql`SELECT * FROM listing_submissions WHERE state='pending' AND user_id<>${userId} ORDER BY created_at,id LIMIT 25 OFFSET ${(page-1)*25}`).map(project);});
}
export async function readSubmission(userId:string,id:string,review=false):Promise<{submission:Submission;events:SubmissionEvent[]}>{
  return db().begin(async sql=>{
    if(review)await moderator(sql,userId);else await owner(sql,userId);
    const [row]=review?await sql`SELECT * FROM listing_submissions WHERE id=${id} AND user_id<>${userId}`:await sql`SELECT * FROM listing_submissions WHERE id=${id} AND user_id=${userId}`;
    if(!row)throw missing();
    const events=await sql`SELECT * FROM submission_events WHERE submission_id=${id} ORDER BY version`;
    return {submission:project(row),events:events.map(event=>({id:String(event.id),actorId:event.actor_id,previousState:event.previous_state,state:event.state,reason:event.reason,createdAt:String(event.created_at),version:event.version}))};
  });
}
function retentionDays(state:SubmissionState){
  const key=state==="approved"?"SUBMISSION_APPROVED_RETENTION_DAYS":"SUBMISSION_TERMINAL_RETENTION_DAYS";
  const value=Number(process.env[key]??(state==="approved"?90:30));
  if(!Number.isInteger(value)||value<1||value>(state==="approved"?90:365))throw new Error("Invalid submission retention configuration");
  return value;
}
export async function decideSubmission(userId:string,id:string,input:unknown):Promise<Submission>{
  const data=actionSchema.parse(input),withdraw=data.decision==="withdrawn";
  return db().begin(async sql=>{
    if(withdraw)await owner(sql,userId);else await moderator(sql,userId);
    const [row]=await sql`SELECT * FROM listing_submissions WHERE id=${id} FOR UPDATE`;
    if(!row||(withdraw?row.user_id!==userId:row.user_id===userId))throw missing();
    // Identical retries return the recorded outcome; different or stale decisions never overwrite it.
    const [event]=await sql`SELECT * FROM submission_events WHERE submission_id=${id} AND version=${data.version+1}`;
    if(event&&event.actor_id===userId&&event.state===data.decision&&event.reason===data.reason)return project(row);
    if(row.state!=="pending"||row.version!==data.version)throw new SubmissionError(409,"This review has already changed. Reload to see the recorded outcome.");
    await sql`INSERT INTO submission_events(submission_id,actor_id,previous_state,state,reason,version,retention_days) VALUES (${id},${userId},'pending',${data.decision},${data.reason},${data.version+1},${retentionDays(data.decision)})`;
    return project((await sql`SELECT * FROM listing_submissions WHERE id=${id}`)[0]);
  });
}
export async function submittedPhoto(userId:string,id:string,photoId:string,review=false,storage:PrivateStorage=privateStorage()){
  const {submission}=await readSubmission(userId,id,review);
  if(submission.retainUntil&&new Date(submission.retainUntil).getTime()<=Date.now())throw new SubmissionError(410,"Photograph retention period has expired.");
  const photo=submission.photos.find(image=>image.id===photoId);if(!photo)throw missing();
  const bytes=await storage.get(photo.key);
  const current=await readSubmission(userId,id,review);
  if(current.submission.retainUntil&&new Date(current.submission.retainUntil).getTime()<=Date.now())throw new SubmissionError(410,"Photograph retention period has expired.");
  if(bytes.length!==photo.size)throw new Error("Submitted image size mismatch");
  return bytes;
}