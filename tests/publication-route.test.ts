import { beforeEach,describe,it,expect,vi } from "vitest";
vi.mock("../src/modules/auth/auth",()=>({authReady:vi.fn(()=>true)}));
vi.mock("../src/modules/auth/session",()=>({currentSession:vi.fn()}));
vi.mock("../src/modules/publications/repository",()=>({publicationBudget:vi.fn(),publicationPreview:vi.fn(),publicationQueue:vi.fn(),publishSubmission:vi.fn(),unpublishSubmission:vi.fn(),publisherPhoto:vi.fn(),PublicationError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
import {currentSession} from "../src/modules/auth/session";
import {publicationRequest} from "../src/modules/publications/http";
import * as repository from "../src/modules/publications/repository";
const id="12345678-1234-4234-8234-123456789abc",origin="http://localhost:3000";
const request=(body:unknown,headers:Record<string,string>={})=>new Request(`${origin}/api/publications/${id}`,{method:"POST",headers:{origin,"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();process.env.BETTER_AUTH_URL=origin;vi.mocked(currentSession).mockResolvedValue({user:{id:"session-operator",emailVerified:true}} as never);});
describe("publication HTTP boundaries",()=>{
  it("requires verified sessions and canonical origin",async()=>{vi.mocked(currentSession).mockResolvedValue(null);expect((await publicationRequest(new Request(origin),id)).status).toBe(401);expect((await publicationRequest(request({},{origin:"https://attacker.test"}),id)).status).toBe(403);});
  it("derives actor from session and returns private responses",async()=>{vi.mocked(repository.publishSubmission).mockResolvedValue({id,submissionId:id,listingId:25,state:"published"});const result=await publicationRequest(request({action:"publish",reason:"Checked exact approved preview"}),id);expect(result.status).toBe(200);expect(result.headers.get("Cache-Control")).toContain("no-store");expect(repository.publishSubmission).toHaveBeenCalledWith("session-operator",id,{action:"publish",reason:"Checked exact approved preview"});});
  it("rejects actor and snapshot injection",async()=>{expect((await publicationRequest(request({action:"publish",reason:"Checked preview",actorId:"fake"}),id)).status).toBe(400);expect(repository.publishSubmission).not.toHaveBeenCalled();});
  it("rejects oversized and wrong content types",async()=>{expect((await publicationRequest(request({reason:"a".repeat(5000)}),id)).status).toBe(413);expect((await publicationRequest(request({},{"Content-Type":"text/plain"}),id)).status).toBe(415);});
  it("does not expose storage or database failure details",async()=>{vi.mocked(repository.publicationPreview).mockRejectedValueOnce(new Error("secret storage key"));const response=await publicationRequest(new Request(origin),id);expect(response.status).toBe(503);expect(await response.text()).not.toContain("secret");});
  it("enforces repository revocation errors on reads and mutations",async()=>{vi.mocked(repository.publishSubmission).mockRejectedValueOnce(new repository.PublicationError(403,"Publishing operator access required."));expect((await publicationRequest(request({action:"publish",reason:"Checked preview"}),id)).status).toBe(403);});
  it("rejects malformed identifiers and unexpected query fields",async()=>{expect((await publicationRequest(new Request(origin),"not-uuid")).status).toBe(404);expect((await publicationRequest(new Request(`${origin}?userId=other`))).status).toBe(400);});
});