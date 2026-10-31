import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/modules/auth/session";
import { readDraft } from "@/modules/listing-drafts/repository";
import { draftCategoryLabels, draftIdSchema, draftReadiness, relationshipLabels } from "@/modules/listing-drafts/validation";
import { inr } from "@/lib/format";

const labels:Record<string,string>={city:"City",locality:"Locality",building:"Building or society",address:"Address",pinCode:"PIN code",propertyType:"Property type",amenities:"Amenities",furnishing:"Furnishing",bedroom:"Bedroom arrangement",occupants:"Existing occupants",houseRules:"House rules",householdInfo:"Household information",bhk:"BHK",bathrooms:"Bathrooms",carpetSqft:"Carpet area (sq ft)",propertyAge:"Property age (years)",projectInfo:"Project information",title:"Title",description:"Description",monthlyRent:"Monthly rent",deposit:"Security deposit",maintenance:"Monthly maintenance",utilities:"Monthly utilities",utilityTerms:"Utility terms",availableFrom:"Available from",askingPrice:"Asking price",brokerage:"One-time brokerage",brokerageTerms:"Brokerage terms"};
const money=new Set(["monthlyRent","deposit","maintenance","utilities","askingPrice","brokerage"]);
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {user}=await requireAccount();const {id}=await params;
  if(!draftIdSchema.safeParse(id).success)notFound();
  let draft;
  try{draft=await readDraft(user.id,id);}catch{return <p role="alert">This preview is temporarily unavailable. Reload to try again.</p>;}
  if(!draft)notFound();
  const content=draft.content;const issues=draftReadiness(content);
  return <><p className="notice">Draft preview. Not published.</p><h2>{content.advertisement.title||"Untitled draft"}</h2><p>{draftCategoryLabels[content.category]} · Private to your account · Version {draft.version}</p><p>Declared relationship: {content.relationship?relationshipLabels[content.relationship]:"Not added"}. Self-declared, not verified.</p>
    <div className="map-placeholder"><strong>No photographs added</strong><span>Uploads are not available. This is not a public property page.</span></div>
    {([ ["property","Location and property"],["unit",content.category==="flatshares"?"Room and household":"Home configuration"],["advertisement","Advertisement and costs"] ] as const).map(([section,title])=><section key={section}><h3>{title}</h3>{Object.keys(content[section]).length?<dl className="draft-preview">{Object.entries(content[section]).map(([key,value])=><div key={key}><dt>{labels[key]}</dt><dd>{Array.isArray(value)?value.join(", ")||"Not added":money.has(key)?inr(Number(value)):String(value).replaceAll("-"," ")}</dd></div>)}</dl>:<p>Not added yet.</p>}</section>)}
    <section><h3>Next-step checklist</h3>{issues.length?<ul>{issues.map(issue=><li key={issue.field}>{issue.message}</li>)}</ul>:<p>Your listing draft is ready for the next step. Public submissions are not available yet.</p>}</section>
    <nav className="account-links" aria-label="Draft navigation"><Link href={`/dashboard/listings/${id}/edit`}>Edit draft</Link><Link href="/dashboard/listings">Back to My Listings</Link></nav>
  </>;
}