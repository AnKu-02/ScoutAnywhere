import {describe,it,expect} from "vitest";
import {savedWriteSchema,savedPage} from "../src/modules/saved-listings/validation";
import {accountDestination} from "../src/modules/auth/destination";
describe("saved listing input",()=>{
  it("accepts listing identity only",()=>expect(savedWriteSchema.parse({listingId:8})).toEqual({listingId:8}));
  it.each([0,-1,1.2,2147483648,"8",null])("rejects invalid listing ID %s",listingId=>expect(savedWriteSchema.safeParse({listingId}).success).toBe(false));
  it("rejects user IDs and extra authority fields",()=>expect(savedWriteSchema.safeParse({listingId:8,userId:"another-user"}).success).toBe(false));
  it("bounds saved pagination",()=>{expect(savedPage("2")).toBe(2);for(const value of ["0","-1","1000",[],undefined,"1;DROP"])expect(savedPage(value)).toBe(1);});
});
describe("account return destination",()=>{
  it("allows a specific internal listing and saved dashboard",()=>{expect(accountDestination("/listings/8")).toBe("/listings/8");expect(accountDestination("/dashboard/saved")).toBe("/dashboard/saved");});
  it.each(["https://evil.example","//evil.example","/\\evil.example","/%2f%2fevil.example","/listings/8?next=https://evil.example","/listings/../account",["/listings/8"],undefined])("rejects arbitrary destination %s",value=>expect(accountDestination(value)).toBe("/dashboard"));
});