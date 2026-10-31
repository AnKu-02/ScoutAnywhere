import { z } from "zod";

export const draftCategories = ["flatshares", "rent", "buy"] as const;
export const draftCategoryLabels = { flatshares:"Flatshare", rent:"Apartment or house for rent", buy:"Property for sale" } as const;
export const relationshipLabels = { owner:"Property owner", broker:"Broker / real estate agent", tenant:"Existing flatshare tenant" } as const;
export const draftAmenities = ["Lift", "Power backup", "Covered parking", "Security", "Balcony", "Water supply"] as const;
export const DRAFT_LIMIT = 100;
export const DRAFT_BODY_LIMIT = 24576;
const text = (max:number) => z.string().trim().max(max).optional();
const integer = (max:number, min=0) => z.number().int().min(min).max(max).optional();
const money = integer(10000000000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const parsed = new Date(value+"T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===value && value>="1900-01-01" && value<="2200-12-31";
}, "Enter a real date between 1900 and 2200").optional();
const property = z.object({
  city:text(100), locality:text(120), building:text(160), address:text(300),
  pinCode:z.string().regex(/^[1-9][0-9]{5}$/).optional(),
  propertyType:z.enum(["apartment","independent-house"]).optional(),
  amenities:z.array(z.enum(draftAmenities)).max(draftAmenities.length).refine(items=>new Set(items).size===items.length,"Choose each amenity once").optional(),
}).strict();
const commonUnit = { furnishing:z.enum(["furnished","semi-furnished","unfurnished"]).optional() };
const commonAd = { title:text(160), description:text(6000), brokerage:money, brokerageTerms:text(300) };
const shared = { property, relationship:z.enum(["owner","broker","tenant"]).optional() };
export const draftContentSchema = z.discriminatedUnion("category", [
  z.object({category:z.literal("flatshares"),...shared,
    unit:z.object({...commonUnit, bedroom:z.enum(["private","shared"]).optional(), occupants:integer(50), houseRules:text(1200), householdInfo:text(1200)}).strict(),
    advertisement:z.object({...commonAd, monthlyRent:integer(10000000000,1), deposit:money, maintenance:money, utilities:money, utilityTerms:text(300), availableFrom:date}).strict(),
  }).strict(),
  z.object({category:z.literal("rent"),...shared,
    unit:z.object({...commonUnit, bhk:integer(10,1), bathrooms:integer(20,1), carpetSqft:integer(1000000,1)}).strict(),
    advertisement:z.object({...commonAd, monthlyRent:integer(10000000000,1), deposit:money, maintenance:money, availableFrom:date}).strict(),
  }).strict(),
  z.object({category:z.literal("buy"),...shared,
    unit:z.object({...commonUnit, bhk:integer(10,1), carpetSqft:integer(1000000,1), propertyAge:integer(300), projectInfo:text(1200)}).strict(),
    advertisement:z.object({...commonAd, askingPrice:integer(10000000000,1)}).strict(),
  }).strict(),
]);
export type DraftContent = z.infer<typeof draftContentSchema>;
export const draftIdSchema = z.uuid();
export const draftVersionSchema = z.number().int().positive().max(2147483646);
export const createDraftSchema = z.object({requestId:z.uuid(),content:draftContentSchema}).strict();
export const updateDraftSchema = z.object({version:draftVersionSchema,content:draftContentSchema}).strict();
export const deleteDraftSchema = z.object({version:draftVersionSchema}).strict();
export type ListingDraft = {id:string;version:number;createdAt:string;updatedAt:string;content:DraftContent};
export function emptyDraft(category:DraftContent["category"]):DraftContent {
  return draftContentSchema.parse({category,property:{},unit:{},advertisement:{}});
}
export type DraftIssue = {field:string;message:string};
/** Completeness guidance only: never grants submission, verification or publishing rights. */
export function draftReadiness(content:DraftContent):DraftIssue[] {
  const data=draftContentSchema.parse(content);
  const issues:DraftIssue[]=[];
  const required=(value:unknown,field:string,label:string)=>{
    if(value===undefined||value===null||value==="")issues.push({field,message:`Add ${label}.`});
  };
  required(data.relationship,"relationship","your relationship to this property");
  for(const [field,label] of [["city","the city"],["locality","the locality"],["address","the address"],["propertyType","the property type"]] as const)
    required(data.property[field],`property.${field}`,label);
  required(data.unit.furnishing,"unit.furnishing","the furnishing status");
  required(data.advertisement.title,"advertisement.title","a listing title");
  required(data.advertisement.description,"advertisement.description","a description");
  if(data.category==="flatshares"){
    required(data.unit.bedroom,"unit.bedroom","the bedroom arrangement");
    required(data.unit.occupants,"unit.occupants","the number of existing occupants");
  }else{
    required(data.unit.bhk,"unit.bhk","the BHK configuration");
    required(data.unit.carpetSqft,"unit.carpetSqft","the carpet area (needed for a future property record)");
    if(data.category==="rent")required(data.unit.bathrooms,"unit.bathrooms","the number of bathrooms");
  }
  if(data.category==="buy")required(data.advertisement.askingPrice,"advertisement.askingPrice","the asking price");
  else{
    required(data.advertisement.monthlyRent,"advertisement.monthlyRent","the monthly rent");
    required(data.advertisement.deposit,"advertisement.deposit","the security deposit (enter 0 if none)");
    required(data.advertisement.availableFrom,"advertisement.availableFrom","the available-from date");
  }
  return issues;
}