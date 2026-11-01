import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { parseFilters } from "../src/modules/search/filters";
import { getListing, searchListings } from "../src/modules/listings/repository";
import { savedCollection, savedListingIds, setSavedListing } from "../src/modules/saved-listings/repository";
import { advertiserProfile,saveAdvertiserProfile } from "../src/modules/advertisers/repository";
import { canEditAdvertiserProfile,isAccountAdvertiserForListing,canManageListing,canPublishListing } from "../src/modules/advertisers/authorization";
import { updateProfile } from "../src/modules/accounts/repository";
import {createDraft,deleteDraft,readDraft,listDrafts,updateDraft,draftEligibility} from "../src/modules/listing-drafts/repository";
import {emptyDraft} from "../src/modules/listing-drafts/validation";
import {updateDemoImages} from "../scripts/demo-images";
import {demoImageGroups} from "../src/modules/listings/demo-images";
import sharp from "sharp";
import { mkdtemp,rm,access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalPrivateStorage,type PrivateStorage } from "../src/modules/draft-media/storage";
import { uploadPhoto,listMedia,retrievePhoto,removePhoto,arrangeMedia,cleanupMedia } from "../src/modules/draft-media/repository";
import { submitDraft, readSubmission, decideSubmission, submittedPhoto, reviewQueue, ownSubmissions } from "../src/modules/submissions/repository";
import { publishSubmission,unpublishSubmission,publicationPreview,publicationQueue,publicPhoto,publisherPhoto,cleanupPublicMedia,isPublisher } from "../src/modules/publications/repository";
beforeAll(() => {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, seeded test database.");
  if (process.env.TEST_DATABASE_URL===process.env.DATABASE_URL) throw new Error("Test database must be separate from application database.");
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
});

