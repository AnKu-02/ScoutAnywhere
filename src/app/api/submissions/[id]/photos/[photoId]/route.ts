import { submissionRequest } from "@/modules/submissions/http";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string;photoId:string}>}){return submissionRequest(request,await params);}