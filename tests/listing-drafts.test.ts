import { describe, expect, it } from "vitest";
import { createDraftSchema, draftContentSchema, draftReadiness, emptyDraft } from "../src/modules/listing-drafts/validation";

describe("private listing draft contract",()=>{
  it.each(["flatshares","rent","buy"] as const)("allows incomplete %s drafts and returns completeness guidance",category=>{
    const content=emptyDraft(category);expect(draftContentSchema.parse(content)).toEqual(content);
    expect(draftReadiness(content).length).toBeGreaterThan(5);
  });
  it.each([-1,0,1.5,Infinity,NaN,"15000",null])("rejects invalid supplied rent %s",monthlyRent=>{
    expect(draftContentSchema.safeParse({...emptyDraft("rent"),advertisement:{monthlyRent}}).success).toBe(false);
  });
  it("separates sales, rentals and room fields and rejects mass assignment",()=>{
    for(const content of [
      {...emptyDraft("buy"),advertisement:{monthlyRent:10}},
      {...emptyDraft("rent"),advertisement:{askingPrice:10}},
      {...emptyDraft("flatshares"),unit:{bhk:2}},
      {...emptyDraft("rent"),userId:"victim"},
      {...emptyDraft("rent"),property:{verified:true}},
      {...emptyDraft("rent"),advertisement:{status:"published"}},
    ])expect(draftContentSchema.safeParse(content).success).toBe(false);
    expect(createDraftSchema.safeParse({requestId:crypto.randomUUID(),content:emptyDraft("buy"),advertiserId:1}).success).toBe(false);
  });
  it.each(["2026-02-29","2026-02-31","2026-13-01","2026-1-01","1899-12-31"])("rejects invalid date %s",availableFrom=>{
    expect(draftContentSchema.safeParse({...emptyDraft("rent"),advertisement:{availableFrom}}).success).toBe(false);
  });
  it("distinguishes unknown charges from zero and keeps relationships independent of profile types",()=>{
    const content=draftContentSchema.parse({...emptyDraft("flatshares"),relationship:"broker",unit:{occupants:0},advertisement:{deposit:0,brokerage:0,monthlyRent:12000}});
    expect(draftReadiness(content).some(issue=>issue.field==="advertisement.deposit")).toBe(false);
    expect(draftReadiness(content).some(issue=>issue.field==="unit.occupants")).toBe(false);
    expect(content.advertisement).toHaveProperty("brokerage",0);
  });
  it("bounds text, amenities, PIN codes and supplied unit fields",()=>{
    for(const patch of [
      {property:{city:"a".repeat(101)}},{property:{pinCode:"000000"}},
      {property:{amenities:["Lift","Lift"]}},{unit:{bhk:0}},{unit:{carpetSqft:1.5}},
      {advertisement:{description:"a".repeat(6001)}},
    ])expect(draftContentSchema.safeParse({...emptyDraft("rent"),...patch}).success).toBe(false);
  });
  it.each(["flatshares","rent","buy"] as const)("recognizes a complete %s draft without enabling publication",category=>{
    const content=draftContentSchema.parse({category,relationship:"tenant",property:{city:"Bengaluru",locality:"HSR Layout",address:"Private address",propertyType:"apartment"},
      unit:category==="flatshares"?{furnishing:"furnished",bedroom:"private",occupants:0}:{furnishing:"furnished",bhk:2,carpetSqft:900,...(category==="rent"?{bathrooms:2}:{})},
      advertisement:{title:"Private home",description:"A description",...(category==="buy"?{askingPrice:8000000}:{monthlyRent:15000,deposit:0,availableFrom:"2026-11-01"})}});
    expect(draftReadiness(content)).toEqual([]);
    expect(content).not.toHaveProperty("status");
  });
});