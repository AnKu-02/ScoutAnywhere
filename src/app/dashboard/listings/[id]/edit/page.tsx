import { notFound } from "next/navigation";
import { requireAccount } from "@/modules/auth/session";
import { readDraft } from "@/modules/listing-drafts/repository";
import { draftIdSchema } from "@/modules/listing-drafts/validation";
import { DraftEditor } from "@/components/draft-editor";
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {user}=await requireAccount();const {id}=await params;
  if(!draftIdSchema.safeParse(id).success)notFound();
  let draft;
  try{draft=await readDraft(user.id,id);}catch{return <p role="alert">This draft is temporarily unavailable. Reload to try again.</p>;}
  if(!draft)notFound();
  return <><h2>Edit private draft</h2><DraftEditor draft={draft}/></>;
}