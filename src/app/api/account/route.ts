import { currentSession } from "@/modules/auth/session";
import { updateProfile } from "@/modules/accounts/repository";
import { profileSchema } from "@/modules/accounts/validation";
import { boundedBody } from "@/modules/auth/request";
import { authReady } from "@/modules/auth/auth";

export async function PATCH(request: Request) {
  if (!authReady()) return Response.json({message:"Account services are not configured"},{status:503});
  if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL!).origin)
    return Response.json({ message: "Request origin rejected" }, { status: 403 });
  try {
    const session = await currentSession(request.headers);
    if (!session) return Response.json({ message: "Sign in to continue" }, { status: 401 });
    const text = await boundedBody(request, 4096);
    if (text === null) return Response.json({ message: "Request too large" }, { status: 413 });
    let data;
    try { data = profileSchema.parse(JSON.parse(text)); }
    catch { return Response.json({ message: "Check your display name and preferences. Only supplied avatars are supported." }, { status: 400 }); }
    await updateProfile(session.user.id, data); // Identity comes exclusively from the verified session.
    return Response.json({ message: "Profile updated" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Profile could not be updated. Please try later." }, { status: 503 }); }
}