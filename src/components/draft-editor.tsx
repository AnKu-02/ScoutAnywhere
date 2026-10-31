"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftPhotos } from "./draft-photos";
import {draftFieldId,sameDraftContent} from "@/modules/listing-drafts/editor-state";
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
  const formId=useId();
  const [content,setContent]=useState<DraftContent>(draft?.content??emptyDraft("flatshares"));
  const [saved,setSaved]=useState(draft);
  const [initial]=useState(draft?.content??emptyDraft("flatshares"));
  const dirty=!sameDraftContent(content,saved?.content??initial);
  const [activeSection,setActiveSection]=useState("draft-basics");
  const [conflict,setConflict]=useState(false);
  const summary=useRef<HTMLDivElement>(null);
  const discarding=useRef(false);
  const sectionLinks=[["draft-basics","Property basics"],["draft-details",content.category==="flatshares"?"Room details":"Home details"],["draft-pricing","Pricing and availability"],["draft-review","Photos and review"]];
  function focusTarget(id:string){document.getElementById(id)?.focus();document.getElementById(id)?.scrollIntoView({block:"center",behavior:"instant"});}
  const [busy,setBusy]=useState(false);
  const [creationPending,setCreationPending]=useState(false);
  const [message,setMessage]=useState("");
  const [failed,setFailed]=useState(false);
  const [issues,setIssues]=useState<DraftIssue[]>([]);
  useEffect(()=>{if(issues.length)summary.current?.focus();},[issues]);
  const lock=useRef(false);
  // Keep the identical payload when retrying an uncertain create response.
  const pending=useRef<{requestId:string;content:DraftContent}|null>(null);
  useEffect(()=>{
    if(!dirty)return;
    const unload=(event:BeforeUnloadEvent)=>{if(!discarding.current)event.preventDefault();};
    const navigate=(event:MouseEvent)=>{
      if(!(event.target instanceof Element))return;
      const link=event.target.closest("a");
      if(link&&link.getAttribute("href")&&!link.getAttribute("href")!.startsWith("#")&&link.getAttribute("target")!=="_blank"&&!window.confirm("You have unsaved draft changes. Leave without saving?")){
        event.preventDefault();event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload",unload);document.addEventListener("click",navigate,true);
    return ()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
  },[dirty]);
  function change(section:"property"|"unit"|"advertisement",key:string,value:unknown){
    setContent(previous=>({...previous,[section]:{...previous[section],[key]:value}} as DraftContent));
    setMessage("");
  }
  const parsed=draftContentSchema.safeParse(content);
  const readiness=parsed.success?draftReadiness(parsed.data):[];
  function field(section:"property"|"unit"|"advertisement",spec:FieldSpec){
    const path=`${section}.${spec.key}`;
    const error=issues.find(issue=>issue.field===path)?.message;
    const value=(content[section] as Record<string,unknown>)[spec.key];
    const id=`draft-${section}-${spec.key}`;
    const props={id,name:path,value:value===undefined?"":String(value),"aria-invalid":Boolean(error),"aria-describedby":error?`${id}-help`:undefined,
      onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>change(section,spec.key,event.target.value===""?undefined:spec.type==="number"?Number(event.target.value):event.target.value)};
    return <div className="field" key={path}><label htmlFor={id}>{spec.label}</label>
      {spec.options?<select {...props}><option value="">Not added yet</option>{spec.options.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
        :spec.type==="textarea"?<textarea {...props} rows={4} maxLength={spec.max}/>
        :<input {...props} type={spec.type??"text"} maxLength={spec.type?undefined:spec.max} max={spec.type==="date"?"2200-12-31":spec.type==="number"?spec.max:undefined} min={spec.type==="date"?"1900-01-01":spec.min} step={spec.type==="number"?1:undefined} placeholder={spec.placeholder} inputMode={spec.type==="number"?"numeric":undefined}/>}
      {error&&<span id={`${id}-help`} className="muted">{error}</span>}
    </div>;
  }
  const sections=fieldsFor(content.category);
  return <><p className="notice">Private draft only. Your relationship is self-declared, not verified ownership or permission to advertise. Photographs remain private; public submissions are not available.</p>
    <nav className="draft-section-nav" aria-label="Editor sections">{sectionLinks.map(([id,label],index)=><a key={id} href={`#${id}`} aria-current={activeSection===id?"location":undefined} onClick={event=>{event.preventDefault();setActiveSection(id);focusTarget(id);}}>{index+1}. {label}</a>)}<a href="#draft-photos" onClick={()=>setActiveSection("draft-review")}>Jump to Photos ↓</a></nav>
    <form id={formId} className="account-form draft-form" noValidate onSubmit={async event=>{
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
          if(response.status===409&&saved)setConflict(true);
          if(result.issues)setIssues(result.issues.map((issue:DraftIssue)=>({...issue,field:issue.field.replace(/^content\./,"")})));
          throw new Error(result.message??"Could not save this draft.");
        }
        const next=result.draft as ListingDraft;
        setSaved(next);pending.current=null;setCreationPending(false);setConflict(false);
        const unchanged=sameDraftContent(parsed.data,next.content);
        setMessage(unchanged?"Draft saved privately.":"The previous create request was recovered. Your newer changes are still unsaved; save again.");
        // Do not navigate away and discard input after an uncertain-create retry.
        if(creating&&unchanged){router.replace(`/dashboard/listings/${next.id}/edit`);router.refresh();}
      }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Could not save. Try again.");}
      finally{lock.current=false;setBusy(false);}
    }}>
      <div className="draft-save-bar">
        <button type="submit" className="button" disabled={busy||conflict}>{busy?"Saving…":"Save draft"}</button>
        <p role="status">{busy?"Saving listing details…":failed?"Listing details were not saved. Your input is retained.":dirty?"Unsaved changes":saved?"Listing details saved privately":"Not saved yet — incomplete drafts are welcome"}</p>
        <span className="muted">Photos save separately, immediately after each successful change.</span>
      </div>
      {message&&<p role={failed?"alert":"status"} className={failed?"notice":"account-feedback"}>{message}</p>}
      {issues.length>0&&<div className="notice draft-error-summary" ref={summary} tabIndex={-1} aria-labelledby="draft-error-title"><h2 id="draft-error-title">Check these values</h2><p>Blank fields are allowed. Correct only the invalid values below.</p><ul>{issues.map((issue,index)=><li key={`${issue.field}-${index}`}><a href={`#${draftFieldId(issue.field)}`} onClick={event=>{event.preventDefault();const section=issue.field.startsWith("property.")||issue.field==="relationship"?"draft-basics":issue.field.startsWith("unit.")||["advertisement.title","advertisement.description"].includes(issue.field)?"draft-details":"draft-pricing";setActiveSection(section);focusTarget(draftFieldId(issue.field));}}>{issue.field}: {issue.message}</a></li>)}</ul></div>}
      {conflict&&saved&&<aside className="notice" aria-label="Recover unsaved changes"><h2>A newer saved draft needs your attention</h2><p>Your input is still here. Open the saved preview in another tab to compare and copy any local text you want to keep. Saving is paused until you reload the latest draft.</p><a href={`/dashboard/listings/${saved.id}/preview`} target="_blank" rel="noopener noreferrer">Open saved preview in a new tab</a><button className="button secondary" type="button" onClick={()=>{if(window.confirm("Discard local listing changes and reload the latest saved draft? Copy anything you want to keep first.")){discarding.current=true;window.location.reload();}}}>Discard local changes and reload</button></aside>}
      <fieldset disabled={busy}>
        <legend className="sr-only">Private draft details</legend>
        <section id="draft-basics" tabIndex={-1} className="draft-editor-section" aria-labelledby="draft-basics-title">
          <h2 id="draft-basics-title">1. Property basics</h2>
          <div className="field"><label htmlFor="draft-category">Listing category</label><select id="draft-category" value={content.category} disabled={Boolean(saved)||creationPending} onChange={event=>{if(dirty&&!window.confirm("Changing category clears the details entered so far. Continue?"))return;setContent(emptyDraft(event.target.value as DraftContent["category"]));setIssues([]);}}>{Object.entries(draftCategoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
          <p className="muted">Only a category is needed to save. Add the rest in stages. After saving, the category cannot be changed.</p>
          <div className="field"><label htmlFor="draft-relationship">Your relationship to this property</label><select id="draft-relationship" value={content.relationship??""} onChange={event=>setContent(previous=>({...previous,relationship:event.target.value||undefined} as DraftContent))}><option value="">Not added yet</option>{Object.entries(relationshipLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
          <p className="muted">This can differ from your advertiser profile type. It is not a legal claim or verification.</p>
          {propertyFields.map(spec=>field("property",spec))}
          <fieldset><legend>Amenities (optional)</legend>{draftAmenities.map(amenity=><label className="draft-check" key={amenity}><input type="checkbox" checked={content.property.amenities?.includes(amenity)??false} onChange={event=>change("property","amenities",event.target.checked?[...(content.property.amenities??[]),amenity]:(content.property.amenities??[]).filter(item=>item!==amenity))}/>{amenity}</label>)}</fieldset>
        </section>
        <section id="draft-details" tabIndex={-1} className="draft-editor-section" aria-labelledby="draft-details-title"><h2 id="draft-details-title">2. {content.category==="flatshares"?"Room":"Home"} details</h2>{sections.unit.map(spec=>field("unit",spec))}{sections.advertisement.filter(spec=>["title","description"].includes(spec.key)).map(spec=>field("advertisement",spec))}</section>
        <section id="draft-pricing" tabIndex={-1} className="draft-editor-section" aria-labelledby="draft-pricing-title"><h2 id="draft-pricing-title">3. Pricing and availability</h2>{sections.advertisement.filter(spec=>!["title","description"].includes(spec.key)).map(spec=>field("advertisement",spec))}<p className="muted">Enter whole rupees. Blank means not added; 0 means no charge where allowed. Rent, deposit, maintenance, utilities and brokerage are separate.</p></section>
      </fieldset>
    </form>
    <section id="draft-review" tabIndex={-1} className="draft-editor-section" aria-labelledby="draft-review-title"><h2 id="draft-review-title">4. Photos and review</h2>
      <p>Review your details above, then save any text changes before previewing. Photo changes are already saved separately.</p><button className="button secondary" type="submit" form={formId} disabled={busy||conflict}>{busy?"Saving listing details…":"Save listing details"}</button>
      {saved?<DraftPhotos draftId={saved.id} category={saved.content.category}/>:<section id="draft-photos" tabIndex={-1}><h3>Private photos</h3><p>Save your draft first to upload private photographs.</p></section>}
      <section className="panel" aria-labelledby="draft-readiness"><h3 id="draft-readiness">Details to add when you are ready</h3><p>These are suggestions for completeness, not errors. Missing details do not stop you saving. Photos are optional. This checklist is not submission approval.</p>
      {parsed.success?(readiness.length?<ul>{readiness.map(issue=><li key={issue.field}><a href={`#${draftFieldId(issue.field)}`} onClick={event=>{event.preventDefault();focusTarget(draftFieldId(issue.field));}}>{issue.message}</a></li>)}</ul>:<p>Listing details are complete. Public submissions are not available yet.</p>):<p>Correct invalid values to see the completeness checklist.</p>}
      </section>
    </section>
    <nav className="account-links" aria-label="Draft navigation">{saved&&<Link href={`/dashboard/listings/${saved.id}/preview`}>Preview saved draft</Link>}<Link href="/dashboard/listings">Back to My Listings</Link></nav>
  </>;
}