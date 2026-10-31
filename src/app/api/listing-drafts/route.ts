import { draftRequest } from "@/modules/listing-drafts/http";
export const runtime="nodejs";
export async function GET(request:Request){return draftRequest(request);}
export async function POST(request:Request){return draftRequest(request);}