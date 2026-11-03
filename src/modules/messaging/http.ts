import { z } from "zod";
import { authReady } from "../auth/auth";
import { currentSession } from "../auth/session";
import { boundedBody } from "../auth/request";
import { conversation,conversations,MessagingError,sendMessage,updateConversationState } from "./repository";
import { messageId,pageInput,sendInput,stateInput } from "./validation";

const privateHeaders={"Cache-Control":"private, no-store","Vary":"Cookie","X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reply=(data:object,status=200)=>Response.json(data,{status,headers:{...privateHeaders,...(status===429?{"Retry-After":"60"}:{})}});
export async function messagingRequest(request:Request,id?:string){
  try{
    if(!authReady())return reply({message:"Account services unavailable."},503);
    if(!['GET','POST','PATCH'].includes(request.method))return reply({message:"Method not allowed."},405);
    if(request.method!=='GET'&&request.headers.get('origin')!==new URL(process.env.BETTER_AUTH_URL!).origin)return reply({message:"Request origin rejected."},403);
    const session=await currentSession(request.headers);if(!session)return reply({message:"Sign in with a verified email."},401);
    if(id&&!z.uuid().safeParse(id).success)return reply({message:"Conversation not found."},404);
    const url=new URL(request.url),allowed=request.method==='GET'?(id?['before']:['page','filter']):[];
    if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1))return reply({message:"Invalid query."},400);
    if(request.method==='GET'){
      if(id){const before=url.searchParams.get('before')??undefined;if(before&&!messageId.safeParse(before).success)return reply({message:"Invalid message cursor."},400);return reply(await conversation(session.user.id,id,before));}
      const page=pageInput.safeParse(url.searchParams.get('page')??1),filter=url.searchParams.get('filter')??'all';
      if(!page.success||!['all','unread'].includes(filter))return reply({message:"Invalid inbox filter or page."},400);
      return reply(await conversations(session.user.id,page.data,filter==='unread'));
    }
    if((request.method==='PATCH')!==Boolean(id))return reply({message:"Invalid messaging action."},400);
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({message:"Use application/json."},415);
    let input:unknown;
    try{const body=await boundedBody(request,24576);if(body===null)return reply({message:"Request too large."},413);input=JSON.parse(body);}catch{return reply({message:"Provide valid JSON."},400);}
    if(id){const value=stateInput.safeParse(input);if(!value.success)return reply({message:"Invalid conversation state."},400);return reply(await updateConversationState(session.user.id,id,value.data));}
    const value=sendInput.safeParse(input);if(!value.success)return reply({message:"Write a message of 1–4,000 characters and provide a valid send request."},400);
    return reply(await sendMessage(session.user.id,value.data));
  }catch(error){if(error instanceof MessagingError)return reply({message:error.message},error.status);return reply({message:"Messages unavailable. Retry with the same send request to avoid duplicates."},503);}
}