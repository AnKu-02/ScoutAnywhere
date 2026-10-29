import { requireAccount } from "@/modules/auth/session";
import { preferences } from "@/modules/accounts/repository";
import { AccountShell, AccountNavigation } from "@/components/account-shell";
import { PasswordSettings, ProfileForm } from "@/components/profile-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  const {user}=await requireAccount();const prefs=await preferences(user.id);
  return <AccountShell title="Profile & security"><AccountNavigation/><h2>Your profile</h2><p>Email: {user.email}</p><p className="muted">Email changes and account deletion are not available in this foundation. No marketing emails are sent.</p><ProfileForm name={user.name} image={user.image||""} preferences={prefs}/><hr/><h2>Change password</h2><p>Changing your password signs out other sessions. Password reset signs out all sessions.</p><PasswordSettings/></AccountShell>;
}