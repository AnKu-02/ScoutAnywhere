import { submissionRequest } from "@/modules/submissions/http";
export const runtime="nodejs";
export async function GET(request:Request){return submissionRequest(request);}
export async function POST(request:Request){return submissionRequest(request);}