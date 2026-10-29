import { AccountShell } from "@/components/account-shell";
import { AuthForm } from "@/components/auth-forms";
import { authReady } from "@/modules/auth/auth";
export const dynamic = "force-dynamic";
export default function Page() { return <AccountShell title="Reset your password"><p>We’ll email a single-use link that expires in 30 minutes.</p><AuthForm mode="forgot" enabled={authReady()}/></AccountShell>; }