import Link from "next/link";
export function AccountShell({ title, children }: { title:string;children:React.ReactNode }) {
  return <section className="container narrow section account-shell"><p className="eyebrow">YOUR SCOUTANYWHERE ACCOUNT</p><h1>{title}</h1><div className="panel">{children}</div></section>;
}
export function AccountNavigation() {
  return <nav className="account-links" aria-label="Account navigation"><Link href="/dashboard">Overview</Link><Link href="/dashboard/saved">Saved Properties</Link><Link href="/dashboard/advertiser">Advertiser</Link><Link href="/account">Profile & security</Link><Link href="/flatshares">Find a home</Link></nav>;
}