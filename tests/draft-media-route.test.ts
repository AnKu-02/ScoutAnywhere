import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({ready:vi.fn(),session:vi.fn(),authorize:vi.fn(),budget:vi.fn(),list:vi.fn(),upload:vi.fn(),retrieve:vi.fn(),arrange:vi.fn(),remove:vi.fn(),cleanup:vi.fn()}));
vi.mock("../src/modules/auth/auth",()=>({authReady:mocks.ready}));
vi.mock("../src/modules/auth/session",()=>({currentSession:mocks.session}));
vi.mock("../src/modules/draft-media/repository",()=>({authorizeMedia:mocks.authorize,mediaBudget:mocks.budget,listMedia:mocks.list,uploadPhoto:mocks.upload,retrievePhoto:mocks.retrieve,arrangeMedia:mocks.arrange,removePhoto:mocks.remove,cleanupMedia:mocks.cleanup}));
import {mediaRequest} from "../src/modules/draft-media/http";
import {MediaError} from "../src/modules/draft-media/validation";
const origin="http://localhost:3000",draftId=crypto.randomUUID(),photoId=crypto.randomUUID();
const media={version:2,images:[]};
function request(method="GET",body?:BodyInit,extra:Record<string,string>={}){return new Request(origin+`/api/listing-drafts/${draftId}/photos`,{method,headers:{origin,"content-type":"application/octet-stream","idempotency-key":photoId,...extra},body});}
beforeEach(()=>{vi.stubEnv("BETTER_AUTH_URL",origin);mocks.ready.mockReturnValue(true);mocks.session.mockResolvedValue({user:{id:"session-owner"}});mocks.list.mockResolvedValue(media);mocks.upload.mockResolvedValue(media);mocks.arrange.mockResolvedValue(media);mocks.remove.mockResolvedValue(media);mocks.retrieve.mockResolvedValue(Buffer.from("private photo"));});
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
describe("private photograph HTTP authorization",()=>{
  it("derives owner from the verified session on reads/uploads and hides object keys",async()=>{
    expect((await mediaRequest(request(),draftId)).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("session-owner",draftId);
    expect((await mediaRequest(request("POST",new Uint8Array([1,2])),draftId)).status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith("session-owner",draftId,photoId,Buffer.from([1,2]));
  });
  it("protects bytes with private/no-store and same-origin response headers",async()=>{
    const response=await mediaRequest(request(),draftId,photoId,true);expect(response.status).toBe(200);
    for(const [key,value] of [["cache-control","no-store"],["vary","Cookie"],["x-robots-tag","noindex"],["cross-origin-resource-policy","same-origin"],["content-type","image/webp"],["content-security-policy","sandbox"]])expect(response.headers.get(key)).toContain(value);
    expect(mocks.retrieve).toHaveBeenCalledWith("session-owner",draftId,photoId);
  });
  it("rejects revoked/unverified/absent sessions on every operation",async()=>{
    mocks.session.mockResolvedValue(null);
    for(const method of ["GET","POST","PUT","DELETE"])expect((await mediaRequest(request(method),draftId)).status).toBe(401);
    expect((await mediaRequest(request(),draftId,photoId,true)).status).toBe(401);
    expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects cross-account access before consuming or processing a body",async()=>{
    mocks.authorize.mockRejectedValue(new MediaError(404,"Photograph not found."));
    expect((await mediaRequest(request("POST",new Uint8Array([1])),draftId)).status).toBe(404);
    expect((await mediaRequest(request(),draftId,photoId,true)).status).toBe(404);
    expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("rejects hostile origins, unknown ids, upload keys, MIME and query authority",async()=>{
    expect((await mediaRequest(request("POST",undefined,{origin:"https://evil.example"}),draftId)).status).toBe(403);
    expect((await mediaRequest(request("POST",undefined,{origin:""}),draftId)).status).toBe(403);
    expect((await mediaRequest(request(),"../victim")).status).toBe(404);
    expect((await mediaRequest(request("POST",new Uint8Array([1]),{"idempotency-key":"invalid"}),draftId)).status).toBe(400);
    expect((await mediaRequest(request("POST",new Uint8Array([1]),{"content-type":"image/svg+xml"}),draftId)).status).toBe(415);
    expect((await mediaRequest(new Request(origin+"/photos?userId=victim"),draftId)).status).toBe(400);
  });
  it("bounds original payloads and rejects management mass assignment",async()=>{
    expect((await mediaRequest(request("POST",new Uint8Array(10485761)),draftId)).status).toBe(413);
    expect((await mediaRequest(request("PUT",JSON.stringify({version:1,ids:[],coverId:null,ownerId:"victim"}),{"content-type":"application/json"}),draftId)).status).toBe(400);
    expect((await mediaRequest(request("DELETE",JSON.stringify({version:1,storageKey:"victim"}),{"content-type":"application/json"}),draftId,photoId)).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.arrange).not.toHaveBeenCalled();
  });
  it("keeps safe failures and throttle responses private",async()=>{
    mocks.budget.mockRejectedValue(new MediaError(429,"Wait a minute."));
    const limited=await mediaRequest(request("POST",new Uint8Array([1])),draftId);expect(limited.status).toBe(429);expect(limited.headers.get("retry-after")).toBe("60");
    mocks.budget.mockReset();mocks.session.mockRejectedValue(new Error("private credentials"));
    const failed=await mediaRequest(request(),draftId);expect(failed.status).toBe(503);expect(await failed.text()).not.toContain("credentials");
  });
});