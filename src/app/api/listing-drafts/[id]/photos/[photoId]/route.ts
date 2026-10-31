import { mediaRequest } from "@/modules/draft-media/http";
export const runtime="nodejs";
type Context={params:Promise<{id:string;photoId:string}>};
export async function DELETE(request:Request,{params}:Context){const {id,photoId}=await params;return mediaRequest(request,id,photoId);}