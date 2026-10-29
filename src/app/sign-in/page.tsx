import { AccountShell } from "@/components/account-shell";
import { AuthForm } from "@/components/auth-forms";
import { authReady } from "@/modules/auth/auth";
import { accountDestination } from "@/modules/auth/destination";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const destination=accountDestination((await searchParams).next);
  return <AccountShell title="Welcome back"><p>Sign in with your verified email address.</p>{destination.startsWith("/listings/")&&<p role="status">Sign in to return to this listing, then select Save property to confirm your bookmark.</p>}<AuthForm mode="sign-in" enabled={authReady()} destination={destination}/></AccountShell>;
}