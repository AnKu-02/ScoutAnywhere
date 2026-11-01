import { z } from "zod";
import { publicPhoto, PublicationError } from "@/modules/publications/repository";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"};
export async function GET(_request:Request,{params}:{params:Promise<{publicationId:string;photoId:string}>}){
  try{const {publicationId,photoId}=await params;if(!z.uuid().safeParse(publicationId).success||!z.uuid().safeParse(photoId).success)return new Response("Not found",{status:404,headers});const bytes=await publicPhoto(publicationId,photoId);return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":"image/webp","Content-Length":String(bytes.length)}});}
  catch(error){return new Response(error instanceof PublicationError?"Not found":"Image unavailable",{status:error instanceof PublicationError?404:503,headers});}
}