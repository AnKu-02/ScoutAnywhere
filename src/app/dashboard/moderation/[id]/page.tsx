import { notFound } from "next/navigation";
import { requireAccount } from "@/modules/auth/session";
import { draftIdSchema } from "@/modules/listing-drafts/validation";
import { SubmissionDetail } from "@/components/submission-detail";
import { readSubmission, SubmissionError } from "@/modules/submissions/repository";
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {user}=await requireAccount(),{id}=await params;if(!draftIdSchema.safeParse(id).success)notFound();
  try{await readSubmission(user.id,id,true);}catch(error){if(error instanceof SubmissionError)notFound();return <p role="alert">Review services are temporarily unavailable.</p>;}
  return <SubmissionDetail userId={user.id} id={id} review/>;
}