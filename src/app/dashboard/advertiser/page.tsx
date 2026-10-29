import { requireAccount } from "@/modules/auth/session";
import { advertiserProfile } from "@/modules/advertisers/repository";
import { advertiserTypeLabels } from "@/modules/advertisers/validation";
import { AccountShell,AccountNavigation } from "@/components/account-shell";
import { AdvertiserProfileForm } from "@/components/advertiser-profile-form";

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
    <hr/><section aria-labelledby="future-listings"><h2 id="future-listings">Property submissions are not open yet</h2><p>Creating a profile does not let you add, edit or publish properties. Demo advertisers and listings cannot be claimed. Permission to advertise a specific property will be handled separately in a future release.</p><p className="muted">We are not collecting property documents or verification evidence in this phase.</p></section>
  </AccountShell>;
}