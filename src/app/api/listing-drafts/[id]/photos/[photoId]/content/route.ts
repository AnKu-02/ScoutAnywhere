import { mediaRequest } from "@/modules/draft-media/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string;photoId:string}>};
export async function GET(request:Request,{params}:Context){const {id,photoId}=await params;return mediaRequest(request,id,photoId,true);}