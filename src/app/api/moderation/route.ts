import { submissionRequest } from "@/modules/submissions/http";
export const runtime="nodejs";
export async function GET(request:Request){return submissionRequest(request,{review:true});}