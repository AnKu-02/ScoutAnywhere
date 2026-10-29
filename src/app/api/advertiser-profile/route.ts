import { authReady } from "@/modules/auth/auth";
import { currentSession } from "@/modules/auth/session";
import { boundedBody } from "@/modules/auth/request";
import { advertiserProfile,saveAdvertiserProfile } from "@/modules/advertisers/repository";
import { advertiserProfileSchema } from "@/modules/advertisers/validation";

export const runtime="nodejs";
function reply(body:object,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie",...(status===429?{"Retry-After":"60"}:{})}});
}
export async function GET(request:Request){
  if(new URL(request.url).search)return reply({message:"Query parameters are not supported"},400);
  try{
    const session=await currentSession(request.headers);
    if(!session)return reply({message:"Sign in with a verified email to continue"},401);
    return reply({profile:await advertiserProfile(session.user.id)});
  }catch{return reply({message:"Advertiser profile is temporarily unavailable"},503);}
}
export async function PUT(request:Request){
  if(!authReady())return reply({message:"Account services are not configured"},503);
  if(request.headers.get("origin")!==new URL(process.env.BETTER_AUTH_URL!).origin)return reply({message:"Request origin rejected"},403);
  if(new URL(request.url).search)return reply({message:"Query parameters are not supported"},400);
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply({message:"Use application/json"},415);
  try{
    const session=await currentSession(request.headers);
    if(!session)return reply({message:"Sign in with a verified email to continue"},401);
    let data;
    try{
      const text=await boundedBody(request,4096);
      if(text===null)return reply({message:"Request too large"},413);
      data=advertiserProfileSchema.parse(JSON.parse(text));
    }catch{return reply({message:"Check your advertiser name, type, city and description. Other fields are not accepted."},400);}
    const result=await saveAdvertiserProfile(session.user.id,data);
    if(result==="suspended")return reply({message:"This advertiser profile is suspended and cannot be edited. Your housing search and saved properties remain available."},403);
    if(result==="limited")return reply({message:"Too many changes. Wait a minute before trying again."},429);
    if(result==="not-found")return reply({message:"Sign in again to continue"},401);
    return reply({message:"Advertiser profile saved."});
  }catch{return reply({message:"Advertiser profile could not be saved. Please try again later."},503);}
}