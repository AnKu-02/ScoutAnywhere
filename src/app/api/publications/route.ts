import { publicationRequest } from "@/modules/publications/http";
export const runtime="nodejs";
export async function GET(request:Request){return publicationRequest(request);}