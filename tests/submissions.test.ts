import { describe, expect, it } from "vitest";
import { actionSchema, canResubmit, canTransition, states, submissionReadiness, submitSchema } from "../src/modules/submissions/validation";
import { emptyDraft, type DraftContent } from "../src/modules/listing-drafts/validation";

export function completeSubmission(category:DraftContent["category"]):DraftContent{
  const common={category,relationship:"owner",property:{city:"Bengaluru",locality:"Indiranagar",propertyType:"apartment"},advertisement:{title:"Peaceful test home",description:"A bright and spacious home with good ventilation and convenient access to local shops."}};
  if(category==="flatshares")return {...common,category,relationship:"tenant",unit:{bedroom:"private"},advertisement:{...common.advertisement,monthlyRent:15000,deposit:0,availableFrom:"2027-01-01"}} as DraftContent;
  if(category==="rent")return {...common,category,unit:{bhk:2},advertisement:{...common.advertisement,monthlyRent:30000,deposit:0,maintenance:0,brokerage:0}} as DraftContent;
  return {...common,category,unit:{bhk:2,carpetSqft:1000},advertisement:{...common.advertisement,askingPrice:9000000,brokerage:0}} as DraftContent;
}
describe("submission readiness and lifecycle",()=>{
  for(const category of ["flatshares","rent","buy"] as const){
    it(`${category}: accepts category minimums and explicit zero charges`,()=>expect(submissionReadiness(completeSubmission(category),1)).toEqual([]));
    it(`${category}: incomplete drafts remain distinct from submit-ready content`,()=>expect(submissionReadiness(emptyDraft(category),0).length).toBeGreaterThan(5));
    it(`${category}: requires one processed photograph, not extra scenes`,()=>{expect(submissionReadiness(completeSubmission(category),0)).toEqual([{field:"draft-photos",message:expect.any(String)}]);expect(submissionReadiness(completeSubmission(category),12)).toEqual([]);});
  }
  it("does not convert missing charges into zero",()=>{const content=completeSubmission("rent");if(content.category!=="rent")throw new Error();delete content.advertisement.deposit;delete content.advertisement.maintenance;delete content.advertisement.brokerage;expect(submissionReadiness(content,1).map(issue=>issue.field)).toEqual(expect.arrayContaining(["advertisement.deposit","advertisement.maintenance","advertisement.brokerage"]));});
  it("requires meaningful descriptions and supported cities",()=>{const content=completeSubmission("buy");content.advertisement.description="short";content.property.city="Elsewhere";expect(submissionReadiness(content,1).map(issue=>issue.field)).toEqual(["advertisement.description","property.city"]);});
  for(const from of states)for(const to of states)it(`${from} → ${to}`,()=>expect(canTransition(from,to)).toBe(from==="pending"&&to!=="pending"));
  it("only reopens withdrawn or changes-requested drafts as new submissions",()=>{expect(canResubmit()).toBe(true);for(const state of states)expect(canResubmit(state)).toBe(["withdrawn","changes_requested"].includes(state));});
  it("strictly bounds reasons and rejects actor impersonation",()=>{expect(actionSchema.safeParse({version:1,decision:"approved",reason:"Looks complete"}).success).toBe(true);for(const reason of ["","    ","!!!!!","x".repeat(2001)])expect(actionSchema.safeParse({version:1,decision:"approved",reason}).success).toBe(false);expect(actionSchema.safeParse({version:1,decision:"approved",reason:"Looks complete",actorId:"another"}).success).toBe(false);});
  it("requires UUID idempotency and both optimistic versions",()=>{const input={requestId:crypto.randomUUID(),draftId:crypto.randomUUID(),version:1,mediaVersion:1};expect(submitSchema.safeParse(input).success).toBe(true);expect(submitSchema.safeParse({...input,mediaVersion:undefined}).success).toBe(false);expect(submitSchema.safeParse({...input,userId:"spoofed"}).success).toBe(false);});
});