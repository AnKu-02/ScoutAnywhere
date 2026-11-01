import Link from "next/link";
import { requireAccount } from "@/modules/auth/session";
import { listDrafts } from "@/modules/listing-drafts/repository";
import { draftCategoryLabels, draftReadiness, DRAFT_LIMIT } from "@/modules/listing-drafts/validation";
import { DraftDelete } from "@/components/draft-delete";
import { DraftPhotoGallery } from "@/components/draft-photo-gallery";
import { ownSubmissions, readSubmission, isModerator } from "@/modules/submissions/repository";
import { statusLabels } from "@/modules/submissions/validation";
import { ReviewActions } from "@/components/submission-controls";
import { advertiserPublications, isPublisher } from "@/modules/publications/repository";

export default async function Page(){
  const {user}=await requireAccount();
  let drafts;
  try{drafts=await listDrafts(user.id);}
  catch{return <p role="alert">Drafts are unavailable. Check that your advertiser profile is active, then reload.</p>;}
  const submissions=await ownSubmissions(user.id);
  const publications=new Map((await advertiserPublications(user.id)).map(p=>[p.submissionId,p]));
  const latest=new Map<string,(typeof submissions)[number]>();for(const s of submissions)if(!latest.has(s.draftId))latest.set(s.draftId,s);
  const feedback=new Map<string,string>();for(const s of latest.values()){const detail=await readSubmission(user.id,s.id);feedback.set(s.id,detail.events.at(-1)?.reason??"");}
  return <><h2>Private drafts</h2><p>Keep flatshare, rental and sale drafts here. Drafts are private; submitted versions can be accessed by authorized reviewers and publishing operators. Approval does not publish. Only a separate operator action can make an approved version public; this does not verify ownership.</p><Link className="button" href="/dashboard/listings/new">Create private draft</Link>
    {await isPublisher(user.id)&&<p><Link href="/dashboard/publishing">Open controlled publishing</Link></p>}
    {await isModerator(user.id)&&<p><Link href="/dashboard/moderation">Open moderation review queue</Link></p>}
    <p className="muted">{drafts.length} of {DRAFT_LIMIT} private drafts</p>
    {!drafts.length?<section className="panel"><h2>No listing drafts yet</h2><p>Start with a category and save an incomplete draft. Add more details when you are ready.</p></section>
      :<div className="draft-list">{drafts.map(draft=>{
        const title=draft.content.advertisement.title||"Untitled draft";
        const submission=latest.get(draft.id);
        const publication=submission?publications.get(submission.id):undefined;
        return <article className="panel" key={draft.id}><p className="eyebrow">PRIVATE DRAFT · {draftCategoryLabels[draft.content.category]}</p><h2>{title}</h2><DraftPhotoGallery userId={user.id} draftId={draft.id} coverOnly/><p>{[draft.content.property.locality,draft.content.property.city].filter(Boolean).join(", ")||"Location not added"}</p><p className="muted">Listing details saved {new Date(draft.updatedAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} (IST)</p><p>{publication?.state==='published'?"Published":publication?.state==='unpublished'?"Unpublished":submission?statusLabels[submission.state]:"Draft"}</p>{publication?.state==='published'&&<p><Link href={`/listings/${publication.listingId}`}>Open public listing</Link></p>}{submission&&<><p>Latest review feedback: {feedback.get(submission.id)}</p><Link href={`/dashboard/submissions/${submission.id}`}>View submitted version and history</Link>{submission.state==="pending"&&<><p>You can edit the working draft without changing the submitted version.</p><ReviewActions id={submission.id} version={submission.version}/></>}{submission.state==="changes_requested"&&<p>Edit the draft, then submit a new version from Photos and review.</p>}</>}<p>{draftReadiness(draft.content).length?"More details to add — save and continue whenever you like":"Review submission readiness in the editor"}</p><nav className="account-links" aria-label={`Actions for ${title}`}><Link href={`/dashboard/listings/${draft.id}/edit`}>Edit draft</Link><Link href={`/dashboard/listings/${draft.id}/preview`}>Preview</Link></nav><DraftDelete id={draft.id} version={draft.version} title={title}/></article>;
      })}</div>}
    {[...latest.values()].filter(s=>!drafts.some(d=>d.id===s.draftId)).map(s=><article className="panel" key={s.id}><h2>{s.content.advertisement.title}</h2><p>{publications.get(s.id)?.state==='published'?"Published":publications.get(s.id)?.state==='unpublished'?"Unpublished":statusLabels[s.state]} · Working draft deleted</p>{publications.get(s.id)?.state==='published'&&<p><Link href={`/listings/${publications.get(s.id)!.listingId}`}>Open public listing</Link></p>}<p>{feedback.get(s.id)}</p><Link href={`/dashboard/submissions/${s.id}`}>View submitted version and history</Link>{s.state==="pending"&&<ReviewActions id={s.id} version={s.version}/>}</article>)}
  </>;
}