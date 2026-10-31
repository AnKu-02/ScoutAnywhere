import { z } from "zod";
import { draftContentSchema, draftVersionSchema, type DraftContent, type DraftIssue } from "../listing-drafts/validation";

export const POLICY_VERSION="submission-v1";
export const states=["pending","changes_requested","approved","rejected","withdrawn"] as const;
export type SubmissionState=typeof states[number];
export const statusLabels:Record<SubmissionState,string>={pending:"Under review",changes_requested:"Changes requested",approved:"Approved, not published",rejected:"Rejected",withdrawn:"Withdrawn"};
export const submitSchema=z.object({requestId:z.uuid(),draftId:z.uuid(),version:draftVersionSchema,mediaVersion:draftVersionSchema}).strict();
export const actionSchema=z.object({version:draftVersionSchema,decision:z.enum(["approved","changes_requested","rejected","withdrawn"]),reason:z.string().trim().min(5).max(2000).refine(value=>/[\p{L}\p{N}]/u.test(value),"Provide a meaningful reason.")}).strict();
export type SubmitInput=z.infer<typeof submitSchema>;
export type ActionInput=z.infer<typeof actionSchema>;
export function canResubmit(state?:SubmissionState){return !state||state==="withdrawn"||state==="changes_requested";}
export function canTransition(from:SubmissionState,to:SubmissionState){return from==="pending"&&to!=="pending";}
export function submissionReadiness(input:DraftContent,photos:number):DraftIssue[]{
  const content=draftContentSchema.parse(input),issues:DraftIssue[]=[];
  const require=(value:unknown,field:string,message:string)=>{if(value===undefined||value===null||value==="")issues.push({field,message});};
  require(content.advertisement.title,"advertisement.title","Add a listing title.");
  const description=content.advertisement.description??"";
  if(description.length<40||description.split(/\s+/).filter(Boolean).length<6)issues.push({field:"advertisement.description",message:"Describe the home in at least 40 characters and six words."});
  if(!["Bengaluru","Mumbai"].includes(content.property.city??""))issues.push({field:"property.city",message:"Choose Bengaluru or Mumbai."});
  require(content.property.locality,"property.locality","Add the locality.");
  require(content.relationship,"relationship","Declare your relationship to the property (not verified ownership).");
  if(content.category==="flatshares"){
    require(content.unit.bedroom,"unit.bedroom","Choose the room arrangement.");
    require(content.advertisement.availableFrom,"advertisement.availableFrom","Add an availability date.");
  }else{
    require(content.property.propertyType,"property.propertyType","Choose the property type.");
    require(content.unit.bhk,"unit.bhk","Add the BHK configuration.");
    require(content.advertisement.brokerage,"advertisement.brokerage","Disclose brokerage, including an explicit zero if none.");
  }
  if(content.category==="buy"){
    require(content.advertisement.askingPrice,"advertisement.askingPrice","Add the asking price.");
    require(content.unit.carpetSqft,"unit.carpetSqft","Add the carpet area in square feet.");
  }else{
    require(content.advertisement.monthlyRent,"advertisement.monthlyRent","Add the monthly rent.");
    require(content.advertisement.deposit,"advertisement.deposit","Disclose the deposit, including an explicit zero if none.");
    if(content.category==="rent")require(content.advertisement.maintenance,"advertisement.maintenance","Disclose monthly maintenance, including an explicit zero if none.");
  }
  if(photos<1)issues.push({field:"draft-photos",message:"Upload at least one successfully processed photograph."});
  return issues;
}
export type SubmittedPhoto={id:string;key:string;width:number;height:number;size:number;cover:boolean;order:number};
export type Submission={id:string;draftId:string;userId:string;advertiserId:number;advertiserName:string;previousId:string|null;version:number;state:SubmissionState;createdAt:string;decidedAt:string|null;retainUntil:string|null;policyVersion:string;textVersion:number;mediaVersion:number;content:DraftContent;photos:SubmittedPhoto[]};
export type SubmissionEvent={id:string;actorId:string;previousState:SubmissionState|null;state:SubmissionState;reason:string;createdAt:string;version:number};