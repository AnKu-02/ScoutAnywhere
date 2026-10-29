"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [["/flatshares","Flatshares"],["/rent","Apartments for Rent"],["/buy","Apartments for Sale"],["/pg-management","PG Management"]] as const;
export function NavLinks({label}: {label:string}) {
  const pathname=usePathname();
  return <nav aria-label={label}>{links.map(([href,text])=><Link key={href} href={href} aria-current={pathname===href?"page":undefined}>{text}</Link>)}</nav>;
}