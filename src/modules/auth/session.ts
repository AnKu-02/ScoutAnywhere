import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, authReady } from "./auth";

export async function currentSession(requestHeaders: Headers) {
  if (!authReady()) return null;
  const session = await auth().api.getSession({ headers: requestHeaders });
  return session?.user.emailVerified ? session : null;
}
export async function requireAccount() {
  const session = await currentSession(await headers());
  if (!session) redirect("/sign-in");
  return session;
}