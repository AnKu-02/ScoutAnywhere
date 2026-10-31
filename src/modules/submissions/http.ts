import { z } from "zod";
import { authReady } from "../auth/auth";
import { currentSession } from "../auth/session";
import { boundedBody } from "../auth/request";
import { listMedia } from "../draft-media/repository";
import { readDraft } from "../listing-drafts/repository";
import { actionSchema, submissionReadiness, submitSchema } from "./validation";
import { decideSubmission, ownSubmissions, readSubmission, reviewQueue, submissionBudget, SubmissionError, submitDraft, submittedPhoto } from "./repository";

const headers={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Referrer-Policy":"no-referrer"};
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{...headers,...(status===429?{"Retry-After":"60"}:{})}});
export async function submissionRequest(request:Request,options:{id?:string;photoId?:string;review?:boolean;draftId?:string}={}){
  try{
    if(!authReady())return reply({message:"Account services are not configured."},503);
    const writing=request.method!=="GET",url=new URL(request.url);
    if(writing&&request.headers.get("origin")!==new URL(process.env.BETTER_AUTH_URL!).origin)return reply({message:"Request origin rejected."},403);
    const session=await currentSession(request.headers);if(!session)return reply({message:"Sign in with a verified email to continue."},401);
    for(const id of [options.id,options.photoId,options.draftId])if(id!==undefined&&!z.uuid().safeParse(id).success)return reply({message:"Submission not found."},404);
    if(url.search&&(!options.review||options.id||[...url.searchParams.keys()].some(key=>key!=="page")||url.searchParams.getAll("page").length!==1))return reply({message:"Invalid query parameters."},400);
    const userId=session.user.id;
    if(!writing){
      if(options.draftId){
        const draft=await readDraft(userId,options.draftId);if(!draft)return reply({message:"Draft not found."},404);
        const media=await listMedia(userId,draft.id);
        return reply({version:draft.version,mediaVersion:media.version,issues:submissionReadiness(draft.content,media.images.length),latest:(await ownSubmissions(userId)).find(item=>item.draftId===draft.id)??null});
      }
      if(options.photoId){
        const bytes=await submittedPhoto(userId,options.id!,options.photoId,options.review);
        return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":"image/webp","Content-Length":String(bytes.length),"Content-Disposition":"inline; filename=submitted-photo.webp","Content-Security-Policy":"default-src 'none'; sandbox"}});
      }
      if(options.id)return reply(await readSubmission(userId,options.id,options.review));
      return reply({submissions:options.review?await reviewQueue(userId,Number(url.searchParams.get("page")??1)):await ownSubmissions(userId)});
    }
    await submissionBudget(userId);
    if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({message:"Use application/json."},415);
    let value:unknown;try{const body=await boundedBody(request,4096);if(body===null)return reply({message:"Request too large."},413);value=JSON.parse(body);}catch{return reply({message:"Provide valid UTF-8 JSON."},400);}
    if(options.id){
      const parsed=actionSchema.safeParse(value);if(!parsed.success)return reply({message:"Provide a valid decision, current version and reason (5–2,000 characters)."},400);
      if(Boolean(options.review)===(parsed.data.decision==="withdrawn"))return reply({message:"Action not permitted on this endpoint."},403);
      return reply({submission:await decideSubmission(userId,options.id,parsed.data)});
    }
    const parsed=submitSchema.safeParse(value);if(!parsed.success)return reply({message:"Provide the draft and both current versions with a UUID request key."},400);
    return reply({submission:await submitDraft(userId,parsed.data)},201);
  }catch(error){
    if(error instanceof SubmissionError)return reply({message:error.message},error.status);
    return reply({message:"Review services are temporarily unavailable. Reload before retrying."},503);
  }
}