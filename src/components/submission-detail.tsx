/* eslint-disable @next/next/no-img-element -- Private session-authorized images must not use the public optimizer. */
import Link from "next/link";
import { photosExpired, readSubmission } from "@/modules/submissions/repository";
import { statusLabels, type Submission, type SubmissionEvent } from "@/modules/submissions/validation";
import { draftCategoryLabels, relationshipLabels } from "@/modules/listing-drafts/validation";
import { ReviewActions } from "./submission-controls";
import { inr } from "@/lib/format";

const labels:Record<string,string>={city:"City",locality:"Locality",building:"Building or society",address:"Address",pinCode:"PIN code",propertyType:"Property type",amenities:"Amenities",furnishing:"Furnishing",bedroom:"Bedroom arrangement",occupants:"Existing occupants",houseRules:"House rules",householdInfo:"Household information",bhk:"BHK",bathrooms:"Bathrooms",carpetSqft:"Carpet area (sq ft)",propertyAge:"Property age (years)",projectInfo:"Project information",title:"Title",description:"Description",monthlyRent:"Monthly rent",deposit:"Security deposit",maintenance:"Monthly maintenance",utilities:"Monthly utilities",utilityTerms:"Utility terms",availableFrom:"Available from",askingPrice:"Asking price",brokerage:"One-time brokerage",brokerageTerms:"Brokerage terms"};
const money=new Set(["monthlyRent","deposit","maintenance","utilities","askingPrice","brokerage"]);
export async function SubmissionDetail({userId,id,review=false}:{userId:string;id:string;review?:boolean}){
  const {submission:s,events}=await readSubmission(userId,id,review);
  const expired=photosExpired(s);
  const base=review?"/dashboard/moderation":"/dashboard/submissions";
  return <><p className="notice">Immutable submitted version. Private, not published. {statusLabels[s.state]}</p><h2>{s.content.advertisement.title}</h2>
    <p>{draftCategoryLabels[s.content.category]} · Advertiser: {s.advertiserName}</p><p>Submitted {new Date(s.createdAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST · Snapshot {s.id}</p>
    <p>Declared relationship: {s.content.relationship?relationshipLabels[s.content.relationship]:"Not added"}. Self-declared, not verified.</p>
    <p>Readiness at submission: required details complete and at least one processed photograph. Policy {s.policyVersion}.</p>
    {expired?<p className="notice">The photograph retention period has expired. Review history remains available.</p>:<div className="draft-photo-grid">{s.photos.map((photo,index)=><figure className="photo-card" key={photo.id}><img src={`/api/${review?"moderation":"submissions"}/${s.id}/photos/${photo.id}`} alt={`Submitted property photograph ${index+1}${photo.cover?", cover":""}`} width={photo.width} height={photo.height}/><figcaption>{photo.cover?"Submitted cover":"Submitted photograph"} · {index+1}</figcaption></figure>)}</div>}
    {([ ["property","Location and property"],["unit","Room / home configuration"],["advertisement","Advertisement and costs"] ] as const).map(([section,title])=><section key={section}><h3>{title}</h3><dl className="draft-preview">{Object.entries(s.content[section]).map(([key,value])=><div key={key}><dt>{labels[key]??key}</dt><dd>{Array.isArray(value)?value.join(", "):money.has(key)?inr(Number(value)):String(value).replaceAll("-"," ")}</dd></div>)}</dl></section>)}
    <EventHistory submission={s} events={events}/>
    {s.previousId&&<p><Link href={`${base}/${s.previousId}`}>Previous linked submission and feedback</Link></p>}
    {s.state==="pending"&&<ReviewActions id={s.id} version={s.version} moderator={review}/>}
    <nav className="account-links">{!review&&<Link href={`/dashboard/listings/${s.draftId}/edit`}>Edit working draft</Link>}<Link href={review?"/dashboard/moderation":"/dashboard/listings"}>{review?"Back to review queue":"Back to My Listings"}</Link></nav>
  </>;
}
function EventHistory({submission,events}:{submission:Submission;events:SubmissionEvent[]}){return <section><h3>Submission and decision history</h3><ol>{events.map(event=><li key={event.id}><strong>{statusLabels[event.state]}</strong> — {event.reason}<p className="muted">{new Date(event.createdAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST · {event.actorId===submission.userId?"Advertiser":"Moderator"} account {event.actorId} · revision {event.version}</p></li>)}</ol></section>;}