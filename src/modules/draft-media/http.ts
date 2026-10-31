import { z } from "zod";
import { authReady } from "../auth/auth";
import { currentSession } from "../auth/session";
import { boundedBody } from "../auth/request";
import { mediaLimits } from "./config";
import { MediaError,mediaOrderSchema,mediaDeleteSchema } from "./validation";
import { arrangeMedia,authorizeMedia,cleanupMedia,listMedia,mediaBudget,removePhoto,retrievePhoto,uploadPhoto } from "./repository";

const headers={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Referrer-Policy":"no-referrer"};
function reply(body:object,status=200){return Response.json(body,{status,headers:{...headers,...(status===429?{"Retry-After":"60"}:{})}});}
let receiving=0;
export async function boundedImageBody(request:Request):Promise<Buffer>{
  const limit=mediaLimits().original;
  if(Number(request.headers.get("content-length"))>limit)throw new MediaError(413,"Photographs must be no larger than 10 MB.");
  const reader=request.body?.getReader();if(!reader)throw new MediaError(400,"Choose a photograph.");
  const chunks:Buffer[]=[];let length=0;
  let expired=false;
  const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},20000);
  try{
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;
      if(length>limit){await reader.cancel();throw new MediaError(413,"Photographs must be no larger than 10 MB.");}chunks.push(Buffer.from(value));}
    if(expired)throw new MediaError(408,"Upload interrupted or too slow. Please retry.");
    if(!length)throw new MediaError(400,"Choose a photograph.");
    return Buffer.concat(chunks);
  }finally{clearTimeout(timer);reader.releaseLock();}
}
export async function mediaRequest(request:Request,draftId:string,id?:string,content=false):Promise<Response>{
  try{
    if(!authReady())return reply({message:"Account services are not configured."},503);
    if(request.method!=="GET"&&request.headers.get("origin")!==new URL(process.env.BETTER_AUTH_URL!).origin)return reply({message:"Request origin rejected."},403);
    if(new URL(request.url).search)return reply({message:"Query parameters are not accepted."},400);
    const session=await currentSession(request.headers);
    if(!session)return reply({message:"Sign in with a verified email to continue."},401);
    if(!z.uuid().safeParse(draftId).success||(id!==undefined&&!z.uuid().safeParse(id).success))return reply({message:"Photograph not found."},404);
    await authorizeMedia(session.user.id,draftId);
    if(content){
      const bytes=await retrievePhoto(session.user.id,draftId,id!);
      return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":"image/webp","Content-Length":String(bytes.length),"Content-Disposition":"inline; filename=property-photo.webp","Content-Security-Policy":"default-src 'none'; sandbox"}});
    }
    if(request.method==="GET")return reply(await listMedia(session.user.id,draftId));
    await mediaBudget(session.user.id,draftId);
    if(request.method==="POST"){
      const key=request.headers.get("idempotency-key");
      if(!z.uuid().safeParse(key).success)return reply({message:"Provide a UUID upload request key."},400);
      if(!["application/octet-stream","image/jpeg","image/png","image/webp"].includes(request.headers.get("content-type")?.split(";")[0]||""))return reply({message:"Send JPEG, PNG or WebP bytes, not a multipart form. HEIC must be exported as JPEG."},415);
      if(receiving>=2)return reply({message:"Photo uploads are busy. Retry shortly."},429);
      receiving++;
      try{
        const result=await uploadPhoto(session.user.id,draftId,key!,await boundedImageBody(request));
        return reply(result,201);
      }finally{receiving--;}
    }
    let value:unknown;
    try{const body=await boundedBody(request,4096);if(body===null)return reply({message:"Request too large."},413);value=JSON.parse(body);}catch{return reply({message:"Provide valid JSON."},400);}
    if(request.headers.get("content-type")?.split(";")[0]!=="application/json")return reply({message:"Use application/json."},415);
    const parsed=(request.method==="DELETE"?mediaDeleteSchema:mediaOrderSchema).safeParse(value);
    if(!parsed.success)return reply({message:"Invalid photograph management request."},400);
    const result=request.method==="DELETE"?await removePhoto(session.user.id,draftId,id!,(parsed.data as {version:number}).version):await arrangeMedia(session.user.id,draftId,parsed.data);
    // Bounded foreground cleanup handles ordinary deletion; scheduled CLI also reclaims crashes.
    if(request.method==="DELETE")await cleanupMedia(undefined,5);
    return reply(result);
  }catch(error){
    if(error instanceof MediaError)return reply({message:error.message},error.status);
    return reply({message:"Photographs are temporarily unavailable. Retry shortly; do not reselect a successfully uploaded image."},503);
  }
}