import {describe,it,expect} from "vitest";
import {advertiserProfileSchema} from "../src/modules/advertisers/validation";
import {canManageListing,canPublishListing} from "../src/modules/advertisers/authorization";

const profile={displayName:"Local advertiser",type:"owner",primaryCity:"Bengaluru",description:""};
describe("advertiser validation and deny-by-default permissions",()=>{
  it.each(["owner","broker","tenant"])("supports self-declared %s",type=>expect(advertiserProfileSchema.parse({...profile,type}).type).toBe(type));
  it("trims bounded plain text and permits an optional empty description",()=>expect(advertiserProfileSchema.parse({...profile,displayName:"  Local advertiser  ",description:"  About me  "})).toMatchObject({displayName:"Local advertiser",description:"About me"}));
  it.each(["developer","agency","administrator","OWNER",null])("rejects unsupported type %s",type=>expect(advertiserProfileSchema.safeParse({...profile,type}).success).toBe(false));
  it.each([{},null,[],{...profile,primaryCity:"Delhi"},{...profile,displayName:" "},{...profile,displayName:"a".repeat(81)},{...profile,description:"x".repeat(601)},{...profile,description:42}])("rejects malformed input",input=>expect(advertiserProfileSchema.safeParse(input).success).toBe(false));
  it.each(["userId","advertiserId","owner_user_id","status","verified","identityVerified","propertyId","listingId","capability","role"])("rejects mass assignment of %s",key=>expect(advertiserProfileSchema.safeParse({...profile,[key]:"privileged"}).success).toBe(false));
  it("never grants listing editing or publishing",()=>{expect(canManageListing()).toBe(false);expect(canPublishListing()).toBe(false);});
});