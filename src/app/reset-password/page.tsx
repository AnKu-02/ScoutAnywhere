import { AccountShell } from "@/components/account-shell";
import { AuthForm } from "@/components/auth-forms";
import { authReady } from "@/modules/auth/auth";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams; const token=typeof params.token==="string"?params.token:undefined;
  return <AccountShell title="Choose a new password">{(!token||params.error)&&<p role="alert">This reset link is missing or invalid. Request a new link from Forgot password.</p>}<AuthForm mode="reset" token={params.error?undefined:token} enabled={authReady()}/></AccountShell>;
}