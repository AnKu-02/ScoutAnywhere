import { headers } from "next/headers";
import Link from "next/link";
import { currentSession } from "@/modules/auth/session";
import { contactTarget } from "@/modules/messaging/repository";
export async function ContactAdvertiser({listingId,demo}:{listingId:number;demo:boolean}){
  if(demo)return <p className="muted">Fictional demo · live messaging is not available.</p>;
  const result=await (async()=>{try{const session=await currentSession(await headers());return {session,target:await contactTarget(listingId,session?.user.id)};}catch{return null;}})();
  if(!result)return <p className="muted">Advertiser messaging is temporarily unavailable.</p>;
  const {session,target}=result;
  if(target.own)return <p className="muted">This is your listing. Inquiries appear in <Link href="/dashboard/messages">Messages</Link>.</p>;
  if(!target.eligible)return <p className="muted">Advertiser messaging is currently unavailable.</p>;
  const destination=target.conversationId?`/dashboard/messages?conversation=${target.conversationId}`:`/dashboard/messages?listing=${listingId}`;
  return <p><Link className="button" href={session?destination:`/sign-in?next=${encodeURIComponent(destination)}`}>{target.conversationId?'Continue conversation':'Contact Advertiser'}</Link></p>;
}