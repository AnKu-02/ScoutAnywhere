import { requireAccount } from "@/modules/auth/session";
import { draftEligibility } from "@/modules/listing-drafts/repository";
import { AccountShell } from "@/components/account-shell";
import Link from "next/link";

export const dynamic="force-dynamic";
export const metadata={title:"My Listings — private drafts",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function Layout({children}:{children:React.ReactNode}){
  const {user}=await requireAccount();
  let eligible=false;
  try{eligible=await draftEligibility(user.id);}
  catch{return <AccountShell workspace title="My Listings"><p role="alert">Drafts are temporarily unavailable. Reload to try again.</p></AccountShell>;}
  if(!eligible)return <AccountShell workspace title="My Listings"><section className="panel"><h2>An active advertiser profile is required</h2><p>Set up your own advertiser profile to create private listing drafts. Suspended profiles cannot create, edit, delete or preview drafts.</p><Link className="button" href="/dashboard/advertiser">Manage advertiser profile</Link><p>You can still browse and add properties to your Wishlist. Demo advertisers and listings cannot be claimed.</p></section></AccountShell>;
  return <AccountShell workspace title="My Listings">{children}</AccountShell>;
}