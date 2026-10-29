import { describe, expect, it } from "vitest";
import { parseFilters } from "../src/modules/search/filters";
import { inr, price } from "../src/lib/format";
describe("validated search interface", () => {
  it("defaults category, page and sort", () => { expect(parseFilters({})).toMatchObject({category:"flatshares",page:1,sort:"recent"}); });
  it("coerces URL numbers and ignores room BHK", () => { expect(parseFilters({category:"flatshares",maxPrice:"15000",bhk:"2"})).toMatchObject({maxPrice:15000,bhk:undefined}); });
  it("ignores availability for sale properties", () => { expect(parseFilters({category:"buy",availableBy:"2026-11-15"}).availableBy).toBeUndefined(); });
  it.each([{category:"people"},{minPrice:-1},{minPrice:20,maxPrice:10},{page:0},{page:1.5},{sort:"random"},{availableBy:"2026-02-30"},{city:["Mumbai"]},{brokerageFree:"yes"},{bhk:0},{maxPrice:"Infinity"},{furnishing:"luxury"}])("rejects invalid input %j", input => { expect(()=>parseFilters(input)).toThrow(); });
  it("accepts empty optional filters and trims locality", () => { expect(parseFilters({city:"",locality:" HSR Layout ",bhk:"",maxPrice:""})).toMatchObject({locality:"HSR Layout",maxPrice:undefined,bhk:undefined}); });
});
describe("Indian currency", () => {
  it("uses Indian digit grouping", () => { expect(inr(1234567)).toBe("₹12,34,567"); });
  it("formats rental prices without compact units", () => { expect(price(15000)).toBe("₹15,000"); });
  it("formats lakh and crore sale prices", () => { expect(price(8500000,true)).toBe("₹85 lakh"); expect(price(12500000,true)).toBe("₹1.25 crore"); });
});