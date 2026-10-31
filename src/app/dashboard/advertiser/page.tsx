import { requireAccount } from "@/modules/auth/session";
import { advertiserProfile } from "@/modules/advertisers/repository";
import { advertiserTypeLabels } from "@/modules/advertisers/validation";
import { AccountShell,AccountNavigation } from "@/components/account-shell";
import { AdvertiserProfileForm } from "@/components/advertiser-profile-form";
import Link from "next/link";

export const dynamic="force-dynamic";
export const metadata={title:"Advertiser profile",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function Page(){
  const {user}=await requireAccount();
  let profile;
  try{profile=await advertiserProfile(user.id);}
  catch{return <AccountShell title="Advertiser"><AccountNavigation/><p role="alert">Your advertiser profile is temporarily unavailable. Please reload to try again.</p></AccountShell>;}
  return <AccountShell title="Advertiser"><AccountNavigation/>
    <h2>{profile?"Your advertiser profile":"Become an advertiser"}</h2>
    <p>{profile?"Manage the information you have shared about your advertising activity.":"Planning to advertise a home or an available room? You can optionally set up your profile now. You do not need this to browse or save properties."}</p>
    {profile&&<><dl className="account-facts"><dt>Advertiser name</dt><dd>{profile.displayName}</dd><dt>Self-declared type</dt><dd>{advertiserTypeLabels[profile.type]}</dd><dt>Primary operating city</dt><dd>{profile.primaryCity}</dd><dt>Profile status</dt><dd>{profile.status==="active"?"Active profile — editing enabled":"Suspended — editing unavailable"}</dd><dt>Profile created</dt><dd>{new Date(profile.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"})}</dd></dl><p className="muted">No identity, ownership, tenancy or broker credential checks have been performed. An active profile is not approval to advertise a property.</p></>}
    {profile?.status==="suspended"&&<p className="notice">Your advertiser profile is suspended. You can still browse and save properties. Creating another profile cannot bypass this status.</p>}
    <AdvertiserProfileForm profile={profile} defaultName={user.name}/>
    <hr/><section aria-labelledby="future-listings"><h2 id="future-listings">Private listing drafts</h2><p>An active profile lets you create private drafts for flatshares, rentals and sales. This does not grant verified property rights or public publishing. Demo advertisers and listings cannot be claimed.</p><Link className="button secondary" href="/dashboard/listings">Manage private drafts</Link><p className="muted">Property submissions are not open yet. We are not collecting property documents or verification evidence in this phase.</p></section>
  </AccountShell>;
}