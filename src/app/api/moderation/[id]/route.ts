import { submissionRequest } from "@/modules/submissions/http";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){return submissionRequest(request,{...await params,review:true});}
export async function POST(request:Request,{params}:Context){return submissionRequest(request,{...await params,review:true});}