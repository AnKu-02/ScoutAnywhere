import { describe,it,expect } from "vitest";
import { publicationAction,publicationBlockers,publicDisclosures,publicPhotoPath,resolveLocation } from "../src/modules/publications/validation";
import type { DraftContent } from "../src/modules/listing-drafts/validation";
const locations=[{id:1,city:"Bengaluru",locality:"Indiranagar",pinCode:"560038"}];
const base={property:{city:" Bengaluru ",locality:"indiranagar",pinCode:"560038",building:"Submitted building",address:"Submitted street",propertyType:"apartment" as const},relationship:"owner" as const};
const ad={title:"Approved home",description:"A spacious apartment with natural light and good access to shops and transport.",brokerage:0,brokerageTerms:"No agency fee"};
const fixtures:DraftContent[]=[{...base,category:"rent",unit:{bhk:2,carpetSqft:900,furnishing:"furnished",bathrooms:2},advertisement:{...ad,monthlyRent:30000,deposit:0,maintenance:0,availableFrom:"2026-11-01"}},{...base,category:"buy",unit:{bhk:3,carpetSqft:1400,furnishing:"semi-furnished",propertyAge:5,projectInfo:"Completed building"},advertisement:{...ad,askingPrice:10000000}},{...base,category:"flatshares",unit:{bedroom:"shared",occupants:2,furnishing:"unfurnished",householdInfo:"Quiet household"},advertisement:{...ad,monthlyRent:12000,deposit:0,maintenance:0,utilities:0,utilityTerms:"Usage split equally",availableFrom:"2026-11-01"}}];
describe("approved snapshot to public contract",()=>{
  it.each(fixtures)("maps complete $category without invented fields",content=>{expect(publicationBlockers(content,locations)).toEqual([]);expect(resolveLocation(content,locations)?.id).toBe(1);});
  it("rejects unknown, ambiguous or conflicting canonical locations",()=>{
    const c=fixtures[0];expect(resolveLocation(c,[])).toBeNull();expect(resolveLocation(c,[...locations,...locations])).toBeNull();expect(resolveLocation({...c,property:{...c.property,pinCode:"400001"}},locations)).toBeNull();expect(publicationBlockers(c,[]).join(" ")).toContain("canonical location");
  });
  it("requires explicit address, building, PIN, furnishing and physical configuration",()=>{
    const c={...fixtures[0],property:{city:"Bengaluru",locality:"Indiranagar"},unit:{bhk:2}} as DraftContent;
    const blockers=publicationBlockers(c,locations).join(" ");for(const word of ["building","address","PIN","furnishing","carpet"])expect(blockers).toContain(word);
  });
  it("rejects missing charges, missing rental availability and integer overflow",()=>{
    const c=fixtures[0];if(c.category!=="rent")throw Error();expect(publicationBlockers({...c,advertisement:{...c.advertisement,maintenance:2147483648}},locations).join(" ")).toContain("integer range");
    const blockers=publicationBlockers({...c,advertisement:{...c.advertisement,maintenance:undefined,brokerage:undefined,availableFrom:undefined}},locations).join(" ");expect(blockers).toContain("maintenance");expect(blockers).toContain("brokerage");expect(blockers).toContain("availability");
  });
  it("preserves allowlisted additional disclosures, including explicit zeros",()=>{
    expect(publicDisclosures(fixtures[2])).toMatchObject({bedroom:"shared",householdInfo:"Quiet household",utilities:0,utilityTerms:"Usage split equally"});expect(publicDisclosures(fixtures[1])).toMatchObject({propertyAge:5,projectInfo:"Completed building"});expect(publicDisclosures(fixtures[0])).toMatchObject({bathrooms:2});
    for(const c of fixtures){const output=JSON.stringify(publicDisclosures(c));for(const word of ["storage_key","account","email","moderation","pinCode"])expect(output).not.toContain(word);}
  });
  it("keeps deterministic public paths distinct from private keys",()=>{expect(publicPhotoPath("publication","photo")).toBe("/images/published/publication/photo");});
  it("rejects privileged fields and meaningless or invalid actions",()=>{
    expect(publicationAction.safeParse({action:"publish",reason:"Operator approved preview"}).success).toBe(true);
    for(const input of [{action:"republish",reason:"Something"},{action:"publish",reason:"-----"},{action:"publish",reason:"Confirm publication",actorId:"other"},{action:"publish",reason:"Confirm publication",content:fixtures[0]}])expect(publicationAction.safeParse(input).success).toBe(false);
  });
});