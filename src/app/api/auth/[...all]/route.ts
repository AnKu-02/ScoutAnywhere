import { auth, authReady } from "@/modules/auth/auth";
import { registrationSchema } from "@/modules/accounts/validation";
import { boundedBody } from "@/modules/auth/request";

export const runtime = "nodejs";
const allowed = new Set(["sign-up/email","sign-in/email","sign-out","get-session","verify-email","send-verification-email","request-password-reset","reset-password","change-password"]);

async function handler(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
  const resetRedirect = request.method === "GET" && /^reset-password\/[A-Za-z0-9_-]+$/.test(path);
  if (!allowed.has(path) && !resetRedirect) return Response.json({ message: "Not available" }, { status: 404 });
  if (!authReady()) return path === "get-session" ? Response.json(null, { headers: { "Cache-Control": "no-store" } }) : Response.json({ message: "Account services are not configured. Please try later." }, { status: 503 });
  try {
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin !== new URL(process.env.BETTER_AUTH_URL!).origin) return Response.json({ message: "Request origin rejected" }, { status: 403 });
    const body = await boundedBody(request, 16384);
    if (body === null) return Response.json({ message: "Request too large" }, { status: 413 });
    if (path === "sign-up/email") {
      try { registrationSchema.parse(JSON.parse(body)); }
      catch { return Response.json({ message: "Use a display name, valid email and a password of 12–128 characters. Extra fields are not accepted." }, { status: 400 }); }
    }
    request = new Request(request.url, { method: request.method, headers: request.headers, body });
  }
    const response = await auth().handler(request);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return Response.json({ message: "Account request could not be completed. Please try later." }, { status: 503 });
  }
}
export const GET = handler;
export const POST = handler;