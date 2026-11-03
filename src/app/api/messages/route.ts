import { messagingRequest } from "@/modules/messaging/http";
export const runtime="nodejs";
export const GET=(request:Request)=>messagingRequest(request);
export const POST=(request:Request)=>messagingRequest(request);