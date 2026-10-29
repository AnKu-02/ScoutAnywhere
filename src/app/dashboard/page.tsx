import { requireAccount } from "@/modules/auth/session";
import { AccountShell, AccountNavigation } from "@/components/account-shell";
import { SignOut } from "@/components/auth-forms";
import Link from "next/link";
import { advertiserProfile } from "@/modules/advertisers/repository";
import { advertiserTypeLabels } from "@/modules/advertisers/validation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const {user}=await requireAccount();
  let advertiser;let advertiserUnavailable=false;
  try{advertiser=await advertiserProfile(user.id);}catch{advertiserUnavailable=true;}
  const advertiserPanel=<section className="panel"><h2>Advertiser</h2>{advertiserUnavailable?<p role="alert">Advertiser profile is temporarily unavailable.</p>:advertiser?<><p>{advertiser.displayName} · {advertiserTypeLabels[advertiser.type]}</p><p>Profile status: {advertiser.status==="active"?"Active — editing enabled":"Suspended"}. Self-declared information, not verified.</p></>:<p>Optional profile setup for owners, brokers and existing flatshare tenants. No listing or ownership permissions are granted.</p>}<Link className="button secondary" href="/dashboard/advertiser">{advertiser?"Manage advertiser profile":"Become an advertiser"}</Link></section>;
  return <AccountShell title="Your dashboard"><AccountNavigation/><h2>Hello, {user.name}</h2><dl className="account-facts"><dt>Email address</dt><dd>{user.email}</dd><dt>Account created</dt><dd>{new Date(user.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"})}</dd></dl><p className="muted">Email confirmed. This is not identity, ownership or broker verification.</p><section className="panel"><h2>Saved Properties</h2><p>Keep interesting flatshares, rentals and homes for sale together in your private collection.</p><Link className="button" href="/dashboard/saved">View saved properties</Link></section>{advertiserPanel}<div className="account-grid">{[ ["My listings","Property submissions and advertiser permissions are not available. Demo listings cannot be claimed."],["Messages","In-app messaging is not available yet."] ].map(([title,text])=><section className="panel" key={title}><h3>{title}</h3><p>{text}</p><span className="tag">Not available yet</span></section>)}</div><SignOut/></AccountShell>;
}