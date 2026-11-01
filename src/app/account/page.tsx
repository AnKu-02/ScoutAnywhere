import { requireAccount } from "@/modules/auth/session";
import { preferences } from "@/modules/accounts/repository";
import { AccountShell } from "@/components/account-shell";
import { PasswordSettings, ProfileForm } from "@/components/profile-form";
export const dynamic = "force-dynamic";
export const metadata={title:"Profile & Security"};
export default async function Page() {
  const {user}=await requireAccount();const prefs=await preferences(user.id);
  return <AccountShell workspace title="Profile & Security" description="Your account details, preferences and sign-in security."><section className="panel"><h2>Your profile</h2><dl className="account-facts"><dt>Email address</dt><dd>{user.email}</dd><dt>Account created</dt><dd>{new Date(user.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"})}</dd></dl><p className="muted">Email confirmed. This is not identity, ownership or broker verification.</p><p className="muted">Email changes and account deletion are not available in this foundation. No marketing emails are sent.</p><ProfileForm name={user.name} image={user.image||""} preferences={prefs}/></section><section className="panel"><h2>Change password</h2><p>Changing your password signs out other sessions. Password reset signs out all sessions.</p><PasswordSettings/></section></AccountShell>;
}