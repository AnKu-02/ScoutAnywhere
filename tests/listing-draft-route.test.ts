import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ready:vi.fn(),session:vi.fn(),list:vi.fn(),read:vi.fn(),create:vi.fn(),update:vi.fn(),remove:vi.fn()}));
vi.mock("../src/modules/auth/auth",()=>({authReady:mocks.ready}));
vi.mock("../src/modules/auth/session",()=>({currentSession:mocks.session}));
vi.mock("../src/modules/listing-drafts/repository",async original=>({...await original<typeof import("../src/modules/listing-drafts/repository")>(),listDrafts:mocks.list,readDraft:mocks.read,createDraft:mocks.create,updateDraft:mocks.update,deleteDraft:mocks.remove}));
import { draftRequest } from "../src/modules/listing-drafts/http";
import { DraftError } from "../src/modules/listing-drafts/repository";
import { emptyDraft } from "../src/modules/listing-drafts/validation";
const origin="http://localhost:3000",id="c50a2b4b-c5f3-44cf-b7db-ed17f8a1215d";
const draft={id,version:1,content:emptyDraft("rent"),createdAt:"2026-10-30",updatedAt:"2026-10-30"};
function request(method="POST",body:unknown={requestId:id,content:draft.content},headers:Record<string,string>={origin,"content-type":"application/json"},query=""){
  return new Request(origin+"/api/listing-drafts"+query,{method,headers,...(method!=="GET"?{body:JSON.stringify(body)}:{})});
}
beforeEach(()=>{vi.stubEnv("BETTER_AUTH_URL",origin);mocks.ready.mockReturnValue(true);mocks.session.mockResolvedValue({user:{id:"verified-owner"}});mocks.list.mockResolvedValue([draft]);mocks.read.mockResolvedValue(draft);mocks.create.mockResolvedValue(draft);mocks.update.mockResolvedValue(draft);});
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
describe("private draft HTTP boundary",()=>{
  it("derives all authority from the session and sets private headers",async()=>{
    const response=await draftRequest(request());expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("verified-owner",{requestId:id,content:draft.content});
    expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");expect(response.headers.get("x-robots-tag")).toContain("noindex");
    await draftRequest(request("GET"),id);expect(mocks.read).toHaveBeenCalledWith("verified-owner",id);
    await draftRequest(request("PUT",{version:1,content:draft.content}),id);expect(mocks.update).toHaveBeenCalledWith("verified-owner",id,{version:1,content:draft.content});
    await draftRequest(request("DELETE",{version:1}),id);expect(mocks.remove).toHaveBeenCalledWith("verified-owner",id,{version:1});
  });
  it("rejects unauthenticated reads and all writes",async()=>{
    mocks.session.mockResolvedValue(null);
    for(const method of ["GET","POST","PUT","DELETE"])expect((await draftRequest(request(method),method==="POST"?undefined:id)).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects foreign/missing origins and query authority",async()=>{
    const origins:Record<string,string>[]=[{"content-type":"application/json"},{origin:"https://evil.example","content-type":"application/json"}];
    for(const headers of origins)expect((await draftRequest(request("POST",{},headers))).status).toBe(403);
    expect((await draftRequest(request("GET",undefined,{},"?userId=victim"))).status).toBe(400);
  });
  it("bounds JSON, rejects unknown fields, non-JSON and invalid ids",async()=>{
    expect((await draftRequest(request("POST",{requestId:id,content:draft.content,userId:"victim"}))).status).toBe(400);
    expect((await draftRequest(request("POST",{}, {origin,"content-type":"text/plain"}))).status).toBe(415);
    expect((await draftRequest(request("POST",{large:"x".repeat(25000)}))).status).toBe(413);
    expect((await draftRequest(request("GET"),"1")).status).toBe(404);
    const invalid=new Request(origin+"/api/listing-drafts",{method:"POST",headers:{origin,"content-type":"application/json"},body:new Uint8Array([255])});
    expect((await draftRequest(invalid)).status).toBe(400);expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([["ineligible",403],["not-found",404],["conflict",409],["limited",429],["full",409]] as const)("handles %s safely",async(code,status)=>{
    mocks.create.mockRejectedValue(new DraftError(code));const response=await draftRequest(request());expect(response.status).toBe(status);
    if(status===429)expect(response.headers.get("retry-after")).toBe("60");
  });
  it("fails closed on configuration, session and database errors",async()=>{
    mocks.ready.mockReturnValue(false);expect((await draftRequest(request())).status).toBe(503);
    mocks.ready.mockReturnValue(true);mocks.session.mockRejectedValue(new Error("private connection details"));
    const response=await draftRequest(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private connection details");
  });
});