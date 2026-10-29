import { AccountShell } from "@/components/account-shell";
import { AuthForm } from "@/components/auth-forms";
import { authReady } from "@/modules/auth/auth";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  return <AccountShell title="Email verification"><p role="status">{params.error?"This verification link is invalid or expired. Request another below.":"If you arrived from a valid verification email, your address is now verified. You can sign in. Otherwise, check your inbox or request a link below."}</p><p className="muted">Links expire after one hour. Email verification confirms mailbox access only, not identity or property ownership.</p><AuthForm mode="verify" enabled={authReady()}/></AccountShell>;
}