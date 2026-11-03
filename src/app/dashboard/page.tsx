import { requireAccount } from "@/modules/auth/session";
import { AccountShell } from "@/components/account-shell";
import { Heart,Building2,ArrowUpRight,ContactRound,MessageCircle } from "lucide-react";
import { savedListingIds } from "@/modules/saved-listings/repository";
import { isPublisher } from "@/modules/publications/repository";
import Link from "next/link";
import { advertiserProfile } from "@/modules/advertisers/repository";
import { advertiserTypeLabels } from "@/modules/advertisers/validation";
import { isModerator } from "@/modules/submissions/repository";
export const dynamic = "force-dynamic";
export const metadata={title:"Your dashboard",robots:{index:false,follow:false}};
export default async function Page() {
  const {user}=await requireAccount();
  const moderatorLink=await isModerator(user.id)?<p><Link className="button secondary" href="/dashboard/moderation">Open moderation review queue</Link></p>:null;
  let advertiser;let advertiserUnavailable=false;
  try{advertiser=await advertiserProfile(user.id);}catch{advertiserUnavailable=true;}
  const count=await savedListingIds(user.id).then(ids=>ids.length).catch(()=>null);
  const advertiserPanel=<section className="panel dashboard-advertiser"><div><span className="dashboard-icon"><ContactRound aria-hidden="true"/></span><h2>Advertiser Profile</h2>{advertiserUnavailable?<p role="alert">Advertiser profile is temporarily unavailable.</p>:advertiser?<><h3>{advertiser.displayName}</h3><p>{advertiserTypeLabels[advertiser.type]} <span className="dashboard-status">{advertiser.status==="active"?"Active · editing enabled":"Suspended"}</span></p><p className="muted">Self-declared information. An active profile does not verify identity, ownership or broker credentials.</p></>:<p className="muted">Advertising a home or an available room? Set up your optional profile. This does not grant verification or publishing privileges.</p>}</div><Link className="button secondary" href="/dashboard/advertiser">{advertiser?"Manage profile":"Set up profile"}<ArrowUpRight size={17} aria-hidden="true"/></Link></section>;
  return <AccountShell workspace title="Your dashboard" description="Everything you need for your next move, in one place."><p className="dashboard-greeting">Welcome back, <strong>{user.name}</strong>.</p><div className="dashboard-action-grid"><section className="panel dashboard-action-card"><span className="dashboard-icon"><Heart aria-hidden="true"/></span><h2>Wishlist</h2><p className="muted">Keep the places you love in one place.</p>{count!==null&&<p className="dashboard-count">{count} {count===1?"place":"places"} in your Wishlist</p>}<Link className="button" href="/dashboard/saved">View Wishlist <ArrowUpRight size={17} aria-hidden="true"/></Link></section><section className="panel dashboard-action-card"><span className="dashboard-icon"><Building2 aria-hidden="true"/></span><h2>My Listings</h2><p className="muted">Create and manage your property listings.</p><p className="dashboard-count">Private drafts, submitted versions and publication status.</p><Link className="button secondary" href="/dashboard/listings">Manage listings <ArrowUpRight size={17} aria-hidden="true"/></Link></section></div>{advertiserPanel}{moderatorLink}{await isPublisher(user.id)&&<p><Link className="button secondary" href="/dashboard/publishing">Open controlled publishing</Link></p>}<p className="dashboard-coming-soon"><MessageCircle size={18} aria-hidden="true"/><Link href="/dashboard/messages">Messages</Link> <span>Keep your property conversations in view.</span></p></AccountShell>;
}