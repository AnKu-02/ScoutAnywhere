import { messagingRequest } from "@/modules/messaging/http";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){return messagingRequest(request,(await params).id);}
export async function PATCH(request:Request,{params}:Context){return messagingRequest(request,(await params).id);}