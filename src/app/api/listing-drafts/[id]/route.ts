import { draftRequest } from "@/modules/listing-drafts/http";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){return draftRequest(request,(await params).id);}
export async function PUT(request:Request,{params}:Context){return draftRequest(request,(await params).id);}
export async function DELETE(request:Request,{params}:Context){return draftRequest(request,(await params).id);}