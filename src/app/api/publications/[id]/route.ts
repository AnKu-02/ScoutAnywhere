import { publicationRequest } from "@/modules/publications/http";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){return publicationRequest(request,(await params).id);}
export async function POST(request:Request,{params}:Context){return publicationRequest(request,(await params).id);}