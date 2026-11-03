"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import { LayoutDashboard,Heart,Building2,ContactRound,Shield,ArrowUpRight,MessageCircle } from "lucide-react";
import { SignOut } from "./auth-forms";
const destinations=[["/dashboard","Overview",LayoutDashboard],["/dashboard/saved","Wishlist",Heart],["/dashboard/messages","Messages",MessageCircle],["/dashboard/listings","My Listings",Building2],["/dashboard/advertiser","Advertiser Profile",ContactRound],["/account","Profile & Security",Shield]] as const;
export function AccountNavigation(){
  const pathname=usePathname();
  return <><nav className="dashboard-navigation" aria-label="Account navigation">{destinations.map(([href,label,Icon])=><Link key={href} href={href} aria-current={(pathname===href||(href!=="/dashboard"&&pathname.startsWith(`${href}/`)))?"page":undefined}><Icon size={19} aria-hidden="true"/>{label}</Link>)}</nav><div className="dashboard-sidebar-bottom"><Link href="/flatshares"><ArrowUpRight size={18} aria-hidden="true"/>Explore properties</Link><SignOut/></div></>;
}