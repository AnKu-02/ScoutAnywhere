"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
export function AccountControl() {
  const [signedIn,setSignedIn]=useState(false);
  const pathname=usePathname();
  useEffect(()=>{const controller=new AbortController();fetch("/api/auth/get-session",{cache:"no-store",signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>setSignedIn(Boolean(data?.user?.emailVerified))).catch(()=>{});return()=>controller.abort();},[pathname]);
  // This is presentation only; every private route independently checks its session.
  return <Link className="account-control" href={signedIn?"/dashboard":"/sign-in"}>{signedIn?"My account":"Sign in"}</Link>;
}