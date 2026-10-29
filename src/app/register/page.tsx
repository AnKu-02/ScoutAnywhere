import { AccountShell } from "@/components/account-shell";
import { AuthForm } from "@/components/auth-forms";
import { authReady } from "@/modules/auth/auth";
export const dynamic = "force-dynamic";
export default function Page() { return <AccountShell title="Create your account"><p>Start with your display name and email. Verify your email before signing in.</p><p className="muted">Registration does not verify your identity, property ownership or broker status. It does not grant access to edit demo listings.</p><AuthForm mode="register" enabled={authReady()}/></AccountShell>; }