import Link from "next/link";
import { requireAccount } from "@/modules/auth/session";
import { listDrafts } from "@/modules/listing-drafts/repository";
import { draftCategoryLabels, draftReadiness, DRAFT_LIMIT } from "@/modules/listing-drafts/validation";
import { DraftDelete } from "@/components/draft-delete";
import { DraftPhotoGallery } from "@/components/draft-photo-gallery";

export default async function Page(){
  const {user}=await requireAccount();
  let drafts;
  try{drafts=await listDrafts(user.id);}
  catch{return <p role="alert">Drafts are unavailable. Check that your advertiser profile is active, then reload.</p>;}
  return <><p>Keep flatshare, rental and sale drafts here. Only you can access them. Nothing here is published or verified.</p><Link className="button" href="/dashboard/listings/new">Create Listing</Link>
    <p className="muted">{drafts.length} of {DRAFT_LIMIT} private drafts</p>
    {!drafts.length?<section className="panel"><h2>No listing drafts yet</h2><p>Start with a category and save an incomplete draft. Add more details when you are ready.</p></section>
      :<div className="draft-list">{drafts.map(draft=>{
        const title=draft.content.advertisement.title||"Untitled draft";
        return <article className="panel" key={draft.id}><p className="eyebrow">PRIVATE DRAFT · {draftCategoryLabels[draft.content.category]}</p><h2>{title}</h2><DraftPhotoGallery userId={user.id} draftId={draft.id} coverOnly/><p>{[draft.content.property.locality,draft.content.property.city].filter(Boolean).join(", ")||"Location not added"}</p><p className="muted">Updated {new Date(draft.updatedAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} (IST) · Version {draft.version}</p><p>{draftReadiness(draft.content).length?"Incomplete — you can keep editing":"Draft ready for the next step — public submissions are not open"}</p><nav className="account-links" aria-label={`Actions for ${title}`}><Link href={`/dashboard/listings/${draft.id}/edit`}>Edit draft</Link><Link href={`/dashboard/listings/${draft.id}/preview`}>Preview</Link></nav><DraftDelete id={draft.id} version={draft.version} title={title}/></article>;
      })}</div>}
  </>;
}