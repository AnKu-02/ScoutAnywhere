"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { accountDestination } from "@/modules/auth/destination";

export async function accountRequest(path: string, body: object, method = "POST") {
  const response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? "Too many attempts. Please wait before trying again." : data.message || "Request failed. Please try again.");
  return data;
}
type Mode = "register" | "sign-in" | "forgot" | "reset" | "verify";
export function AuthForm({ mode, enabled, token, destination }: { mode: Mode; enabled: boolean; token?: string; destination?:string }) {
  const router = useRouter();
  const [message,setMessage] = useState(""); const [busy,setBusy] = useState(false); const [failed,setFailed] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFailed(false); setMessage("");
    const data = new FormData(event.currentTarget); const email=String(data.get("email")||""); const password=String(data.get("password")||"");
    try {
      if (mode === "register") { await accountRequest("/api/auth/sign-up/email", {name:data.get("name"),email,password,callbackURL:"/verify-email"}); setMessage("Check your email to verify your address. If you already have an account, sign in or reset your password."); }
      if (mode === "sign-in") { await accountRequest("/api/auth/sign-in/email",{email,password,rememberMe:true}); router.push(accountDestination(destination)); router.refresh(); }
      if (mode === "forgot") { await accountRequest("/api/auth/request-password-reset",{email,redirectTo:"/reset-password"}); setMessage("If an account exists, a password-reset link will be emailed. Check your inbox."); }
      if (mode === "reset") { await accountRequest("/api/auth/reset-password",{newPassword:password,token}); setMessage("Password changed. Existing sessions have been revoked. You can now sign in."); }
      if (mode === "verify") { await accountRequest("/api/auth/send-verification-email",{email,callbackURL:"/verify-email"}); setMessage("If verification is needed, a link will be emailed. Check your inbox."); }
    } catch(error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally {setBusy(false);}
  }
  return <form className="account-form" onSubmit={submit}>
    {!enabled && <p className="notice" role="status">Account services are not configured. Local setup requires an authentication secret and SMTP delivery. Property discovery remains available.</p>}
    <fieldset disabled={!enabled||busy||(mode==="reset"&&!token)}>
      <legend className="sr-only">Account details</legend>
      {mode==="register" && <label className="field"><span>Display name</span><input name="name" autoComplete="nickname" required minLength={2} maxLength={80}/></label>}
      {mode!=="reset" && <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" required maxLength={254}/></label>}
      {["register","sign-in","reset"].includes(mode) && <label className="field"><span>{mode==="reset"?"New password":"Password"}</span><input name="password" type="password" autoComplete={mode==="sign-in"?"current-password":"new-password"} required minLength={mode==="sign-in"?1:12} maxLength={128}/></label>}
      {["register","reset"].includes(mode) && <p className="muted">Use a unique password of 12–128 characters. A long passphrase is welcome.</p>}
      <button className="button" type="submit">{busy?"Please wait…":{register:"Create account","sign-in":"Sign in",forgot:"Send reset link",reset:"Set new password",verify:"Resend verification link"}[mode]}</button>
    </fieldset>
    {message && <p className={failed?"notice":"account-feedback"} role={failed?"alert":"status"}>{message}</p>}
    <nav className="account-links" aria-label="Account help"><Link href="/sign-in">Sign in</Link><Link href="/register">Create account</Link><Link href="/forgot-password">Forgot password?</Link><Link href="/verify-email">Verify email</Link></nav>
  </form>;
}
export function SignOut() {
  const router=useRouter(); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  return <><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await accountRequest("/api/auth/sign-out",{});router.push("/sign-in");router.refresh();}catch{setMessage("Could not sign out. Please try again.");}finally{setBusy(false);}}}>Sign out</button>{message&&<p role="alert">{message}</p>}</>;
}