describe("controlled approved-snapshot publication",()=>{
  const owner=`publication-owner-${crypto.randomUUID()}`,moderator=`publication-moderator-${crypto.randomUUID()}`,operator=`publication-operator-${crypto.randomUUID()}`,viewer=`publication-viewer-${crypto.randomUUID()}`;
  let root:string,storage:LocalPrivateStorage,bytes:Buffer,locality:{city:string;locality:string;pinCode:string};
  const action={action:"publish",reason:"Operator checked exact approved snapshot and public address"};
  const makeContent=(category:"rent"|"buy"|"flatshares"="rent")=>({category,relationship:"owner",property:{...locality,building:"Synthetic publication test building",address:"Synthetic test street",propertyType:"apartment",amenities:["Lift","Water supply"]},unit:category==='flatshares'?{bedroom:"shared",occupants:2,furnishing:"furnished",householdInfo:"Quiet test household"}:category==='buy'?{bhk:3,carpetSqft:1200,furnishing:"semi-furnished",propertyAge:5,projectInfo:"Synthetic project"}:{bhk:2,carpetSqft:900,furnishing:"furnished",bathrooms:2},advertisement:{title:`Publication ${crypto.randomUUID()}`,description:"A spacious synthetic test home with excellent natural light and convenient access to local shops.",brokerage:0,brokerageTerms:"No brokerage",...(category==='buy'?{askingPrice:10000000}:{monthlyRent:30000,deposit:0,maintenance:0,availableFrom:"2026-11-01",...(category==='flatshares'?{utilities:1500,utilityTerms:"Shared equally"}:{})})}});
  const prepare=async(category:"rent"|"buy"|"flatshares"="rent",approve=true,incomplete=false)=>{
    const content=makeContent(category);if(incomplete)content.property.building="";
    const draft=await createDraft(owner,{requestId:crypto.randomUUID(),content});
    await uploadPhoto(owner,draft.id,crypto.randomUUID(),bytes,storage);
    const uploaded=await uploadPhoto(owner,draft.id,crypto.randomUUID(),await sharp({create:{width:70,height:45,channels:3,background:"#6747ff"}}).png().toBuffer(),storage);
    const media=await arrangeMedia(owner,draft.id,{version:uploaded.version,ids:uploaded.images.map(p=>p.id),coverId:uploaded.images[1].id});
    const submission=await submitDraft(owner,{requestId:crypto.randomUUID(),draftId:draft.id,version:1,mediaVersion:media.version});
    if(approve)await decideSubmission(moderator,submission.id,{version:1,decision:"approved",reason:"Synthetic test review confirms completeness"});
    return {draft,submission,content,media};
  };
  beforeAll(async()=>{
    root=await mkdtemp(path.join(os.tmpdir(),"scout-publications-"));storage=new LocalPrivateStorage(root);bytes=await sharp({create:{width:80,height:50,channels:3,background:"#c7f75d"}}).png().toBuffer();
    [locality]=await db()`SELECT c.name AS city,l.locality,l.pin_code AS "pinCode" FROM locations l JOIN cities c ON c.id=l.city_id WHERE c.name='Bengaluru' ORDER BY l.id LIMIT 1`;
    for(const id of [owner,moderator,operator,viewer])await db()`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES (${id},'Publication test',${id+'@example.test'},true)`;
    await saveAdvertiserProfile(owner,{displayName:"Approved snapshot advertiser",type:"owner",primaryCity:"Bengaluru",description:"Private profile details never public"});
    await db()`INSERT INTO account_capabilities(user_id,capability) VALUES (${moderator},'moderator'),(${operator},'publisher'),(${owner},'publisher')`;
  });
  afterAll(async()=>{
    const pending=await db()`SELECT id,version FROM listing_submissions WHERE user_id=${owner} AND state='pending'`;for(const s of pending)await decideSubmission(owner,s.id,{version:s.version,decision:"withdrawn",reason:"Synthetic publication fixture cleanup"});
    const live=await db()`SELECT p.submission_id FROM listing_publications p JOIN listing_submissions s ON s.id=p.submission_id WHERE s.user_id=${owner} AND p.state='published'`;for(const p of live)await unpublishSubmission(operator,p.submission_id,{action:"unpublish",reason:"Synthetic publication fixture cleanup"});
    await cleanupPublicMedia(storage,100);await cleanupMedia(storage,100);await rm(root,{recursive:true,force:true});
    // Immutable publication/audit linkage intentionally retains its synthetic originating account.
    await db()`DELETE FROM auth_user WHERE id IN (${moderator},${operator},${viewer})`;
    await db()`DELETE FROM account_capabilities WHERE user_id=${owner}`;
  });
  it("requires independent explicit publishing authority, not moderator/profile status",async()=>{
    const {submission}=await prepare();expect(await isPublisher(moderator)).toBe(false);
    await expect(publicationQueue(moderator)).rejects.toMatchObject({status:403});
    await expect(publishSubmission(moderator,submission.id,action,storage)).rejects.toMatchObject({status:403});
    await expect(publishSubmission(owner,submission.id,action,storage)).rejects.toMatchObject({status:403});
    await expect(publishSubmission(operator,crypto.randomUUID(),action,storage)).rejects.toMatchObject({status:404});
    const preview=await publicationPreview(operator,submission.id);expect(preview.blockers).toEqual([]);expect(JSON.stringify(preview)).not.toContain('drafts/');
    expect((await publisherPhoto(operator,submission.id,submission.photos[0].id,storage)).length).toBeGreaterThan(0);
  });
  it("approval alone creates no public record and incomplete snapshots cannot publish",async()=>{
    const {submission}=await prepare();expect(await db()`SELECT id FROM listing_publications WHERE submission_id=${submission.id}`).toHaveLength(0);
    const pending=await prepare("rent",false);await expect(publishSubmission(operator,pending.submission.id,action,storage)).rejects.toMatchObject({status:422});
    const incomplete=await prepare("rent",true,true);expect((await publicationPreview(operator,incomplete.submission.id)).blockers.join(" ")).toContain("building");await expect(publishSubmission(operator,incomplete.submission.id,action,storage)).rejects.toMatchObject({status:422});
  });
  it.each(["rent","buy","flatshares"] as const)("publishes normalized %s, selected cover/order and approved advertiser data only",async category=>{
    const {submission,draft,content}=await prepare(category);
    await updateDraft(owner,draft.id,{version:1,content:{...content,advertisement:{...content.advertisement,title:"NEW PRIVATE WORKING TITLE"}}});
    await saveAdvertiserProfile(owner,{displayName:"Changed private profile",type:"owner",primaryCity:"Bengaluru",description:"Private information"});
    const p=await publishSubmission(operator,submission.id,action,storage);expect(p.state).toBe("published");expect(p.listingId).not.toBeNull();
    const listing=(await getListing(p.listingId!))!;expect(listing.title).toBe(content.advertisement.title);expect(listing.advertiser).toBe(submission.advertiserName);expect(listing.is_demo).toBe(false);expect(listing.declared_relationship).toBe("owner");expect(listing.building).toBe(content.property.building);
    expect(listing.images.map(image=>image.path)).toEqual(submission.photos.map(photo=>`/images/published/${p.id}/${photo.id}`));expect(listing.images.map(image=>image.cover)).toEqual([false,true]);
    expect((await searchListings(parseFilters({category}))).items.some(item=>item.id===p.listingId)).toBe(true);
    for(const photo of submission.photos)expect((await publicPhoto(p.id,photo.id,storage)).length).toBe(photo.size);
    if(category==='buy'){expect(listing.maintenance).toBeNull();expect(listing.public_details).toMatchObject({propertyAge:5,projectInfo:"Synthetic project"});}
    if(category==='flatshares')expect(listing.public_details).toMatchObject({bedroom:"shared",utilities:1500,householdInfo:"Quiet test household"});
    expect((await readSubmission(owner,submission.id)).submission.state).toBe("approved");
    expect(await cleanupPublicMedia(storage,100)).toBe(0);expect((await publicPhoto(p.id,submission.photos[0].id,storage)).length).toBeGreaterThan(0);
  });
  it("serializes concurrent operators and repeated requests into one stable public identity",async()=>{
    const {submission}=await prepare();await db()`INSERT INTO account_capabilities(user_id,capability) VALUES (${moderator},'publisher')`;
    const result=await Promise.all([publishSubmission(operator,submission.id,action,storage),publishSubmission(moderator,submission.id,action,storage),publishSubmission(operator,submission.id,action,storage)]);expect(new Set(result.map(p=>p.listingId)).size).toBe(1);
    expect(await db()`SELECT id FROM listing_publications WHERE submission_id=${submission.id}`).toHaveLength(1);expect(await db()`SELECT id FROM publication_events WHERE publication_id=${result[0].id}`).toHaveLength(1);
    await db()`DELETE FROM account_capabilities WHERE user_id=${moderator} AND capability='publisher'`;
  });
  it("resumes partial media promotion without visibility or duplicate public rows",async()=>{
    const {submission}=await prepare();let puts=0;const failing:PrivateStorage={get:key=>storage.get(key),remove:key=>storage.remove(key),put:async(key,value)=>{puts++;if(puts===2)throw Error("Storage outage");await storage.put(key,value);}};
    const before=(await db()`SELECT count(*)::int AS n FROM listings`)[0].n;
    await expect(publishSubmission(operator,submission.id,action,failing)).rejects.toThrow("Storage outage");
    const [p]=await db()`SELECT * FROM listing_publications WHERE submission_id=${submission.id}`;expect(p.state).toBe("preparing");expect(p.listing_id).toBeNull();expect((await db()`SELECT count(*)::int AS n FROM listings`)[0].n).toBe(before);
    await expect(publicPhoto(p.id,submission.photos[0].id,storage)).rejects.toMatchObject({status:404});
    const recovered=await publishSubmission(operator,submission.id,action,storage);expect(recovered.id).toBe(p.id);expect(recovered.state).toBe("published");
  });
  it("rejects unavailable originals and recovers after restoration",async()=>{
    const {submission}=await prepare();const photo=submission.photos[0],original=await storage.get(photo.key);await storage.remove(photo.key);
    await expect(publishSubmission(operator,submission.id,action,storage)).rejects.toMatchObject({status:409});await storage.put(photo.key,original);
    const p=await publishSubmission(operator,submission.id,action,storage);expect(p.state).toBe("published");
  });
  it("rejects expired approval and cleans abandoned copies before retrying the same reservation",async()=>{
    const {submission}=await prepare();
    const approved=(await readSubmission(owner,submission.id)).submission;
    const clock=vi.spyOn(Date,"now").mockReturnValue(new Date(approved.retainUntil!).getTime()+1000);
    try{expect((await publicationPreview(operator,submission.id)).blockers.join(" ")).toContain("expired");await expect(publishSubmission(operator,submission.id,action,storage)).rejects.toMatchObject({status:422});}
    finally{clock.mockRestore();}
    let puts=0;const fail:PrivateStorage={get:key=>storage.get(key),remove:key=>storage.remove(key),put:async(key,value)=>{if(++puts===2)throw Error("Interrupted promotion");await storage.put(key,value);}};
    await expect(publishSubmission(operator,submission.id,action,fail)).rejects.toThrow();const [p]=await db()`SELECT * FROM listing_publications WHERE submission_id=${submission.id}`;
    await db()`UPDATE listing_publications SET lease_until=now()-interval '1 minute' WHERE id=${p.id}`;
    await cleanupPublicMedia(storage,100);await expect(storage.get(`publications/${p.id}/${submission.photos[0].id}.webp`)).rejects.toThrow();
    const recovered=await publishSubmission(operator,submission.id,action,storage);expect(recovered.id).toBe(p.id);expect(recovered.state).toBe("published");
    await expect(db()`UPDATE listing_publications SET state='preparing',listing_id=NULL WHERE id=${p.id}`).rejects.toThrow();
    await expect(db()`UPDATE publication_media SET removed_at=now() WHERE publication_id=${p.id}`).rejects.toThrow();
    await expect(db()`DELETE FROM auth_user WHERE id=${owner}`).rejects.toThrow();
  });
  it("rolls back public records on database failure after object promotion",async()=>{
    const {submission}=await prepare();
    const before=(await db()`SELECT count(*)::int AS n FROM listings`)[0].n;
    // A test-only trigger fails only the exact fixture title after the service has promoted photos.
    // The scoped title condition is embedded through a fixture table, never runtime application SQL.
    await db()`CREATE TABLE IF NOT EXISTS publication_failure_fixture(title text PRIMARY KEY)`;
    await db()`CREATE OR REPLACE FUNCTION fail_publication_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM publication_failure_fixture WHERE title=NEW.title) THEN RAISE EXCEPTION 'Synthetic database failure'; END IF; RETURN NEW; END; $$`;
    await db()`CREATE TRIGGER publication_failure_fixture BEFORE INSERT ON listings FOR EACH ROW EXECUTE FUNCTION fail_publication_fixture()`;
    await db()`INSERT INTO publication_failure_fixture(title) VALUES (${submission.content.advertisement.title!})`;
    try{await expect(publishSubmission(operator,submission.id,action,storage)).rejects.toThrow("Synthetic database failure");expect((await db()`SELECT count(*)::int AS n FROM listings`)[0].n).toBe(before);expect((await db()`SELECT state FROM listing_publications WHERE submission_id=${submission.id}`)[0].state).toBe("preparing");}
    finally{await db()`DROP TRIGGER publication_failure_fixture ON listings`;await db()`DROP FUNCTION fail_publication_fixture()`;await db()`DROP TABLE publication_failure_fixture`;}
    expect((await publishSubmission(operator,submission.id,action,storage)).state).toBe("published");
  });

  it("enforces revoked permissions on subsequent preview, photos and publication actions",async()=>{
    const {submission}=await prepare();await db()`DELETE FROM account_capabilities WHERE user_id=${operator} AND capability='publisher'`;
    try{await expect(publicationPreview(operator,submission.id)).rejects.toMatchObject({status:403});await expect(publisherPhoto(operator,submission.id,submission.photos[0].id,storage)).rejects.toMatchObject({status:403});await expect(publishSubmission(operator,submission.id,action,storage)).rejects.toMatchObject({status:403});}
    finally{await db()`INSERT INTO account_capabilities(user_id,capability) VALUES (${operator},'publisher')`;}
  });
  it("unpublishes idempotently, hides saved details/media and keeps immutable attributed history",async()=>{
    const {submission}=await prepare(),p=await publishSubmission(operator,submission.id,action,storage);expect(await setSavedListing(viewer,p.listingId!,true)).toBe("saved");
    const unpublish={action:"unpublish",reason:"Operator withdrew availability for review"};const result=await Promise.all([unpublishSubmission(operator,submission.id,unpublish),unpublishSubmission(operator,submission.id,unpublish)]);expect(result.every(p=>p.state==='unpublished')).toBe(true);
    expect(await getListing(p.listingId!)).toBeNull();expect((await savedCollection(viewer)).items).not.toContainEqual(expect.objectContaining({id:p.listingId}));await expect(publicPhoto(p.id,submission.photos[0].id,storage)).rejects.toMatchObject({status:404});
    await expect(publishSubmission(operator,submission.id,action,storage)).rejects.toMatchObject({status:409});
    const events=await db()`SELECT * FROM publication_events WHERE publication_id=${p.id} ORDER BY id`;expect(events.map(e=>e.action)).toEqual(["publish","unpublish"]);expect(events.every(e=>e.actor_id===operator&&e.submission_id===submission.id&&e.listing_id===p.listingId)).toBe(true);
    await expect(db()`UPDATE publication_events SET reason='Modified reason' WHERE id=${events[0].id}`).rejects.toThrow();await expect(db()`DELETE FROM publication_events WHERE id=${events[0].id}`).rejects.toThrow();await expect(db()`DELETE FROM listing_publications WHERE id=${p.id}`).rejects.toThrow();
    await cleanupPublicMedia(storage,100);await expect(storage.get(`publications/${p.id}/${submission.photos[0].id}.webp`)).rejects.toThrow();expect((await readSubmission(owner,submission.id)).submission.state).toBe("approved");
    expect((await db()`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);expect((await db()`SELECT count(*)::int AS n FROM advertisers WHERE is_demo`)[0].n).toBe(24);
  });
});

describe("private submission snapshots, human decisions and retention",()=>{
  const userId=`submission-owner-${crypto.randomUUID()}`,modId=`submission-mod-${crypto.randomUUID()}`,otherId=`submission-other-${crypto.randomUUID()}`;
  let root:string,storage:LocalPrivateStorage,bytes:Buffer;
  const content={category:"rent" as const,relationship:"owner" as const,property:{city:"Bengaluru",locality:"Indiranagar",propertyType:"apartment" as const},unit:{bhk:2},advertisement:{title:"Submission integration home",description:"A spacious bright test apartment with ventilation and convenient access to shops and transport.",monthlyRent:30000,deposit:0,maintenance:0,brokerage:0}};
  const prepare=async()=>{
    const draft=await createDraft(userId,{requestId:crypto.randomUUID(),content});
    const media=await uploadPhoto(userId,draft.id,crypto.randomUUID(),bytes,storage);
    return {draft,media,input:{requestId:crypto.randomUUID(),draftId:draft.id,version:draft.version,mediaVersion:media.version}};
  };
  beforeAll(async()=>{
    root=await mkdtemp(path.join(os.tmpdir(),"scout-submissions-"));storage=new LocalPrivateStorage(root);bytes=await sharp({create:{width:60,height:40,channels:3,background:"#6747ff"}}).png().toBuffer();
    for(const id of [userId,modId,otherId])await db()`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES (${id},'Submission test',${id+'@example.test'},true)`;
    await saveAdvertiserProfile(userId,{displayName:"Submission advertiser",type:"owner",primaryCity:"Bengaluru",description:""});
    await saveAdvertiserProfile(otherId,{displayName:"Other advertiser",type:"owner",primaryCity:"Mumbai",description:""});
    await db()`INSERT INTO account_capabilities(user_id,capability) VALUES (${modId},'moderator'),(${userId},'moderator')`;
  });
  afterAll(async()=>{
    const pending=await db()`SELECT id,version FROM listing_submissions WHERE user_id=${userId} AND state='pending'`;
    for(const row of pending)await decideSubmission(userId,row.id,{version:row.version,decision:"withdrawn",reason:"Test fixture withdrawal"});
    await db()`DELETE FROM auth_user WHERE id IN (${userId},${modId},${otherId})`;
    await cleanupMedia(storage,100);await rm(root,{recursive:true,force:true});
  });
  it("rejects incomplete content, no-photo and stale text/media capture atomically",async()=>{
    const incomplete=await createDraft(userId,{requestId:crypto.randomUUID(),content:emptyDraft("rent")});
    await expect(submitDraft(userId,{requestId:crypto.randomUUID(),draftId:incomplete.id,version:1,mediaVersion:1})).rejects.toMatchObject({status:422});
    const {input}=await prepare();
    await expect(submitDraft(userId,{...input,version:2})).rejects.toMatchObject({status:409});
    await expect(submitDraft(userId,{...input,mediaVersion:1})).rejects.toMatchObject({status:409});
    expect(await ownSubmissions(userId)).toHaveLength(0);
  });
  it("concurrent retries are idempotent; another key cannot create a second pending review",async()=>{
    const {input}=await prepare();const submissions=await Promise.all(Array.from({length:4},()=>submitDraft(userId,input)));
    expect(new Set(submissions.map(s=>s.id)).size).toBe(1);
    await expect(submitDraft(userId,{...input,requestId:crypto.randomUUID()})).rejects.toMatchObject({status:409});
    await expect(submitDraft(userId,{...input,version:2})).rejects.toMatchObject({status:409});
    expect((await readSubmission(userId,submissions[0].id)).events).toHaveLength(1);
  });
  it("draft edits and photo deletion leave the exact submitted snapshot and bytes intact",async()=>{
    const {draft,media,input}=await prepare(),submission=await submitDraft(userId,input);
    const before=await submittedPhoto(modId,submission.id,media.images[0].id,true,storage);
    await updateDraft(userId,draft.id,{version:1,content:{...content,advertisement:{...content.advertisement,title:"Changed working draft"}}});
    await removePhoto(userId,draft.id,media.images[0].id,media.version);await cleanupMedia(storage,100);
    expect((await readSubmission(modId,submission.id,true)).submission).toEqual(submission);
    expect(await submittedPhoto(userId,submission.id,media.images[0].id,false,storage)).toEqual(before);
    await expect(retrievePhoto(userId,draft.id,media.images[0].id,storage)).rejects.toThrow();
    await decideSubmission(userId,submission.id,{version:1,decision:"withdrawn",reason:"Changed working draft"});await cleanupMedia(storage,100);
    expect(await submittedPhoto(modId,submission.id,media.images[0].id,true,storage)).toEqual(before);
  });
  it("denies cross-account reads, ordinary moderators, and self-review; revocation is immediate",async()=>{
    const {input,media}=await prepare(),submission=await submitDraft(userId,input);
    await expect(readSubmission(otherId,submission.id)).rejects.toMatchObject({status:404});
    await expect(reviewQueue(otherId)).rejects.toMatchObject({status:403});
    await expect(readSubmission(userId,submission.id,true)).rejects.toMatchObject({status:404});
    await expect(decideSubmission(userId,submission.id,{version:1,decision:"approved",reason:"Self review attempt"})).rejects.toMatchObject({status:404});
    await expect(submittedPhoto(otherId,submission.id,media.images[0].id,false,storage)).rejects.toMatchObject({status:404});
    await db()`DELETE FROM account_capabilities WHERE user_id=${modId} AND capability='moderator'`;
    await expect(readSubmission(modId,submission.id,true)).rejects.toMatchObject({status:403});
    await expect(decideSubmission(modId,submission.id,{version:1,decision:"approved",reason:"Revoked attempt"})).rejects.toMatchObject({status:403});
    await db()`INSERT INTO account_capabilities(user_id,capability) VALUES (${modId},'moderator')`;
    expect((await reviewQueue(modId)).some(s=>s.id===submission.id)).toBe(true);
    expect((await reviewQueue(userId)).some(s=>s.id===submission.id)).toBe(false);
  });
  it("competing final decisions have one winner and immutable attributed audit history",async()=>{
    const {input}=await prepare(),submission=await submitDraft(userId,input);
    const decisions=await Promise.allSettled(["approved","rejected"].map(decision=>decideSubmission(modId,submission.id,{version:1,decision,reason:"Reviewed complete submitted information"})));
    expect(decisions.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const detail=await readSubmission(modId,submission.id,true);expect(detail.events).toHaveLength(2);expect(detail.events[1].actorId).toBe(modId);expect(detail.submission.retainUntil).not.toBeNull();
    await expect(db()`UPDATE listing_submissions SET content=${db().json(content)} WHERE id=${submission.id}`).rejects.toThrow();
    await expect(db()`UPDATE submission_events SET reason='Overwritten' WHERE submission_id=${submission.id}`).rejects.toThrow();
    await expect(db()`DELETE FROM submission_events WHERE submission_id=${submission.id}`).rejects.toThrow();
    await expect(submitDraft(userId,{...input,requestId:crypto.randomUUID()})).rejects.toMatchObject({status:409});
  });
  it("links a new revision after changes requested and preserves previous feedback",async()=>{
    const {input}=await prepare(),first=await submitDraft(userId,input);
    const decision={version:1,decision:"changes_requested",reason:"Please clarify the description of shared facilities"};
    const changed=await decideSubmission(modId,first.id,decision);expect(await decideSubmission(modId,first.id,decision)).toEqual(changed);
    const second=await submitDraft(userId,{...input,requestId:crypto.randomUUID()});expect(second.previousId).toBe(first.id);
    expect((await readSubmission(userId,first.id)).events.at(-1)?.reason).toBe(decision.reason);
    await decideSubmission(modId,second.id,{version:1,decision:"approved",reason:"Requested clarification reviewed"});
    expect((await readSubmission(userId,second.id)).submission.state).toBe("approved");
    expect((await db()`SELECT count(*)::int AS n FROM listings WHERE title=${content.advertisement.title}`)[0].n).toBe(0);
  });
  it("serializes atomic capture with concurrent text and media edits",async()=>{
    const {input,draft,media}=await prepare();
    const result=await Promise.allSettled([submitDraft(userId,input),updateDraft(userId,draft.id,{version:1,content:{...content,advertisement:{...content.advertisement,title:"Concurrent title"}}}),removePhoto(userId,draft.id,media.images[0].id,media.version)]);
    if(result[0].status==="fulfilled"){
      const s=result[0].value;expect(s.content).toEqual(content);expect(s.photos[0].id).toBe(media.images[0].id);expect(s.textVersion).toBe(1);expect(s.mediaVersion).toBe(media.version);expect((await submittedPhoto(modId,s.id,media.images[0].id,true,storage)).length).toBeGreaterThan(0);
    }else expect(result[0].reason).toMatchObject({status:409});
  });
  it("retains a shared object across obligations, fails cleanup safely, and denies expired photo delivery",async()=>{
    const {input,draft,media}=await prepare(),first=await submitDraft(userId,input);
    await decideSubmission(modId,first.id,{version:1,decision:"changes_requested",reason:"Please clarify shared facilities"});
    const second=await submitDraft(userId,{...input,requestId:crypto.randomUUID()});
    await removePhoto(userId,draft.id,media.images[0].id,media.version);
    let removals=0;const failing:PrivateStorage={put:(key,bytes)=>storage.put(key,bytes),get:key=>storage.get(key),remove:async key=>{if(key===second.photos[0].key)removals++;throw new Error("Storage unavailable");}};
    await cleanupMedia(failing,100);expect(removals).toBe(0);
    expect((await submittedPhoto(modId,second.id,media.images[0].id,true,storage)).length).toBeGreaterThan(0);
    const firstRecord=(await readSubmission(userId,first.id)).submission;
    const clock=vi.spyOn(Date,"now").mockReturnValue(new Date(firstRecord.retainUntil!).getTime()+1000);
    try{await expect(submittedPhoto(userId,first.id,media.images[0].id,false,storage)).rejects.toMatchObject({status:410});expect((await submittedPhoto(modId,second.id,media.images[0].id,true,storage)).length).toBeGreaterThan(0);}finally{clock.mockRestore();}
  });
  it("protects account deletion while pending and preserves all 24 demo listings/advertisers",async()=>{
    const {input}=await prepare();await submitDraft(userId,input);
    await expect(db()`DELETE FROM auth_user WHERE id=${userId}`).rejects.toThrow();
    expect((await db()`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
    expect((await db()`SELECT count(*)::int AS n FROM advertisers WHERE is_demo`)[0].n).toBe(24);
  });
});

describe("repeatable public demo photograph references",()=>{
  it("keeps all non-image records and unrelated images unchanged, with consistent saved projection",async()=>{
    const snapshot=async()=>({listings:await db()`SELECT * FROM listings ORDER BY id`,advertisers:await db()`SELECT * FROM advertisers ORDER BY id`,properties:await db()`SELECT * FROM properties ORDER BY id`,units:await db()`SELECT * FROM units ORDER BY id`,images:await db()`SELECT * FROM property_images ORDER BY id`});
    const before=await snapshot();expect(await updateDemoImages(db())).toEqual([]);expect(await snapshot()).toEqual(before);
    for(const group of demoImageGroups){
      const result=await searchListings(parseFilters({category:group.category,city:group.city,locality:group.locality}));
      expect(result.items).toHaveLength(1);const listing=result.items[0];
      expect(listing.images.map(image=>image.path)).toEqual(group.images.map(([file])=>`/images/demo/${file}`));
      expect((await getListing(listing.id))!.images).toEqual(listing.images);
      const {getPublishedListingsByIds}=await import("../src/modules/listings/repository");
      expect((await getPublishedListingsByIds([listing.id]))[0].images).toEqual(listing.images);
    }
  });
});

describe("saved listings persistence and boundaries",()=>{
  const userId="saved-integration-user",otherId="saved-integration-other";
  let listingId:number;
  beforeAll(async()=>{
    await db()`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES (${userId},'Saved test','saved-integration@example.test',true),(${otherId},'Other','saved-other@example.test',true)`;
    const [source]=await db()`SELECT * FROM listings WHERE status='published' LIMIT 1`;
    const [copy]=await db()`INSERT INTO listings(unit_id,unit_kind,advertiser_id,category,title,description,price,deposit,maintenance,brokerage,available_from,is_demo)
      VALUES (${source.unit_id},${source.unit_kind},${source.advertiser_id},${source.category},'Saved integration fixture','Synthetic isolated test',${source.price},${source.deposit},${source.maintenance},${source.brokerage},${source.available_from},true) RETURNING id`;
    listingId=copy.id;
  });
  afterAll(async()=>{
    await db()`DELETE FROM auth_user WHERE id IN (${userId},${otherId})`;
    if(listingId)await db()`DELETE FROM listings WHERE id=${listingId}`;
  });
  it("saves once under concurrent requests, reads current data, and isolates accounts",async()=>{
    expect(await Promise.all(Array.from({length:8},()=>setSavedListing(userId,listingId,true)))).toEqual(Array(8).fill("saved"));
    expect(await db()`SELECT * FROM saved_listings WHERE user_id=${userId}`).toHaveLength(1);
    expect(await savedListingIds(otherId)).toEqual([]);
    await setSavedListing(otherId,listingId,false);
    expect(await savedListingIds(userId)).toEqual([listingId]);
    await db()`UPDATE listings SET title='Current listing title' WHERE id=${listingId}`;
    expect((await savedCollection(userId)).items[0].title).toBe("Current listing title");
    const [record]=await db()`SELECT saved_at FROM saved_listings WHERE user_id=${userId}`;expect(record.saved_at).toBeInstanceOf(Date);
  });
  it("enforces direct unique and foreign key constraints",async()=>{
    await expect(db()`INSERT INTO saved_listings(user_id,listing_id) VALUES (${userId},${listingId})`).rejects.toThrow();
    await expect(db()`INSERT INTO saved_listings(user_id,listing_id) VALUES ('nonexistent-user',${listingId})`).rejects.toThrow();
    await expect(db()`INSERT INTO saved_listings(user_id,listing_id) VALUES (${userId},2147483647)`).rejects.toThrow();
  });
  it("never discloses draft/archived listings and rejects saving them",async()=>{
    for(const status of ["draft","archived"]){
      await db()`UPDATE listings SET status=${status} WHERE id=${listingId}`;
      expect(await savedCollection(userId)).toEqual({total:0,items:[]});
      expect(await setSavedListing(otherId,listingId,true)).toBe("not-found");
      expect(await getListing(listingId)).toBeNull();
    }
    await db()`UPDATE listings SET status='published' WHERE id=${listingId}`;
    expect(await savedListingIds(userId)).toEqual([listingId]);
  });
  it("removes idempotently and permits a new explicit save",async()=>{
    expect(await setSavedListing(userId,listingId,false)).toBe("removed");
    expect(await setSavedListing(userId,listingId,false)).toBe("removed");
    expect(await savedCollection(userId)).toEqual({total:0,items:[]});
    expect(await setSavedListing(userId,listingId,true)).toBe("saved");
  });
  it("supports all three advertisement categories and bounded pagination",async()=>{
    const sources=await db()`SELECT DISTINCT ON (category) id,category FROM listings WHERE status='published' AND id<>${listingId} ORDER BY category,id`;
    for(const source of sources)expect(await setSavedListing(otherId,source.id,true)).toBe("saved");
    expect(new Set((await savedCollection(otherId)).items.map(item=>item.category))).toEqual(new Set(["flatshares","rent","buy"]));
    expect(await savedCollection(otherId,2)).toMatchObject({total:3,items:[]});
    await expect(savedCollection(otherId,0)).rejects.toThrow();
    for(const source of sources)await setSavedListing(otherId,source.id,false);
  });
  it("bounds per-account writes across concurrent calls",async()=>{
    await db()`UPDATE saved_listing_write_limits SET request_count=59 WHERE user_id=${userId}`;
    const results=await Promise.all([setSavedListing(userId,listingId,true),setSavedListing(userId,listingId,true)]);
    expect(results.sort()).toEqual(["limited","saved"]);
    await db()`UPDATE saved_listing_write_limits SET window_started_at=now()-interval '2 minutes' WHERE user_id=${userId}`;
    expect(await setSavedListing(userId,listingId,true)).toBe("saved");
  });
  it("cascades listing deletion and user deletion without errors",async()=>{
    await setSavedListing(otherId,listingId,true);
    await db()`DELETE FROM auth_user WHERE id=${otherId}`;
    expect(await db()`SELECT * FROM saved_listings WHERE user_id=${otherId}`).toHaveLength(0);
    await db()`DELETE FROM listings WHERE id=${listingId}`;
    expect(await savedCollection(userId)).toEqual({total:0,items:[]});
  });
});
afterAll(async () => { await db().end(); });
describe("advertiser profiles and authorization",()=>{
  const userId="advertiser-integration-user",otherId="advertiser-integration-other";
  const input={displayName:"Private advertiser",type:"owner",primaryCity:"Bengaluru",description:"Self-declared activity"};
  let advertiserId:number;
  beforeAll(async()=>{
    await db()`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES (${userId},'Advertiser test','advertiser-integration@example.test',true),(${otherId},'Other test','advertiser-other@example.test',true)`;
  });
  afterAll(async()=>{await db()`DELETE FROM auth_user WHERE id IN (${userId},${otherId})`;});
  it("keeps setup optional and does not grant privileges from preferences",async()=>{
    await updateProfile(userId,{displayName:"Interested account",image:"",preferredCity:"Bengaluru",seeking:true,owning:true,brokering:true});
    expect(await advertiserProfile(userId)).toBeNull();
    expect(await db()`SELECT * FROM account_capabilities WHERE user_id=${userId}`).toHaveLength(0);
    expect(canManageListing()).toBe(false);expect(canPublishListing()).toBe(false);
  });
  it("creates a single account-owned non-demo entity under concurrent setup",async()=>{
    expect(await Promise.all(Array.from({length:5},()=>saveAdvertiserProfile(userId,input)))).toEqual(Array(5).fill("saved"));
    const profile=await advertiserProfile(userId);advertiserId=profile!.advertiserId;
    expect(profile).toMatchObject({...input,status:"active"});
    expect(await db()`SELECT * FROM advertisers WHERE owner_user_id=${userId}`).toHaveLength(1);
    expect(await db()`SELECT * FROM advertiser_status_events WHERE advertiser_id=${advertiserId}`).toHaveLength(1);
    expect((await db()`SELECT is_demo FROM advertisers WHERE id=${advertiserId}`)[0].is_demo).toBe(false);
    expect(await db()`SELECT * FROM account_capabilities WHERE user_id=${userId}`).toHaveLength(0);
  });
  it("edits all supported types, preserves creation time and isolates accounts",async()=>{
    const created=(await advertiserProfile(userId))!.createdAt;
    for(const type of ["owner","broker","tenant"]){
      expect(await saveAdvertiserProfile(userId,{...input,type,displayName:"Edited advertiser",primaryCity:"Mumbai"})).toBe("saved");
      expect(await advertiserProfile(userId)).toMatchObject({type,displayName:"Edited advertiser",primaryCity:"Mumbai",createdAt:created});
    }
    expect(await advertiserProfile(otherId)).toBeNull();
    expect(await canEditAdvertiserProfile(userId,advertiserId)).toBe(true);
    expect(await canEditAdvertiserProfile(otherId,advertiserId)).toBe(false);
    expect(await canEditAdvertiserProfile(userId,NaN)).toBe(false);
    expect(await saveAdvertiserProfile(otherId,{...input,displayName:"Independent"})).toBe("saved");
    expect((await advertiserProfile(userId))!.displayName).toBe("Edited advertiser");
  });
  it("rejects status escalation, claims and malformed repository input",async()=>{
    for(const extra of [{status:"active"},{verified:true},{advertiserId:1},{propertyId:1},{userId:otherId},{type:"admin"}]){
      await expect(saveAdvertiserProfile(userId,{...input,...extra})).rejects.toThrow();
    }
    expect(await db()`SELECT * FROM account_capabilities WHERE user_id=${userId}`).toHaveLength(0);
    const demos=await db()`SELECT id FROM listings WHERE is_demo`;
    expect(demos).toHaveLength(24);
    for(const demo of demos)expect(await isAccountAdvertiserForListing(userId,demo.id)).toBe(false);
    expect(await isAccountAdvertiserForListing(userId,-1)).toBe(false);
    expect(await canEditAdvertiserProfile(userId,1)).toBe(false);
  });
  it("does not treat privileged capability storage as a listing-management grant",async()=>{
    // Operator-only fixture insertion, never a public capability grant.
    await db()`INSERT INTO account_capabilities(user_id,capability) VALUES (${otherId},'advertiser'),(${otherId},'administrator')`;
    expect(await canEditAdvertiserProfile(otherId,advertiserId)).toBe(false);
    expect(await isAccountAdvertiserForListing(otherId,8)).toBe(false);
    expect(canManageListing()).toBe(false);expect(canPublishListing()).toBe(false);
  });
  it("enforces database relationships, uniqueness and demo separation",async()=>{
    await expect(db()`INSERT INTO advertisers(display_name,kind,is_demo,owner_user_id) VALUES ('Duplicate','owner',false,${userId})`).rejects.toThrow();
    await expect(db()`UPDATE advertisers SET is_demo=true WHERE id=${advertiserId}`).rejects.toThrow();
    await expect(db()`INSERT INTO advertisers(display_name,kind,is_demo,owner_user_id) VALUES ('Orphan','owner',false,'missing-user')`).rejects.toThrow();
    await expect(db()`UPDATE advertiser_profiles SET advertiser_id=1 WHERE user_id=${userId}`).rejects.toThrow();
    await expect(db()`UPDATE advertiser_profiles SET status='verified' WHERE user_id=${userId}`).rejects.toThrow();
    await expect(db()`UPDATE advertiser_profiles SET user_id=${otherId} WHERE advertiser_id=${advertiserId}`).rejects.toThrow();
    const [other]=await db()`SELECT advertiser_id FROM advertiser_profiles WHERE user_id=${otherId}`;
    await expect(db()`UPDATE advertiser_profiles SET advertiser_id=${other.advertiser_id} WHERE user_id=${userId}`).rejects.toThrow();
  });
  it("audits suspension and prevents self-service bypass without affecting favorites",async()=>{
    await db()`UPDATE advertiser_profiles SET status='suspended' WHERE advertiser_id=${advertiserId}`;
    expect(await saveAdvertiserProfile(userId,input)).toBe("suspended");
    expect(await canEditAdvertiserProfile(userId,advertiserId)).toBe(false);
    const events=await db()`SELECT previous_status,status FROM advertiser_status_events WHERE advertiser_id=${advertiserId} ORDER BY id`;
    expect(events).toEqual([{previous_status:null,status:"active"},{previous_status:"active",status:"suspended"}]);
    expect(await setSavedListing(userId,8,true)).toBe("saved");expect(await savedListingIds(userId)).toEqual([8]);
    await db()`UPDATE advertiser_profiles SET status='active' WHERE advertiser_id=${advertiserId}`;
    expect(await saveAdvertiserProfile(userId,input)).toBe("saved");
  });
  it("limits concurrent changes and resets an expired bucket",async()=>{
    await db()`UPDATE advertiser_profile_write_limits SET request_count=19 WHERE user_id=${userId}`;
    const result=await Promise.all([saveAdvertiserProfile(userId,input),saveAdvertiserProfile(userId,input)]);
    expect(result.sort()).toEqual(["limited","saved"]);
    await db()`UPDATE advertiser_profile_write_limits SET window_started_at=now()-interval '2 minutes' WHERE user_id=${userId}`;
    expect(await saveAdvertiserProfile(userId,input)).toBe("saved");
  });
  it("cascades account cleanup without deleting demo advertisers",async()=>{
    await db()`DELETE FROM auth_user WHERE id=${userId}`;
    expect(await advertiserProfile(userId)).toBeNull();
    expect(await db()`SELECT * FROM advertisers WHERE id=${advertiserId}`).toHaveLength(0);
    expect(await db()`SELECT * FROM advertiser_status_events WHERE advertiser_id=${advertiserId}`).toHaveLength(0);
    expect(await db()`SELECT * FROM advertisers WHERE is_demo`).toHaveLength(24);
    expect(await saveAdvertiserProfile(userId,input)).toBe("not-found");
  });
});
describe("private draft persistence and adversarial boundaries",()=>{
  const owner="draft-integration-owner",other="draft-integration-other",noProfile="draft-integration-no-profile";
  const requestId=crypto.randomUUID();let draftId:string;let advertiserId:number;
  beforeAll(async()=>{
    for(const user of [owner,other,noProfile])await db()`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES (${user},'Draft tester',${user+"@example.test"},true)`;
    for(const user of [owner,other])expect(await saveAdvertiserProfile(user,{displayName:"Private advertiser",type:"owner",primaryCity:"Bengaluru",description:""})).toBe("saved");
    advertiserId=(await advertiserProfile(owner))!.advertiserId;
  });
  afterAll(async()=>{await db()`DELETE FROM auth_user WHERE id IN (${owner},${other},${noProfile})`;});
  it("requires an active own profile and creates one draft for concurrent retries",async()=>{
    expect(await draftEligibility(noProfile)).toBe(false);
    await expect(createDraft(noProfile,{requestId,content:emptyDraft("rent")})).rejects.toMatchObject({code:"ineligible"});
    const drafts=await Promise.all(Array.from({length:6},()=>createDraft(owner,{requestId,content:emptyDraft("rent")})));
    expect(new Set(drafts.map(draft=>draft.id)).size).toBe(1);draftId=drafts[0].id;
    expect(drafts[0].version).toBe(1);expect(await listDrafts(owner)).toHaveLength(1);
    expect(await listDrafts(other)).toEqual([]);expect(await readDraft(other,draftId)).toBeNull();
    await expect(createDraft(owner,{requestId,content:emptyDraft("buy")})).rejects.toMatchObject({code:"conflict"});
  });
  it("rejects cross-account writes, stale edits and category reassignment",async()=>{
    await expect(updateDraft(other,draftId,{version:1,content:emptyDraft("rent")})).rejects.toMatchObject({code:"not-found"});
    await expect(deleteDraft(other,draftId,{version:1})).rejects.toMatchObject({code:"not-found"});
    const content={...emptyDraft("rent"),relationship:"tenant",advertisement:{title:"Secret draft title",monthlyRent:15000,deposit:0}};
    const results=await Promise.allSettled([updateDraft(owner,draftId,{version:1,content}),updateDraft(owner,draftId,{version:1,content})]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect((await readDraft(owner,draftId))?.version).toBe(2);
    await expect(updateDraft(owner,draftId,{version:2,content:emptyDraft("buy")})).rejects.toMatchObject({code:"conflict"});
    await expect(deleteDraft(owner,draftId,{version:1})).rejects.toMatchObject({code:"conflict"});
  });
  it("enforces direct SQL account pairing, immutable relationships, typed category content and server timestamps",async()=>{
    await expect(db()`UPDATE listing_drafts SET user_id=${other} WHERE id=${draftId}`).rejects.toThrow();
    await expect(db()`UPDATE listing_drafts SET advertiser_id=1 WHERE id=${draftId}`).rejects.toThrow();
    await expect(db()`UPDATE listing_drafts SET category='buy' WHERE id=${draftId}`).rejects.toThrow();
    await expect(db()`INSERT INTO listing_drafts(user_id,advertiser_id,category,content) VALUES (${other},${advertiserId},'rent',${db().json(emptyDraft("rent"))})`).rejects.toThrow();
    for(const content of [
      {...emptyDraft("rent"),advertisement:{askingPrice:2}},
      {...emptyDraft("rent"),advertisement:{monthlyRent:-1}},
      {...emptyDraft("rent"),advertisement:{deposit:"0"}},
      {...emptyDraft("rent"),advertisement:{availableFrom:"2026-02-31"}},
      {...emptyDraft("rent"),property:{amenities:["Lift","Lift"]}},
      {...emptyDraft("rent"),unit:{bhk:0}},
    ])await expect(db()`UPDATE listing_drafts SET content=${db().json(content)} WHERE id=${draftId}`).rejects.toThrow();
    const [before]=await db()`SELECT created_at FROM listing_drafts WHERE id=${draftId}`;
    const [row]=await db()`UPDATE listing_drafts SET version=500,created_at='1900-01-01',updated_at='1900-01-01' WHERE id=${draftId} RETURNING *`;
    expect(row.version).toBe(3);expect(row.created_at).toEqual(before.created_at);expect(row.updated_at.getFullYear()).toBeGreaterThan(2020);
  });
  it("suspension immediately blocks reads, edits, deletion and preview data",async()=>{
    await db()`UPDATE advertiser_profiles SET status='suspended' WHERE user_id=${owner}`;
    try{
      expect(await readDraft(owner,draftId)).toBeNull();await expect(listDrafts(owner)).rejects.toMatchObject({code:"ineligible"});
      await expect(updateDraft(owner,draftId,{version:3,content:emptyDraft("rent")})).rejects.toMatchObject({code:"ineligible"});
      await expect(deleteDraft(owner,draftId,{version:3})).rejects.toMatchObject({code:"ineligible"});
      await expect(createDraft(owner,{requestId:crypto.randomUUID(),content:emptyDraft("rent")})).rejects.toMatchObject({code:"ineligible"});
    }finally{await db()`UPDATE advertiser_profiles SET status='active' WHERE user_id=${owner}`;}
  });
  it("persists all categories, stays absent from public search/favorites and preserves demo fixtures",async()=>{
    for(const category of ["flatshares","buy"] as const){
      const draft=await createDraft(owner,{requestId:crypto.randomUUID(),content:emptyDraft(category)});
      expect((await readDraft(owner,draft.id))?.content.category).toBe(category);
    }
    expect(await listDrafts(owner)).toHaveLength(3);
    for(const category of ["flatshares","rent","buy"])expect((await searchListings(parseFilters({category}))).total).toBe(8);
    expect(await savedCollection(owner)).toEqual({total:0,items:[]});
    expect((await db()`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
    expect((await db()`SELECT count(*)::int AS n FROM advertisers WHERE is_demo`)[0].n).toBe(24);
  });
  it("never resurrects a deleted creation request and scopes keys per account",async()=>{
    await deleteDraft(owner,draftId,{version:3});expect(await readDraft(owner,draftId)).toBeNull();
    await expect(createDraft(owner,{requestId,content:emptyDraft("rent")})).rejects.toMatchObject({code:"conflict"});
    const otherDraft=await createDraft(other,{requestId,content:emptyDraft("buy")});expect(otherDraft.id).not.toBe(draftId);
  });
  it("bounds live drafts and retained creation receipts per account",async()=>{
    const otherAdvertiser=(await advertiserProfile(other))!.advertiserId;
    await db()`INSERT INTO listing_drafts(user_id,advertiser_id,category,content)
      SELECT ${other},${otherAdvertiser},'rent',${db().json(emptyDraft("rent"))} FROM generate_series(1,99)`;
    await expect(createDraft(other,{requestId:crypto.randomUUID(),content:emptyDraft("rent")})).rejects.toMatchObject({code:"full"});
    await db()`DELETE FROM listing_drafts WHERE user_id=${other}`;
    await db()`INSERT INTO listing_draft_requests(user_id,request_id,payload_hash)
      SELECT ${other},gen_random_uuid(),repeat('a',64) FROM generate_series(1,999)`;
    await expect(createDraft(other,{requestId:crypto.randomUUID(),content:emptyDraft("rent")})).rejects.toMatchObject({code:"full"});
  });
  it("enforces write throttling without rolling the budget back and resets expired buckets",async()=>{
    await db()`INSERT INTO listing_draft_write_limits(user_id,request_count) VALUES (${owner},30) ON CONFLICT(user_id) DO UPDATE SET request_count=30,window_started_at=now()`;
    for(let attempt=0;attempt<2;attempt++)await expect(createDraft(owner,{requestId:crypto.randomUUID(),content:emptyDraft("rent")})).rejects.toMatchObject({code:"limited"});
    expect((await db()`SELECT request_count FROM listing_draft_write_limits WHERE user_id=${owner}`)[0].request_count).toBe(30);
    await db()`UPDATE listing_draft_write_limits SET window_started_at=now()-interval '2 minutes' WHERE user_id=${owner}`;
    await createDraft(owner,{requestId:crypto.randomUUID(),content:emptyDraft("rent")});
    expect((await db()`SELECT request_count FROM listing_draft_write_limits WHERE user_id=${owner}`)[0].request_count).toBe(1);
  });
  it("cascades account deletion without touching public demo data",async()=>{
    await db()`DELETE FROM auth_user WHERE id=${owner}`;
    expect(await db()`SELECT id FROM listing_drafts WHERE user_id=${owner}`).toHaveLength(0);
    expect(await db()`SELECT request_id FROM listing_draft_requests WHERE user_id=${owner}`).toHaveLength(0);
    expect(await db()`SELECT id FROM advertisers WHERE is_demo`).toHaveLength(24);
  });
});
describe("private photographs: database and actual isolated object storage",()=>{
  const owner="media-integration-owner",other="media-integration-other";
  let root:string,storage:LocalPrivateStorage,draftId:string,otherDraftId:string,bytes:Buffer;
  beforeAll(async()=>{
    root=await mkdtemp(path.join(os.tmpdir(),"scout-media-integration-"));storage=new LocalPrivateStorage(root);
    bytes=await sharp({create:{width:60,height:40,channels:3,background:"red"}}).png().toBuffer();
    for(const id of [owner,other]){
      await db()`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES (${id},'Photo tester',${id+"@example.test"},true)`;
      await saveAdvertiserProfile(id,{displayName:"Photo advertiser",type:"owner",primaryCity:"Bengaluru",description:""});
    }
    draftId=(await createDraft(owner,{requestId:crypto.randomUUID(),content:emptyDraft("flatshares")})).id;
    otherDraftId=(await createDraft(other,{requestId:crypto.randomUUID(),content:emptyDraft("buy")})).id;
  });
  afterAll(async()=>{
    await db()`DELETE FROM auth_user WHERE id IN (${owner},${other})`;await cleanupMedia(storage,100);await rm(root,{recursive:true,force:true});
  });
  it("uploads once, persists metadata privately and denies other-account reads/writes",async()=>{
    const key=crypto.randomUUID();const media=await uploadPhoto(owner,draftId,key,bytes,storage);
    expect(media.images).toHaveLength(1);expect(media.images[0].cover).toBe(true);
    expect(await uploadPhoto(owner,draftId,key,bytes,storage)).toEqual(media);
    expect(media.images[0]).not.toHaveProperty("storage_key");
    const image=media.images[0];expect((await sharp(await retrievePhoto(owner,draftId,image.id,storage)).metadata()).format).toBe("webp");
    await expect(retrievePhoto(other,draftId,image.id,storage)).rejects.toMatchObject({status:404});
    await expect(uploadPhoto(other,draftId,crypto.randomUUID(),bytes,storage)).rejects.toMatchObject({status:404});
    await expect(removePhoto(other,draftId,image.id,media.version)).rejects.toMatchObject({status:404});
    await expect(uploadPhoto(owner,draftId,crypto.randomUUID(),bytes,storage)).rejects.toMatchObject({status:409});
    const [row]=await db()`SELECT * FROM draft_photographs WHERE id=${image.id}`;
    await expect(db()`UPDATE draft_photographs SET owner_id=${other} WHERE id=${image.id}`).rejects.toThrow();
    await expect(db()`UPDATE draft_photographs SET draft_id=${otherDraftId} WHERE id=${image.id}`).rejects.toThrow();
    expect(row.content_type).toBe("image/webp");expect(row.byte_size).toBeGreaterThan(0);
  });
  it("serializes duplicate concurrent uploads and versioned cover/order changes",async()=>{
    const blue=await sharp({create:{width:50,height:40,channels:3,background:"blue"}}).jpeg().toBuffer();const key=crypto.randomUUID();
    const attempts=await Promise.allSettled([uploadPhoto(owner,draftId,key,blue,storage),uploadPhoto(owner,draftId,key,blue,storage)]);
    expect(attempts.some(result=>result.status==='fulfilled')).toBe(true);
    const media=await listMedia(owner,draftId);expect(media.images).toHaveLength(2);
    const ids=media.images.map(image=>image.id).reverse();
    const reordered=await arrangeMedia(owner,draftId,{version:media.version,ids,coverId:ids[0]});
    expect(reordered.images.map(image=>image.id)).toEqual(ids);expect(reordered.images[0].cover).toBe(true);
    await expect(arrangeMedia(owner,draftId,{version:media.version,ids,coverId:ids[1]})).rejects.toMatchObject({status:409});
    await expect(arrangeMedia(owner,draftId,{version:reordered.version,ids:[ids[0]],coverId:ids[0]})).rejects.toMatchObject({status:400});
    await expect(db()`UPDATE draft_photographs SET is_cover=true WHERE draft_id=${draftId} AND state='ready'`).rejects.toThrow();
  });
  it("suspension blocks delivery and image mutations immediately",async()=>{
    const media=await listMedia(owner,draftId);
    await db()`UPDATE advertiser_profiles SET status='suspended' WHERE user_id=${owner}`;
    try{
      await expect(retrievePhoto(owner,draftId,media.images[0].id,storage)).rejects.toMatchObject({status:404});
      await expect(uploadPhoto(owner,draftId,crypto.randomUUID(),bytes,storage)).rejects.toMatchObject({status:404});
      await expect(removePhoto(owner,draftId,media.images[0].id,media.version)).rejects.toMatchObject({status:404});
    }finally{await db()`UPDATE advertiser_profiles SET status='active' WHERE user_id=${owner}`;}
  });
  it("reclaims a partial storage failure and keeps failed-delete cleanup retryable",async()=>{
    const green=await sharp({create:{width:45,height:40,channels:3,background:"green"}}).png().toBuffer();
    let key="";
    const failing:PrivateStorage={get:k=>storage.get(k),remove:k=>storage.remove(k),put:async(k,data)=>{key=k;await storage.put(k,data);throw new Error("Synthetic storage interruption");}};
    await expect(uploadPhoto(owner,draftId,crypto.randomUUID(),green,failing)).rejects.toThrow("Synthetic storage");
    await access(path.join(root,key));
    await cleanupMedia({...failing,remove:async()=>{throw new Error("Storage unavailable");}});
    expect((await db()`SELECT state FROM draft_photographs WHERE storage_key=${key}`)[0].state).toBe("deleting");
    await cleanupMedia(storage);await expect(access(path.join(root,key))).rejects.toThrow();
    expect((await db()`SELECT state FROM draft_photographs WHERE storage_key=${key}`)[0].state).toBe("deleted");
  });
  it("reconciles database failure after object PUT without accepting an image",async()=>{
    const orange=await sharp({create:{width:46,height:40,channels:3,background:"orange"}}).png().toBuffer();let key="";
    const failing:PrivateStorage={get:k=>storage.get(k),remove:k=>storage.remove(k),put:async(k,data)=>{
      key=k;await storage.put(k,data);
      // A real PostgreSQL integer overflow on the following version increment,
      // after the object PUT succeeded (isolated fixture state only).
      await db()`UPDATE draft_media_state SET version=2147483647 WHERE draft_id=${draftId}`;
    }};
    const before=await listMedia(owner,draftId);
    try{await expect(uploadPhoto(owner,draftId,crypto.randomUUID(),orange,failing)).rejects.toThrow();}
    finally{await db()`UPDATE draft_media_state SET version=${before.version} WHERE draft_id=${draftId}`;}
    expect((await listMedia(owner,draftId)).images).toEqual(before.images);
    await cleanupMedia(storage);await expect(access(path.join(root,key))).rejects.toThrow();
  });
  it("deletes a cover, compacts order and never resurrects the removed upload",async()=>{
    const media=await listMedia(owner,draftId),image=media.images.find(photo=>photo.cover)!;
    const [receipt]=await db()`SELECT request_id,input_hash,storage_key FROM draft_photographs WHERE id=${image.id}`;
    const next=await removePhoto(owner,draftId,image.id,media.version);
    expect(next.images).toHaveLength(1);expect(next.images[0].cover).toBe(true);
    await expect(retrievePhoto(owner,draftId,image.id,storage)).rejects.toMatchObject({status:404});
    await cleanupMedia(storage);await expect(access(path.join(root,receipt.storage_key))).rejects.toThrow();
    await expect(uploadPhoto(owner,draftId,receipt.request_id,bytes,storage)).rejects.toMatchObject({status:409});
  });
  it("enforces configurable count and account quotas before writing storage",async()=>{
    const original=process.env.MEDIA_MAX_IMAGES;process.env.MEDIA_MAX_IMAGES="1";
    try{await expect(uploadPhoto(owner,draftId,crypto.randomUUID(),Buffer.from("new bytes"),storage)).rejects.toMatchObject({status:409});}
    finally{if(original===undefined)delete process.env.MEDIA_MAX_IMAGES;else process.env.MEDIA_MAX_IMAGES=original;}
    const originalBytes=process.env.MEDIA_ACCOUNT_BYTES;process.env.MEDIA_ACCOUNT_BYTES="1";
    try{await expect(uploadPhoto(owner,draftId,crypto.randomUUID(),Buffer.from("new bytes"),storage)).rejects.toMatchObject({status:409});}
    finally{if(originalBytes===undefined)delete process.env.MEDIA_ACCOUNT_BYTES;else process.env.MEDIA_ACCOUNT_BYTES=originalBytes;}
  });
  it.each(["flatshares","rent","buy"] as const)("supports private photographs for category %s without public records",async category=>{
    const draft=await createDraft(other,{requestId:crypto.randomUUID(),content:emptyDraft(category)});
    const media=await uploadPhoto(other,draft.id,crypto.randomUUID(),bytes,storage);
    expect(media.images).toHaveLength(1);expect((await retrievePhoto(other,draft.id,media.images[0].id,storage)).length).toBeGreaterThan(0);
    await expect(retrievePhoto(owner,draft.id,media.images[0].id,storage)).rejects.toMatchObject({status:404});
    await deleteDraft(other,draft.id,{version:draft.version});await cleanupMedia(storage);
  });
  it("reserves the final photograph slot atomically under different concurrent requests",async()=>{
    const draft=await createDraft(other,{requestId:crypto.randomUUID(),content:emptyDraft("rent")});
    const original=process.env.MEDIA_MAX_IMAGES;process.env.MEDIA_MAX_IMAGES="1";
    try{
      const blue=await sharp({create:{width:41,height:30,channels:3,background:"blue"}}).png().toBuffer();
      const attempts=await Promise.allSettled([uploadPhoto(other,draft.id,crypto.randomUUID(),bytes,storage),uploadPhoto(other,draft.id,crypto.randomUUID(),blue,storage)]);
      expect(attempts.filter(result=>result.status==='fulfilled')).toHaveLength(1);
      expect((await listMedia(other,draft.id)).images).toHaveLength(1);
    }finally{if(original===undefined)delete process.env.MEDIA_MAX_IMAGES;else process.env.MEDIA_MAX_IMAGES=original;}
    await deleteDraft(other,draft.id,{version:draft.version});await cleanupMedia(storage);
  });
  it("cleans abandoned reservations and entire draft deletion without changing public/demo records",async()=>{
    const id=crypto.randomUUID(),key=`drafts/${draftId}/${id}.webp`;
    await db()`INSERT INTO draft_photographs(id,draft_id,owner_id,request_id,input_hash,storage_key,state,expires_at) VALUES (${id},${draftId},${owner},${crypto.randomUUID()},${"a".repeat(64)},${key},'pending',now()-interval '1 minute')`;
    await storage.put(key,Buffer.from("abandoned"));await cleanupMedia(storage);await expect(access(path.join(root,key))).rejects.toThrow();
    const keys=await db()`SELECT storage_key FROM draft_photographs WHERE draft_id=${draftId} AND state='ready'`;
    const draft=await readDraft(owner,draftId);await deleteDraft(owner,draftId,{version:draft!.version});
    await cleanupMedia(storage);
    for(const row of keys)await expect(access(path.join(root,row.storage_key))).rejects.toThrow();
    expect((await db()`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
    expect((await db()`SELECT count(*)::int AS n FROM advertisers WHERE is_demo`)[0].n).toBe(24);
  });
});
const search = (input: object) => searchListings(parseFilters(input));
describe("persisted property discovery", () => {
  it("returns the requested furnished HSR flatshare under ₹15,000", async () => {
    const r=await search({category:"flatshares",city:"Bengaluru",locality:"HSR Layout",maxPrice:15000,furnishing:"furnished"});
    expect(r.total).toBe(1); expect(r.items[0]).toMatchObject({price:14000,category:"flatshares",is_demo:true,bhk:null});
  });
  it.each(["flatshares","rent","buy"])("filters category %s", async category => { const r=await search({category}); expect(r.total).toBe(8); expect(r.items.every(l=>l.category===category)).toBe(true); });
  it("matches city and locality case-insensitively",async()=>{ const r=await search({category:"rent",city:"mumbai",locality:"powai"}); expect(r.total).toBe(1); expect(r.items[0].city).toBe("Mumbai"); });
  it("combines inclusive price bounds",async()=>{ const r=await search({category:"flatshares",minPrice:15500,maxPrice:17000}); expect(r.total).toBe(2); expect(r.items.every(l=>l.price>=15500&&l.price<=17000)).toBe(true); });
  it("sorts price and paginates without duplicates",async()=>{ const first=await search({sort:"price-asc"}); const second=await search({sort:"price-asc",page:2}); expect(first.items).toHaveLength(6); expect(second.items).toHaveLength(2); expect(new Set([...first.items,...second.items].map(l=>l.id)).size).toBe(8); const prices=[...first.items,...second.items].map(l=>l.price); expect(prices).toEqual([...prices].sort((a,b)=>a-b)); });
  it("sorts descending price and most recently published",async()=>{ const p=await search({sort:"price-desc"}); expect(p.items[0].price).toBe(24500); const r=await search({sort:"recent"}); expect(r.items[0].locality).toBe("Goregaon"); });
  it("returns count even for a page beyond results",async()=>{ expect(await search({page:999})).toEqual({total:8,items:[]}); });
  it("filters BHK, furnishing, property type and owner",async()=>{ const r=await search({category:"rent",bhk:2,furnishing:"furnished",propertyType:"apartment",advertiser:"owner",brokerageFree:"true"}); expect(r.total).toBe(2); expect(r.items.every(l=>l.bhk===2&&l.brokerage===0&&l.advertiser_kind==="owner")).toBe(true); });
  it("filters brokerage and availability",async()=>{ expect((await search({brokerageFree:"true"})).total).toBe(4); expect((await search({availableBy:"2026-11-14"})).total).toBe(0); expect((await search({availableBy:"2026-11-15"})).total).toBe(8); });
  it("returns empty results and safely binds SQL-looking input",async()=>{ expect(await search({city:"Mumbai'; DROP TABLE listings;--"})).toEqual({total:0,items:[]}); });
  it("retrieves persisted details and handles missing IDs",async()=>{ const r=await search({}); const l=await getListing(r.items[0].id); expect(l?.images).toHaveLength(3); expect(l?.amenities).toContain("Security"); expect(await getListing(999999)).toBeNull(); expect(await getListing(NaN)).toBeNull(); });
  it("rejects invalid filters at the repository boundary",async()=>{ await expect(searchListings({...parseFilters({}),page:0})).rejects.toThrow(); });
  it("enforces category/unit integrity at the database boundary",async()=>{ await expect(db()`UPDATE listings SET category='buy' WHERE category='flatshares'`).rejects.toThrow(); });
});