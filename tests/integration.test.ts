import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { parseFilters } from "../src/modules/search/filters";
import { getListing, searchListings } from "../src/modules/listings/repository";
import { savedCollection, savedListingIds, setSavedListing } from "../src/modules/saved-listings/repository";
import { advertiserProfile,saveAdvertiserProfile } from "../src/modules/advertisers/repository";
import { canEditAdvertiserProfile,isAccountAdvertiserForListing,canManageListing,canPublishListing } from "../src/modules/advertisers/authorization";
import { updateProfile } from "../src/modules/accounts/repository";
beforeAll(() => {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, seeded test database.");
  if (process.env.TEST_DATABASE_URL===process.env.DATABASE_URL) throw new Error("Test database must be separate from application database.");
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
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