import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AccountShell } from "@/components/account-shell";
import { Messages } from "@/components/messages";
import { currentSession } from "@/modules/auth/session";
import { contactTarget } from "@/modules/messaging/repository";
import { getListing } from "@/modules/listings/repository";
import { listingId,type PropertyContext } from "@/modules/messaging/validation";
export const dynamic="force-dynamic";
export const metadata={title:"Messages",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams;
  const selected=z.uuid().safeParse(params.conversation);
  const target=typeof params.listing==='string'&&/^[1-9]\d{0,9}$/.test(params.listing)?listingId.safeParse(Number(params.listing)):null;
  const returnTo=selected.success?`/dashboard/messages?conversation=${selected.data}`:target?.success?`/dashboard/messages?listing=${target.data}`:'/dashboard/messages';
  const session=await currentSession(await headers());
  if(!session)redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  let draft:PropertyContext|null=null,error='';
  if(target?.success&&!selected.success){
    try{
      const eligibility=await contactTarget(target.data,session.user.id);
      if(eligibility.conversationId)redirect(`/dashboard/messages?conversation=${eligibility.conversationId}`);
      if(!eligibility.eligible||eligibility.own)error=eligibility.own?'You cannot contact yourself about your listing.':'This listing is not available for messaging.';
      else{const l=await getListing(target.data);if(l)draft={id:l.id,title:l.title,locality:l.locality,city:l.city,price:l.price,category:l.category,image:(l.images.find(image=>image.cover)??l.images[0])?.path??null};else error='Listing no longer available.';}
    }catch(e){if(e instanceof Error&&e.message.startsWith('NEXT_REDIRECT'))throw e;error='Listing messaging is temporarily unavailable.';}
  }
  return <AccountShell workspace title="Messages" description="Your conversations, with every property in view."><Messages key={`${selected.success?selected.data:''}:${draft?.id??''}`} selectedId={selected.success?selected.data:null} draft={draft} initialError={error}/></AccountShell>;
}