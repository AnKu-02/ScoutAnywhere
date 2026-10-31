"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDraftSchema, draftAmenities, draftCategoryLabels, draftContentSchema, draftReadiness, emptyDraft, relationshipLabels, type DraftContent, type DraftIssue, type ListingDraft } from "@/modules/listing-drafts/validation";

type FieldSpec={key:string;label:string;type?:"number"|"date"|"textarea";max?:number;min?:number;options?:readonly (readonly [string,string])[];placeholder?:string};
const furnishing=[ ["furnished","Furnished"],["semi-furnished","Semi-furnished"],["unfurnished","Unfurnished"] ] as const;
const propertyFields:FieldSpec[]=[
  {key:"city",label:"City",max:100,placeholder:"e.g. Bengaluru or Mumbai"},
  {key:"locality",label:"Locality",max:120,placeholder:"e.g. HSR Layout or Powai"},
  {key:"building",label:"Building or society name",max:160},
  {key:"address",label:"Address",max:300},
  {key:"pinCode",label:"PIN code",max:6},
  {key:"propertyType",label:"Property type",options:[["apartment","Apartment"],["independent-house","Independent house"]]},
];
function fieldsFor(category:DraftContent["category"]):{unit:FieldSpec[];advertisement:FieldSpec[]} {
  const unit:FieldSpec[]=[{key:"furnishing",label:"Furnishing",options:furnishing}];
  const advertisement:FieldSpec[]=[{key:"title",label:"Listing title",max:160,placeholder:"e.g. Furnished private room in HSR Layout"},{key:"description",label:"Description",type:"textarea",max:6000}];
  if(category==="flatshares")unit.push(
    {key:"bedroom",label:"Bedroom arrangement",options:[["private","Private bedroom"],["shared","Shared bedroom"]]},
    {key:"occupants",label:"Existing occupants (excluding incoming residents)",type:"number",min:0,max:50},
    {key:"houseRules",label:"House rules",type:"textarea",max:1200},
    {key:"householdInfo",label:"Additional household information",type:"textarea",max:1200},
  );
  else{
    unit.push({key:"bhk",label:"BHK configuration",type:"number",min:1,max:10},{key:"carpetSqft",label:"Carpet area (sq ft)",type:"number",min:1,max:1000000});
    if(category==="rent")unit.push({key:"bathrooms",label:"Bathrooms",type:"number",min:1,max:20});
    else unit.push({key:"propertyAge",label:"Property age in years (if known)",type:"number",min:0,max:300},{key:"projectInfo",label:"Project information (optional)",type:"textarea",max:1200});
  }
  if(category==="buy")advertisement.push({key:"askingPrice",label:"Asking price (INR)",type:"number",min:1,max:10000000000});
  else{
    advertisement.push({key:"monthlyRent",label:"Monthly rent (INR)",type:"number",min:1,max:10000000000},{key:"deposit",label:"Security deposit (INR)",type:"number",min:0,max:10000000000},
      {key:"maintenance",label:"Monthly maintenance (INR, optional)",type:"number",min:0,max:10000000000},{key:"availableFrom",label:"Available from",type:"date"});
    if(category==="flatshares")advertisement.push({key:"utilities",label:"Monthly utilities (INR, if known)",type:"number",min:0,max:10000000000},{key:"utilityTerms",label:"Utility charges explanation",max:300});
  }
  advertisement.push({key:"brokerage",label:"One-time brokerage (INR, optional)",type:"number",min:0,max:10000000000},{key:"brokerageTerms",label:"Brokerage terms (optional)",max:300});
  return {unit,advertisement};
}

