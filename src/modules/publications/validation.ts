import { z } from "zod";
import { draftContentSchema, type DraftContent } from "../listing-drafts/validation";
import { submissionReadiness } from "../submissions/validation";

export const publicationAction=z.object({action:z.enum(["publish","unpublish"]),reason:z.string().trim().min(5).max(2000).refine(value=>/[\p{L}\p{N}]/u.test(value))}).strict();
export type PublicationState="preparing"|"published"|"unpublished";
export type Publication={id:string;submissionId:string;listingId:number|null;state:PublicationState};
export type CanonicalLocation={id:number;city:string;locality:string;pinCode:string};
export function publicationBlockers(input:DraftContent,locations:CanonicalLocation[]):string[]{
  const c=draftContentSchema.parse(input),issues=submissionReadiness(c,1).map(issue=>issue.message);
  const required=(value:unknown,label:string)=>{if(value===undefined||value===null||value==="")issues.push(`Approved snapshot needs ${label}; obtain a new reviewed submission rather than editing this snapshot.`);};
  required(c.property.building,"building or society details");required(c.property.address,"address");required(c.property.pinCode,"PIN code");required(c.property.propertyType,"property type");required(c.unit.furnishing,"furnishing");
  if(!resolveLocation(c,locations))issues.push("City, locality and PIN must resolve to exactly one existing canonical location. No fuzzy matching or automatic location creation is allowed.");
  if(c.category==="flatshares")required(c.unit.occupants,"existing household size");else required(c.unit.carpetSqft,"carpet area");
  if(c.category!=="buy"){
    required(c.advertisement.availableFrom,"availability date");required(c.advertisement.maintenance,"explicit monthly maintenance (zero is valid)");required(c.advertisement.brokerage,"explicit brokerage (zero is valid)");
    if(c.advertisement.maintenance!==undefined&&c.advertisement.maintenance>2147483647)issues.push("Maintenance exceeds the public integer range (2,147,483,647 rupees).");
  }
  return issues;
}
export function resolveLocation(c:DraftContent,locations:CanonicalLocation[]){
  const normalize=(value:string)=>value.trim().toLocaleLowerCase("en-IN");
  const matches=locations.filter(loc=>normalize(loc.city)===normalize(c.property.city??"")&&normalize(loc.locality)===normalize(c.property.locality??"")&&loc.pinCode===c.property.pinCode);
  return matches.length===1?matches[0]:null;
}
/** Explicit public allowlist: never include account IDs, photo keys, review notes or complete submission JSON. */
export function publicDisclosures(c:DraftContent){
  return {
    ...(c.category==="flatshares"?{bedroom:c.unit.bedroom,householdInfo:c.unit.householdInfo,utilities:c.advertisement.utilities,utilityTerms:c.advertisement.utilityTerms}:{}),
    ...(c.category==="rent"?{bathrooms:c.unit.bathrooms}:{}),
    ...(c.category==="buy"?{propertyAge:c.unit.propertyAge,projectInfo:c.unit.projectInfo}:{}),
    brokerageTerms:c.advertisement.brokerageTerms,
  };
}
export const publicPhotoPath=(publicationId:string,photoId:string)=>`/images/published/${publicationId}/${photoId}`;