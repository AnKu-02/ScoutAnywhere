import { authReady } from "../auth/auth";
import { currentSession } from "../auth/session";
import { boundedBody } from "../auth/request";
import { createDraft, deleteDraft, DraftError, listDrafts, readDraft, updateDraft } from "./repository";
import { createDraftSchema, deleteDraftSchema, draftIdSchema, draftReadiness, DRAFT_BODY_LIMIT, updateDraftSchema } from "./validation";

function reply(body:object,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie","X-Robots-Tag":"noindex, nofollow",...(status===429?{"Retry-After":"60"}:{})}});
}
function failure(error:unknown){
  if(error instanceof DraftError){
    const results={
      ineligible:[403,"An active advertiser profile is required. Your housing search and saved properties remain available."],
      "not-found":[404,"Draft not found."],
      conflict:[409,"This draft changed, was deleted, or this creation request was already used. Your unsaved input has not been replaced. Reload to review the saved version."],
      limited:[429,"Too many draft changes. Wait a minute and try again."],
      full:[409,"Draft storage limit reached (100 drafts or 1,000 creation requests per account)."],
    } as const;
    const [status,message]=results[error.code];return reply({message},status);
  }
  return reply({message:"Drafts are temporarily unavailable. Please try again later."},503);
}
export async function draftRequest(request:Request,id?:string):Promise<Response>{
  try{
    if(!authReady())return reply({message:"Account services are not configured."},503);
    const writing=request.method!=="GET";
    if(writing&&request.headers.get("origin")!==new URL(process.env.BETTER_AUTH_URL!).origin)return reply({message:"Request origin rejected."},403);
    if(new URL(request.url).search)return reply({message:"Query parameters are not supported."},400);
    const session=await currentSession(request.headers);
    if(!session)return reply({message:"Sign in with a verified email to continue."},401);
    if(id!==undefined&&!draftIdSchema.safeParse(id).success)return reply({message:"Draft not found."},404);
    if(!writing){
      if(id===undefined)return reply({drafts:await listDrafts(session.user.id)});
      const draft=await readDraft(session.user.id,id);
      return draft?reply({draft,readiness:draftReadiness(draft.content)}):reply({message:"Draft not found."},404);
    }
    if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({message:"Use application/json."},415);
    let value:unknown;
    try{
      const body=await boundedBody(request,DRAFT_BODY_LIMIT);
      if(body===null)return reply({message:"Request too large."},413);
      value=JSON.parse(body);
    }catch{return reply({message:"Provide valid UTF-8 JSON."},400);}
    const schema=request.method==="POST"?createDraftSchema:request.method==="DELETE"?deleteDraftSchema:updateDraftSchema;
    const parsed=schema.safeParse(value);
    if(!parsed.success)return reply({message:"Check the highlighted draft fields. Unknown fields are not accepted.",issues:parsed.error.issues.map(issue=>({field:issue.path.join("."),message:issue.message}))},400);
    if(request.method==="DELETE"){
      await deleteDraft(session.user.id,id!,parsed.data);return reply({message:"Draft deleted."});
    }
    const draft=request.method==="POST"?await createDraft(session.user.id,parsed.data):await updateDraft(session.user.id,id!,parsed.data);
    return reply({draft,readiness:draftReadiness(draft.content)},request.method==="POST"?201:200);
  }catch(error){return failure(error);}
}