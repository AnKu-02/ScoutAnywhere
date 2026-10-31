import { submissionRequest } from "@/modules/submissions/http";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return submissionRequest(request,{draftId:(await params).id});}