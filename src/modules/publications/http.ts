import { z } from "zod";
import { authReady } from "../auth/auth";
import { currentSession } from "../auth/session";
import { boundedBody } from "../auth/request";
import { publicationAction } from "./validation";
import { publicationBudget, publicationPreview, publicationQueue, publishSubmission, unpublishSubmission, publisherPhoto, PublicationError } from "./repository";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{...headers,...(status===429?{"Retry-After":"60"}:{})}});
export async function publicationRequest(request:Request,id?:string,photoId?:string){
  try{
    if(!authReady())return reply({message:"Account services unavailable."},503);
    if(request.method!=="GET"&&request.headers.get("origin")!==new URL(process.env.BETTER_AUTH_URL!).origin)return reply({message:"Request origin rejected."},403);
    const session=await currentSession(request.headers);if(!session)return reply({message:"Sign in with a verified email."},401);
    if([id,photoId].some(value=>value!==undefined&&!z.uuid().safeParse(value).success))return reply({message:"Publication not found."},404);
    const url=new URL(request.url);if(url.search&&(id||[...url.searchParams.keys()].some(key=>key!=="page")||url.searchParams.getAll("page").length!==1))return reply({message:"Invalid query."},400);
    if(request.method==='GET'){
      if(photoId){const bytes=await publisherPhoto(session.user.id,id!,photoId);return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":"image/webp","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'none'; sandbox"}});}
      return reply(id?await publicationPreview(session.user.id,id):{submissions:await publicationQueue(session.user.id,Number(url.searchParams.get("page")??1))});
    }
    if(!id)return reply({message:"Select a submission."},400);
    await publicationBudget(session.user.id);
    if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({message:"Use application/json."},415);
    let value:unknown;try{const body=await boundedBody(request,4096);if(body===null)return reply({message:"Request too large."},413);value=JSON.parse(body);}catch{return reply({message:"Provide valid JSON."},400);}
    const parsed=publicationAction.safeParse(value);if(!parsed.success)return reply({message:"Provide a valid action and meaningful reason (5–2,000 characters)."},400);
    return reply({publication:parsed.data.action==='publish'?await publishSubmission(session.user.id,id,parsed.data):await unpublishSubmission(session.user.id,id,parsed.data)});
  }catch(error){if(error instanceof PublicationError)return reply({message:error.message},error.status);return reply({message:"Publication unavailable. No success is confirmed; reload the publication before retrying."},503);}
}