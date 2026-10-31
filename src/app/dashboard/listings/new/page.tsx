import { DraftEditor } from "@/components/draft-editor";
import { requireAccount } from "@/modules/auth/session";
import { draftEligibility } from "@/modules/listing-drafts/repository";
export default async function Page(){
  const {user}=await requireAccount();
  let eligible=false;
  try{eligible=await draftEligibility(user.id);}catch{return <p role="alert">Draft creation is temporarily unavailable. Reload to try again.</p>;}
  if(!eligible)return <p role="alert">An active advertiser profile is required to create private drafts.</p>;
  return <><h2>Create Listing</h2><DraftEditor/></>;
}