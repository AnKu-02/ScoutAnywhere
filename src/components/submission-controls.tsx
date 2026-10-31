"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { draftFieldId } from "@/modules/listing-drafts/editor-state";
import type { DraftIssue } from "@/modules/listing-drafts/validation";
import { canResubmit, statusLabels, type Submission } from "@/modules/submissions/validation";

type Readiness={version:number;mediaVersion:number;issues:DraftIssue[];latest:Submission|null};
export function SubmissionControls({draftId,dirty,version}:{draftId:string;dirty:boolean;version:number}){
  const router=useRouter(),key=useRef<string|null>(null),lock=useRef(false);
  const [data,setData]=useState<Readiness|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  const refresh=useCallback(async()=>{
    try{const response=await fetch(`/api/listing-drafts/${draftId}/readiness`,{cache:"no-store"});const result=await response.json();if(!response.ok)throw new Error(result.message);setData(result);}
    catch(error){setMessage(error instanceof Error?error.message:"Could not check submission readiness.");}
  },[draftId]);
  useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return ()=>clearTimeout(timer);},[refresh,version]);
  // Photo mutations have independent persistence; refresh on returning to this section.
  const ready=!!data&&!data.issues.length&&!dirty&&data.version===version&&canResubmit(data.latest?.state);
  return <section className="panel" aria-labelledby="submission-readiness-title" onFocus={()=>{if(!busy&&!confirm)void refresh();}}>
    <h3 id="submission-readiness-title">Submit for human review</h3>
    <p>Submitting captures your saved details and photographs privately. Submission and approval do not publish your listing or verify property rights.</p>
    {data?.latest&&<p><strong>{statusLabels[data.latest.state]}</strong> · <Link href={`/dashboard/submissions/${data.latest.id}`}>View submitted version and feedback</Link></p>}
    {data?.latest?.state==="pending"&&<p>Your submitted listing is under review. You can continue editing your draft, but these changes will not affect the version being reviewed.</p>}
    {dirty&&<p>Save your listing details before submitting.</p>}
    {data?.issues.length? <ul>{data.issues.map(issue=><li key={issue.field}><a href={`#${issue.field==="draft-photos"?issue.field:draftFieldId(issue.field)}`} onClick={event=>{event.preventDefault();const target=document.getElementById(issue.field==="draft-photos"?issue.field:draftFieldId(issue.field));target?.focus();target?.scrollIntoView({block:"center"});}}>{issue.message}</a></li>)}</ul>:ready?<p role="status">Ready to submit for review</p>:null}
    <button type="button" className="button secondary" disabled={busy} onClick={()=>void refresh()}>Check readiness</button>{" "}
    <Link href={`/dashboard/listings/${draftId}/preview`}>Private preview</Link>{" "}
    {canResubmit(data?.latest?.state)&&<button type="button" className="button" disabled={!ready||busy} onClick={()=>setConfirm(true)}>Submit for Review</button>}
    {confirm&&<div className="notice"><p>The saved information and photos will be captured for review. Later draft edits will not change the submitted version. This listing will not become publicly visible.</p><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button>{" "}<button type="button" className="button" disabled={busy} onClick={async()=>{
      if(lock.current||!data)return;lock.current=true;setBusy(true);setMessage("");key.current??=crypto.randomUUID();
      try{const response=await fetch("/api/submissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:key.current,draftId,version:data.version,mediaVersion:data.mediaVersion})});const result=await response.json();if(!response.ok){if(response.status<500)key.current=null;throw new Error(result.message);}setMessage("Submitted privately for review.");router.push("/dashboard/listings");router.refresh();}
      catch(error){setMessage(error instanceof Error?error.message:"Submission interrupted. Retry the same request.");}
      finally{lock.current=false;setBusy(false);setConfirm(false);void refresh();}
    }}>{busy?"Submitting…":"Confirm submission"}</button></div>}
    {message&&<p role="status">{message}</p>}
  </section>;
}

export function ReviewActions({id,version,moderator=false}:{id:string;version:number;moderator?:boolean}){
  const router=useRouter(),lock=useRef(false),[reason,setReason]=useState(moderator?"":"Withdrawn by advertiser"),[decision,setDecision]=useState("approved"),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  return <section className="panel" aria-label={moderator?"Review decision":"Withdraw submission"}>
    {moderator&&<><h3>Record review decision</h3><label htmlFor="review-decision">Decision</label><select id="review-decision" value={decision} onChange={event=>{setDecision(event.target.value);setConfirm(false);}}><option value="approved">Approve (not publish)</option><option value="changes_requested">Request changes</option><option value="rejected">Reject</option></select><label htmlFor="review-reason">Decision reason</label><textarea id="review-reason" maxLength={2000} value={reason} onChange={event=>{setReason(event.target.value);setConfirm(false);}}/><p>A meaningful reason is required and will be visible to the advertiser. Decisions are final for this submitted version.</p></>}
    {!confirm?<button className="button secondary" type="button" disabled={reason.trim().length<5||busy} onClick={()=>setConfirm(true)}>{moderator?"Review decision before confirming":"Withdraw submission"}</button>:<div className="notice"><p>{moderator?`Confirm: ${statusLabels[decision as "approved"|"changes_requested"|"rejected"]}. This does not publish anything.`:"Withdraw this pending submission? Your working draft and review history will remain."}</p><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button>{" "}<button type="button" className="button" disabled={busy} onClick={async()=>{
      if(lock.current)return;lock.current=true;setBusy(true);
      try{const response=await fetch(`/api/${moderator?"moderation":"submissions"}/${id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version,decision:moderator?decision:"withdrawn",reason})});const result=await response.json();if(!response.ok)throw new Error(result.message);setMessage("Review status updated.");router.refresh();}
      catch(error){setMessage(error instanceof Error?error.message:"Review action unavailable.");}
      finally{lock.current=false;setBusy(false);setConfirm(false);}
    }}>{busy?"Saving…":moderator?"Confirm decision":"Confirm withdrawal"}</button></div>}
    {message&&<p role="status">{message}</p>}
  </section>;
}