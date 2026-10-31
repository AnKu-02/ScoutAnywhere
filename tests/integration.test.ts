import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
beforeAll(() => {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, seeded test database.");
  if (process.env.TEST_DATABASE_URL===process.env.DATABASE_URL) throw new Error("Test database must be separate from application database.");
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
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