export function DraftEditor({draft}:{draft?:ListingDraft}){
  const router=useRouter();
  const [content,setContent]=useState<DraftContent>(draft?.content??emptyDraft("flatshares"));
  const [saved,setSaved]=useState(draft);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [creationPending,setCreationPending]=useState(false);
  const [message,setMessage]=useState("");
  const [failed,setFailed]=useState(false);
  const [issues,setIssues]=useState<DraftIssue[]>([]);
  const lock=useRef(false);
  // Keep the identical payload when retrying an uncertain create response.
  const pending=useRef<{requestId:string;content:DraftContent}|null>(null);
  useEffect(()=>{
    if(!dirty)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    const navigate=(event:MouseEvent)=>{
      if(!(event.target instanceof Element))return;
      const link=event.target.closest("a");
      if(link&&link.getAttribute("href")&&!link.getAttribute("href")!.startsWith("#")&&!window.confirm("You have unsaved draft changes. Leave without saving?")){
        event.preventDefault();event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload",unload);document.addEventListener("click",navigate,true);
    return ()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
  },[dirty]);
  function change(section:"property"|"unit"|"advertisement",key:string,value:unknown){
    setContent(previous=>({...previous,[section]:{...previous[section],[key]:value}} as DraftContent));
    setDirty(true);setMessage("");
  }
  const parsed=draftContentSchema.safeParse(content);
  const readiness=parsed.success?draftReadiness(parsed.data):[];
  function field(section:"property"|"unit"|"advertisement",spec:FieldSpec){
    const path=`${section}.${spec.key}`;
    const error=issues.find(issue=>issue.field===path)?.message;
    const missing=readiness.find(issue=>issue.field===path)?.message;
    const value=(content[section] as Record<string,unknown>)[spec.key];
    const id=`draft-${section}-${spec.key}`;
    const props={id,name:path,value:value===undefined?"":String(value),"aria-invalid":Boolean(error),"aria-describedby":error||missing?`${id}-help`:undefined,
      onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>change(section,spec.key,event.target.value===""?undefined:spec.type==="number"?Number(event.target.value):event.target.value)};
    return <div className="field" key={path}><label htmlFor={id}>{spec.label}</label>
      {spec.options?<select {...props}><option value="">Not added yet</option>{spec.options.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
        :spec.type==="textarea"?<textarea {...props} rows={4} maxLength={spec.max}/>
        :<input {...props} type={spec.type??"text"} maxLength={spec.type?undefined:spec.max} max={spec.type==="date"?"2200-12-31":spec.type==="number"?spec.max:undefined} min={spec.type==="date"?"1900-01-01":spec.min} step={spec.type==="number"?1:undefined} placeholder={spec.placeholder} inputMode={spec.type==="number"?"numeric":undefined}/>}
      {(error||missing)&&<span id={`${id}-help`} className="muted">{error??`${missing} Needed for a future next step, not to save.`}</span>}
    </div>;
  }
  const sections=fieldsFor(content.category);
  return <><p className="notice">Private draft only. Your relationship is self-declared, not verified ownership or permission to advertise. Public submissions and photograph uploads are not available.</p>
    <form className="account-form draft-form" noValidate onSubmit={async event=>{
      event.preventDefault();if(lock.current)return;
      setIssues([]);setMessage("");setFailed(false);
      if(!parsed.success){setIssues(parsed.error.issues.map(issue=>({field:issue.path.join("."),message:issue.message})));setMessage("Check the highlighted fields. You can leave fields blank, but supplied values must be valid.");setFailed(true);return;}
      lock.current=true;setBusy(true);
      try{
        const creating=!saved;
        if(creating&&!pending.current){pending.current=createDraftSchema.parse({requestId:crypto.randomUUID(),content:parsed.data});setCreationPending(true);}
        const body=creating?pending.current!:{version:saved!.version,content:parsed.data};
        const response=await fetch(creating?"/api/listing-drafts":`/api/listing-drafts/${saved!.id}`,{method:creating?"POST":"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        const result=await response.json();
        if(!response.ok){
          if(response.status===400){pending.current=null;setCreationPending(false);}
          if(result.issues)setIssues(result.issues.map((issue:DraftIssue)=>({...issue,field:issue.field.replace(/^content\./,"")})));
          throw new Error(result.message??"Could not save this draft.");
        }
        const next=result.draft as ListingDraft;
        setSaved(next);pending.current=null;setCreationPending(false);
        const unchanged=JSON.stringify(parsed.data)===JSON.stringify(next.content);
        setDirty(!unchanged);setMessage(unchanged?"Draft saved privately.":"The previous create request was recovered. Your newer changes are still unsaved; save again.");
        // Do not navigate away and discard input after an uncertain-create retry.
        if(creating&&unchanged){router.replace(`/dashboard/listings/${next.id}/edit`);router.refresh();}
      }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Could not save. Try again.");}
      finally{lock.current=false;setBusy(false);}
    }}>
      <fieldset disabled={busy}><legend>1. Listing category</legend><div className="field"><label htmlFor="draft-category">Listing category</label><select id="draft-category" value={content.category} disabled={Boolean(saved)||creationPending} onChange={event=>{setContent(emptyDraft(event.target.value as DraftContent["category"]));setDirty(true);setIssues([]);}}>{Object.entries(draftCategoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
        <p className="muted">Only a category is needed to save. Add the rest in stages. After saving, the category cannot be changed.</p>
        <div className="field"><label htmlFor="draft-relationship">Your relationship to this property</label><select id="draft-relationship" value={content.relationship??""} onChange={event=>{setContent(previous=>({...previous,relationship:event.target.value||undefined} as DraftContent));setDirty(true);}}><option value="">Not added yet</option>{Object.entries(relationshipLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
        <p className="muted">This can differ from your advertiser profile type. It is not a legal claim or verification.</p>
        <h2>2. Location and property</h2>{propertyFields.map(spec=>field("property",spec))}
        <fieldset><legend>Amenities (optional)</legend>{draftAmenities.map(amenity=><label className="draft-check" key={amenity}><input type="checkbox" checked={content.property.amenities?.includes(amenity)??false} onChange={event=>change("property","amenities",event.target.checked?[...(content.property.amenities??[]),amenity]:(content.property.amenities??[]).filter(item=>item!==amenity))}/>{amenity}</label>)}</fieldset>
        <h2>3. {content.category==="flatshares"?"Room and household":"Home configuration"}</h2>{sections.unit.map(spec=>field("unit",spec))}
        <h2>4. Advertisement and costs</h2>{sections.advertisement.map(spec=>field("advertisement",spec))}
        <p className="muted">Enter whole rupees. Blank means not added; 0 means no charge where allowed. Rent, deposit, maintenance, utilities and brokerage are separate.</p>
        <button type="submit" className="button">{busy?"Saving…":"Save draft"}</button>
      </fieldset>
      {message&&<p role={failed?"alert":"status"} className={failed?"notice":"account-feedback"}>{message}</p>}
      <p className="muted" role="status">{dirty?"Unsaved changes":"No unsaved changes"}{saved?` · Saved version ${saved.version}`:""}</p>
    </form>
    <section className="panel" aria-labelledby="draft-readiness"><h2 id="draft-readiness">Next-step checklist</h2><p>Missing details do not stop you saving. Images are deferred.</p>
      {parsed.success?(readiness.length?<ul>{readiness.map(issue=><li key={issue.field}>{issue.message}</li>)}</ul>:<p>Your listing draft is ready for the next step. Public submissions are not available yet.</p>):<p>Correct invalid values to see the checklist.</p>}
    </section>
    <nav className="account-links" aria-label="Draft navigation">{saved&&<Link href={`/dashboard/listings/${saved.id}/preview`}>Preview saved draft</Link>}<Link href="/dashboard/listings">Back to My Listings</Link></nav>
  </>;
}