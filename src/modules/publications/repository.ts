import { createHash } from "node:crypto";
import sharp from "sharp";
import type postgres from "postgres";
import { db } from "../../lib/db";
import { privateStorage, type PrivateStorage } from "../draft-media/storage";
import { draftContentSchema } from "../listing-drafts/validation";
import type { SubmittedPhoto } from "../submissions/validation";
import { publicationAction, publicationBlockers, publicDisclosures, publicPhotoPath, resolveLocation, type CanonicalLocation, type Publication } from "./validation";

export class PublicationError extends Error{constructor(public status:number,message:string){super(message);}}
const notFound=()=>new PublicationError(404,"Publication not found.");
type Sql=postgres.TransactionSql;
export async function isPublisher(userId:string){return (await db()`SELECT 1 FROM account_capabilities c JOIN auth_user u ON u.id=c.user_id WHERE c.user_id=${userId} AND c.capability='publisher' AND u."emailVerified"`).length>0;}
async function authorize(sql:Sql,userId:string){
  if(!(await sql`SELECT c.user_id FROM account_capabilities c JOIN auth_user u ON u.id=c.user_id WHERE c.user_id=${userId} AND c.capability='publisher' AND u."emailVerified" FOR SHARE OF c`).length)throw new PublicationError(403,"Publishing operator access required.");
}
async function locations(sql:Sql):Promise<CanonicalLocation[]>{return sql<CanonicalLocation[]>`SELECT l.id,c.name AS city,l.locality,l.pin_code AS "pinCode" FROM locations l JOIN cities c ON c.id=l.city_id ORDER BY l.id`;}
function project(row:Record<string,unknown>):Publication{return {id:String(row.id),submissionId:String(row.submission_id),listingId:row.listing_id===null?null:Number(row.listing_id),state:row.state as Publication["state"]};}
async function eligibility(sql:Sql,userId:string,id:string){
  const [s]=await sql`SELECT * FROM listing_submissions WHERE id=${id}`;
  if(!s)throw notFound();
  if(s.user_id===userId)throw new PublicationError(403,"Advertisers cannot publish their own submissions.");
  const content=draftContentSchema.parse(s.content),canonical=await locations(sql),blockers=publicationBlockers(content,canonical);
  if(s.state!=="approved")blockers.unshift("A specifically approved submission is required.");
  const approval=await sql`SELECT 1 FROM submission_events WHERE submission_id=${id} AND state='approved' AND version=${s.version}`;
  if(!approval.length)blockers.push("An intact approval audit record is required.");
  if(!s.retain_until||new Date(s.retain_until).getTime()<=Date.now())blockers.push("Approval/photo-retention period has expired; renewed review is required.");
  const active=await sql`SELECT p.advertiser_id FROM advertiser_profiles p JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id) WHERE p.user_id=${s.user_id} AND p.advertiser_id=${s.advertiser_id} AND p.status='active' AND NOT a.is_demo`;
  if(!active.length)blockers.push("The originating advertiser must still have an active non-demo profile.");
  const photos=s.photos as SubmittedPhoto[];
  if(!photos.length||photos.filter(p=>p.cover).length!==1||new Set(photos.map(p=>p.id)).size!==photos.length)blockers.push("Snapshot photographs or cover are invalid.");
  return {s,content,canonical,blockers,photos};
}
export async function publicationPreview(userId:string,id:string){
  return db().begin(async sql=>{
    await authorize(sql,userId);const result=await eligibility(sql,userId,id);
    const [p]=await sql`SELECT * FROM listing_publications WHERE submission_id=${id}`;
    const events=p?await sql`SELECT actor_id AS "actorId",action,reason,created_at AS "createdAt",previous_state AS "previousState",resulting_state AS "resultingState" FROM publication_events WHERE publication_id=${p.id} ORDER BY id`:[];
    return {submissionId:id,title:result.content.advertisement.title,content:result.content,advertiserName:result.s.advertiser_name,approvedAt:String(result.s.decided_at),photos:result.photos.map(p=>({id:p.id,width:p.width,height:p.height,cover:p.cover,order:p.order})),blockers:result.blockers,publication:p?project(p):null,events};
  });
}
export async function publicationQueue(userId:string,page=1){
  if(!Number.isInteger(page)||page<1||page>10000)throw new PublicationError(400,"Invalid page.");
  return db().begin(async sql=>{await authorize(sql,userId);return sql`SELECT s.id,s.content->'advertisement'->>'title' AS title,s.category,s.content->'property'->>'city' AS city,s.content->'property'->>'locality' AS locality,s.advertiser_name AS "advertiserName",s.decided_at AS "approvedAt",p.state,p.listing_id AS "listingId" FROM listing_submissions s LEFT JOIN listing_publications p ON p.submission_id=s.id WHERE s.state='approved' AND s.user_id<>${userId} ORDER BY s.decided_at DESC,s.id LIMIT 25 OFFSET ${(page-1)*25}`;});
}
export async function publicationBudget(userId:string){
  const rows=await db()`INSERT INTO submission_write_limits(user_id,attempts) VALUES (${userId},1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN submission_write_limits.started_at<now()-interval '1 minute' THEN 1 ELSE submission_write_limits.attempts+1 END,started_at=CASE WHEN submission_write_limits.started_at<now()-interval '1 minute' THEN now() ELSE submission_write_limits.started_at END WHERE submission_write_limits.started_at<now()-interval '1 minute' OR submission_write_limits.attempts<30 RETURNING user_id`;
  if(!rows.length)throw new PublicationError(429,"Too many operator actions. Wait a minute.");
}
async function lockSource(sql:Sql,userId:string,id:string){
  // Account first matches private media cleanup/mutation lock order and protects source objects during copy.
  const [identity]=await sql`SELECT user_id FROM listing_submissions WHERE id=${id}`;if(!identity)throw notFound();
  await sql`SELECT id FROM auth_user WHERE id=${identity.user_id} FOR UPDATE`;
  await authorize(sql,userId);
  await sql`SELECT id FROM listing_submissions WHERE id=${id} FOR UPDATE`;
}
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
async function validatePhoto(bytes:Buffer,photo:SubmittedPhoto){
  if(bytes.length!==photo.size)throw new PublicationError(409,"A submitted photograph has changed or is unavailable.");
  const metadata=await sharp(bytes,{limitInputPixels:2560*2560}).metadata();
  if(metadata.format!=="webp"||metadata.width!==photo.width||metadata.height!==photo.height||metadata.exif||metadata.xmp||metadata.iptc||(metadata.pages??1)!==1)throw new PublicationError(409,"Submitted photograph is not a valid processed representation.");
}
/** Durable reservations precede object I/O. Retrying the same submission resumes the same identities. */
export async function publishSubmission(userId:string,id:string,input:unknown,storage:PrivateStorage=privateStorage()):Promise<Publication>{
  const action=publicationAction.parse(input);if(action.action!=="publish")throw new PublicationError(400,"Invalid action.");
  const reservation=await db().begin(async sql=>{
    await lockSource(sql,userId,id);
    const [existing]=await sql`SELECT * FROM listing_publications WHERE submission_id=${id} FOR UPDATE`;
    if(existing?.state==='published')return project(existing);
    if(existing?.state==='unpublished')throw new PublicationError(409,"Republishing is deferred. This publication is terminal.");
    const result=await eligibility(sql,userId,id);if(result.blockers.length)throw new PublicationError(422,result.blockers.join(" "));
    const [p]=existing?[existing]:await sql`INSERT INTO listing_publications(submission_id,draft_id) VALUES (${id},${result.s.draft_id}) RETURNING *`;
    await sql`UPDATE listing_publications SET lease_until=now()+interval '1 hour' WHERE id=${p.id}`;
    await sql`UPDATE publication_media SET removed_at=NULL WHERE publication_id=${p.id}`;
    for(const photo of result.photos)await sql`INSERT INTO publication_media(publication_id,photo_id,storage_key,byte_size) VALUES (${p.id},${photo.id},${`publications/${p.id}/${photo.id}.webp`},${photo.size}) ON CONFLICT DO NOTHING`;
    return project(p);
  });
  if(reservation.state==='published')return reservation;
  // Hold source/account and publication locks through bounded I/O: cleanup and competing publication cannot race it.
  return db().begin(async sql=>{
    await lockSource(sql,userId,id);
    const [p]=await sql`SELECT * FROM listing_publications WHERE id=${reservation.id} FOR UPDATE`;
    if(p.state==='published')return project(p);
    if(p.state!=='preparing')throw new PublicationError(409,"Publication is no longer pending.");
    const [source]=await sql`SELECT advertiser_id FROM listing_submissions WHERE id=${id}`;
    await sql`SELECT p.advertiser_id FROM advertiser_profiles p JOIN advertisers a ON a.id=p.advertiser_id WHERE p.advertiser_id=${source.advertiser_id} FOR SHARE OF p,a`;
    const result=await eligibility(sql,userId,id);if(result.blockers.length)throw new PublicationError(422,result.blockers.join(" "));
    const {content:c,s,photos}=result;
    await sql`SELECT advertiser_id FROM advertiser_profiles WHERE advertiser_id=${s.advertiser_id} AND status='active' FOR SHARE`;
    for(const photo of photos){
      const [media]=await sql`SELECT * FROM publication_media WHERE publication_id=${p.id} AND photo_id=${photo.id}`;
      let bytes:Buffer;try{bytes=await storage.get(photo.key);}catch{throw new PublicationError(409,"Submitted photograph unavailable. Retry after restoring storage; do not publish a different draft.");}
      await validatePhoto(bytes,photo);const digest=hash(bytes);
      let promoted:Buffer|undefined;try{promoted=await storage.get(media.storage_key);}catch{/* A reserved object may not yet exist. */}
      if(promoted){if(hash(promoted)!==digest)throw new PublicationError(409,"Public copy integrity mismatch. Operator reconciliation required.");}
      else await storage.put(media.storage_key,bytes);
      const verified=await storage.get(media.storage_key);if(hash(verified)!==digest)throw new PublicationError(409,"Public copy verification failed.");
      await sql`UPDATE publication_media SET checksum=${digest} WHERE publication_id=${p.id} AND photo_id=${photo.id}`;
    }
    // Recheck permission/expiry after I/O and before visibility. No working-draft reads occur.
    await authorize(sql,userId);
    if(new Date(s.retain_until).getTime()<=Date.now())throw new PublicationError(409,"Approval expired during publication.");
    const location=resolveLocation(c,result.canonical)!;
    await sql`SELECT id FROM locations WHERE id=${location.id} FOR SHARE`;
    const [property]=await sql`INSERT INTO properties(location_id,building,address_line,property_type,is_demo) VALUES (${location.id},${c.property.building!},${c.property.address!},${c.property.propertyType!},false) RETURNING id`;
    const room=c.category==='flatshares',unitKind=room?'room':'entire-home';
    const [unit]=await sql`INSERT INTO units(property_id,kind,label,bhk,carpet_sqft,furnishing,household_size,house_rules) VALUES (${property.id},${unitKind},${room?`${c.unit.bedroom} bedroom`:`${c.unit.bhk} BHK`},${c.category==='flatshares'?null:c.unit.bhk!},${c.category==='flatshares'?null:c.unit.carpetSqft!},${c.unit.furnishing!},${c.category==='flatshares'?c.unit.occupants!:null},${c.category==='flatshares'?c.unit.houseRules??null:null}) RETURNING id`;
    const [listing]=await sql`INSERT INTO listings(unit_id,unit_kind,advertiser_id,category,title,description,price,deposit,maintenance,brokerage,available_from,is_demo,status,advertiser_name,declared_relationship,public_details) VALUES (${unit.id},${unitKind},${s.advertiser_id},${c.category},${c.advertisement.title!},${c.advertisement.description!},${c.category==='buy'?c.advertisement.askingPrice!:c.advertisement.monthlyRent!},${c.category==='buy'?null:c.advertisement.deposit!},${c.category==='buy'?null:c.advertisement.maintenance!},${c.advertisement.brokerage!},${c.category==='buy'?null:c.advertisement.availableFrom!},false,'published',${s.advertiser_name},${c.relationship!},${sql.json(publicDisclosures(c))}) RETURNING id`;
    for(const photo of photos)await sql`INSERT INTO property_images(property_id,unit_id,path,alt,sort_order,is_cover) VALUES (${property.id},${unit.id},${publicPhotoPath(p.id,photo.id)},${`Advertiser-supplied property photograph ${photo.order+1}`},${photo.order},${photo.cover})`;
    for(const name of c.property.amenities??[]){const [amenity]=await sql`INSERT INTO amenities(name) VALUES (${name}) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id`;await sql`INSERT INTO property_amenities(property_id,amenity_id) VALUES (${property.id},${amenity.id})`;}
    const [published]=await sql`UPDATE listing_publications SET state='published',listing_id=${listing.id} WHERE id=${p.id} RETURNING *`;
    await sql`INSERT INTO publication_events(publication_id,submission_id,listing_id,actor_id,action,previous_state,resulting_state,reason) VALUES (${p.id},${id},${listing.id},${userId},'publish','preparing','published',${action.reason})`;
    return project(published);
  });
}
export async function unpublishSubmission(userId:string,id:string,input:unknown):Promise<Publication>{
  const action=publicationAction.parse(input);if(action.action!=="unpublish")throw new PublicationError(400,"Invalid action.");
  return db().begin(async sql=>{
    await lockSource(sql,userId,id);
    const [p]=await sql`SELECT * FROM listing_publications WHERE submission_id=${id} FOR UPDATE`;
    if(!p||p.state==='preparing')throw notFound();
    const [s]=await sql`SELECT user_id FROM listing_submissions WHERE id=${id}`;if(s.user_id===userId)throw new PublicationError(403,"Independent publishing operator required.");
    if(p.state==='unpublished')return project(p);
    await sql`UPDATE listings SET status='archived' WHERE id=${p.listing_id} AND NOT is_demo`;
    const [updated]=await sql`UPDATE listing_publications SET state='unpublished' WHERE id=${p.id} RETURNING *`;
    await sql`INSERT INTO publication_events(publication_id,submission_id,listing_id,actor_id,action,previous_state,resulting_state,reason) VALUES (${p.id},${id},${p.listing_id},${userId},'unpublish','published','unpublished',${action.reason})`;
    return project(updated);
  });
}
export async function publisherPhoto(userId:string,id:string,photoId:string,storage:PrivateStorage=privateStorage()){
  const preview=await publicationPreview(userId,id),photo=preview.photos.find(p=>p.id===photoId);if(!photo)throw notFound();
  const [s]=await db()`SELECT photos,retain_until FROM listing_submissions WHERE id=${id}`;
  if(new Date(s.retain_until).getTime()<=Date.now())throw new PublicationError(410,"Submitted photographs expired.");
  const source=(s.photos as SubmittedPhoto[]).find(p=>p.id===photoId)!;
  const bytes=await storage.get(source.key);await validatePhoto(bytes,source);await publicationPreview(userId,id);
  if(new Date(s.retain_until).getTime()<=Date.now())throw new PublicationError(410,"Submitted photographs expired.");return bytes;
}
export async function publicPhoto(publicationId:string,photoId:string,storage:PrivateStorage=privateStorage()){
  const read=()=>db()`SELECT m.storage_key,m.byte_size,m.checksum FROM publication_media m JOIN listing_publications p ON p.id=m.publication_id JOIN listings l ON l.id=p.listing_id WHERE m.publication_id=${publicationId} AND m.photo_id=${photoId} AND p.state='published' AND l.status='published' AND NOT l.is_demo`;
  const [media]=await read();if(!media)throw notFound();const bytes=await storage.get(media.storage_key);
  if(!(await read()).length)throw notFound();if(bytes.length!==media.byte_size||hash(bytes)!==media.checksum)throw new Error("Public image integrity mismatch");return bytes;
}
/** Durable media rows survive failed attempts; only expired preparations/unpublished copies are reclaimable. */
export async function cleanupPublicMedia(storage:PrivateStorage=privateStorage(),limit=20){
  const rows=await db()`SELECT id,submission_id FROM listing_publications p WHERE ((state='preparing' AND lease_until<now()) OR state='unpublished') AND EXISTS(SELECT 1 FROM publication_media m WHERE m.publication_id=p.id AND m.removed_at IS NULL) ORDER BY updated_at,id LIMIT ${Math.max(1,Math.min(limit,100))}`;
  let removed=0;
  for(const candidate of rows)try{await db().begin(async sql=>{
    const [s]=await sql`SELECT user_id FROM listing_submissions WHERE id=${candidate.submission_id}`;await sql`SELECT id FROM auth_user WHERE id=${s.user_id} FOR UPDATE`;
    const [p]=await sql`SELECT * FROM listing_publications WHERE id=${candidate.id} FOR UPDATE`;
    if(p.state==='published'||(p.state==='preparing'&&new Date(p.lease_until).getTime()>Date.now()))return;
    const media=await sql`SELECT storage_key FROM publication_media WHERE publication_id=${p.id} AND removed_at IS NULL`;
    for(const photo of media){await storage.remove(photo.storage_key);await sql`UPDATE publication_media SET removed_at=now() WHERE storage_key=${photo.storage_key}`;removed++;}
  });}catch{/* Durable identity remains available for bounded retry. */}
  return removed;
}
export async function advertiserPublications(userId:string){return db()`SELECT p.submission_id AS "submissionId",p.listing_id AS "listingId",p.state FROM listing_publications p JOIN listing_submissions s ON s.id=p.submission_id WHERE s.user_id=${userId} AND p.state<>'preparing'`;}