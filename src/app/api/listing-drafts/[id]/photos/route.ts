import { mediaRequest } from "@/modules/draft-media/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){return mediaRequest(request,(await params).id);}
export async function POST(request:Request,{params}:Context){return mediaRequest(request,(await params).id);}
export async function PUT(request:Request,{params}:Context){return mediaRequest(request,(await params).id);}