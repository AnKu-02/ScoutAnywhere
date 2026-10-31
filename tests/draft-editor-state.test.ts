import {describe,it,expect} from "vitest";
import {sameDraftContent,draftFieldId} from "../src/modules/listing-drafts/editor-state";
import {emptyDraft} from "../src/modules/listing-drafts/validation";
describe("private editor persisted comparison",()=>{
  it("clears dirty state after a field returns to its saved value",()=>{
    const saved=emptyDraft("rent");saved.property.city="Mumbai";
    expect(sameDraftContent({...saved,property:{city:"Bengaluru"}},saved)).toBe(false);
    expect(sameDraftContent({...saved,property:{city:"Mumbai"}},saved)).toBe(true);
  });
  it("compares trimmed values, missing keys and amenity order without hiding invalid input",()=>{
    const saved=emptyDraft("flatshares");saved.property={city:"Bengaluru",amenities:["Lift","Balcony"]};
    expect(sameDraftContent({...saved,property:{amenities:["Balcony","Lift"],city:" Bengaluru ",building:undefined}},saved)).toBe(true);
    expect(sameDraftContent({...saved,property:{...saved.property,pinCode:"bad"}},saved)).toBe(false);
  });
  it("compares explicit zero and category differences and resolves field links",()=>{
    const saved=emptyDraft("rent");
    if(saved.category!=="rent")throw new Error("Expected rental");
    expect(sameDraftContent({...saved,advertisement:{deposit:0}},saved)).toBe(false);
    expect(sameDraftContent(emptyDraft("buy"),saved)).toBe(false);
    expect(draftFieldId("advertisement.monthlyRent")).toBe("draft-advertisement-monthlyRent");
    expect(draftFieldId("relationship")).toBe("draft-relationship");
  });
});