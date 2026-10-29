import { currentSession } from "@/modules/auth/session";
import { authReady } from "@/modules/auth/auth";
import { boundedBody } from "@/modules/auth/request";
import { savedListingIds, setSavedListing } from "@/modules/saved-listings/repository";
import { savedWriteSchema } from "@/modules/saved-listings/validation";

export const runtime = "nodejs";
function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control":"private, no-store", "Vary":"Cookie", ...(status === 429 ? {"Retry-After":"60"} : {}) } });
}
export async function GET(request: Request) {
  if (new URL(request.url).search) return reply({message:"Query parameters are not supported"},400);
  try {
    const session = await currentSession(request.headers);
    if (!session) return reply({authenticated:false, ids:[]});
    return reply({authenticated:true, ids:await savedListingIds(session.user.id)});
  } catch { return reply({message:"Saved properties are temporarily unavailable"},503); }
}
async function write(request: Request) {
  if (!authReady()) return reply({message:"Account services are not configured"},503);
  if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL!).origin) return reply({message:"Request origin rejected"},403);
  if (new URL(request.url).search) return reply({message:"Query parameters are not supported"},400);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply({message:"Use application/json"},415);
  try {
    const session = await currentSession(request.headers);
    if (!session) return reply({message:"Sign in with a verified email to save properties"},401);
    const text = await boundedBody(request,1024);
    if (text === null) return reply({message:"Request too large"},413);
    let input;
    try { input = savedWriteSchema.parse(JSON.parse(text)); }
    catch { return reply({message:"Provide a valid listing ID only"},400); }
    const result = await setSavedListing(session.user.id,input.listingId,request.method === "PUT");
    if (result === "not-found") return reply({message:"This listing is not available to save"},404);
    if (result === "limited") return reply({message:"Too many changes. Wait a minute and try again."},429);
    if (result === "full") return reply({message:"Your collection is full (500 listings). Remove a saved listing first."},409);
    return reply({saved:result === "saved",listingId:input.listingId});
  } catch { return reply({message:"Could not update saved properties. Please retry."},503); }
}
export const PUT = write;
export const DELETE = write;