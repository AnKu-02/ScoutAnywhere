"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
const destinations=[["/dashboard","Overview"],["/dashboard/saved","Saved Properties"],["/dashboard/advertiser","Advertiser"],["/dashboard/listings","My Listings"],["/account","Profile & security"],["/flatshares","Find a home"]] as const;
export function AccountNavigation(){
  const pathname=usePathname();
  return <nav className="account-links" aria-label="Account navigation">{destinations.map(([href,label])=><Link key={href} href={href} aria-current={(pathname===href||(href!=="/dashboard"&&pathname.startsWith(`${href}/`)))?"page":undefined}>{label}</Link>)}</nav>;
}