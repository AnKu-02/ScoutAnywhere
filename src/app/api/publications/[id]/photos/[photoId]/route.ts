import { publicationRequest } from "@/modules/publications/http";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string;photoId:string}>}){const {id,photoId}=await params;return publicationRequest(request,id,photoId);}