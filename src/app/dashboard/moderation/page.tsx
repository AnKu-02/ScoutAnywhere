import Link from "next/link";
import { requireAccount } from "@/modules/auth/session";
import { reviewQueue, SubmissionError } from "@/modules/submissions/repository";
import { draftCategoryLabels } from "@/modules/listing-drafts/validation";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}){
  const {user}=await requireAccount(),page=Number((await searchParams).page??1);
  let submissions;try{submissions=await reviewQueue(user.id,page);}catch(error){return <p role="alert">{error instanceof SubmissionError?error.message:"Review services are temporarily unavailable."}</p>;}
  return <><h2>Pending review queue</h2><p>Review submitted snapshots, not working drafts. Approval never publishes. Your own submissions are excluded.</p>{!submissions.length&&<p>No pending submissions on this page.</p>}<div className="draft-list">{submissions.map(s=><article className="panel" key={s.id}><h3>{s.content.advertisement.title}</h3><p>{draftCategoryLabels[s.content.category]} · {s.content.property.city}, {s.content.property.locality}</p><p>{s.advertiserName} · {new Date(s.createdAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p><p>Under review</p><Link href={`/dashboard/moderation/${s.id}`}>Review submitted version</Link></article>)}</div><nav className="account-links" aria-label="Review queue pages">{page>1&&<Link href={`/dashboard/moderation?page=${page-1}`}>Previous page</Link>}{submissions.length===25&&<Link href={`/dashboard/moderation?page=${page+1}`}>Next page</Link>}</nav></>;
}