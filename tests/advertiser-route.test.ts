import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({ready:vi.fn(),session:vi.fn(),read:vi.fn(),save:vi.fn()}));
vi.mock("../src/modules/auth/auth",()=>({authReady:mocks.ready}));
vi.mock("../src/modules/auth/session",()=>({currentSession:mocks.session}));
vi.mock("../src/modules/advertisers/repository",()=>({advertiserProfile:mocks.read,saveAdvertiserProfile:mocks.save}));
import {GET,PUT} from "../src/app/api/advertiser-profile/route";

const origin="http://localhost:3000";
const input={displayName:"Private advertiser",type:"owner",primaryCity:"Bengaluru",description:""};
function request(body:unknown=input,headers:Record<string,string>={origin,"content-type":"application/json"}){
  return new Request(origin+"/api/advertiser-profile",{method:"PUT",headers,body:JSON.stringify(body)});
}
beforeEach(()=>{vi.stubEnv("BETTER_AUTH_URL",origin);mocks.ready.mockReturnValue(true);mocks.session.mockResolvedValue({user:{id:"session-owner"}});mocks.read.mockResolvedValue(null);mocks.save.mockResolvedValue("saved");});
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
describe("advertiser HTTP authorization boundary",()=>{
  it("derives reads and writes exclusively from the verified session",async()=>{
    expect((await GET(new Request(origin+"/api/advertiser-profile"))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith("session-owner");
    expect((await PUT(request())).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("session-owner",input);
  });
  it("rejects absent/unverified/revoked sessions supplied as null by the session boundary",async()=>{
    mocks.session.mockResolvedValue(null);
    expect((await GET(new Request(origin+"/api/advertiser-profile"))).status).toBe(401);
    expect((await PUT(request())).status).toBe(401);expect(mocks.save).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();
  });
  it("fails closed when configuration or session storage fails",async()=>{
    mocks.ready.mockReturnValue(false);expect((await PUT(request())).status).toBe(503);
    mocks.ready.mockReturnValue(true);mocks.session.mockRejectedValue(new Error("private failure"));
    const response=await PUT(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private failure");
  });
  it.each<Record<string,string>>([{}, {origin:"https://evil.example","content-type":"application/json"}])("rejects missing or foreign origins",async headers=>{
    expect((await PUT(request(input,headers))).status).toBe(403);expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects query authority, mass assignment and non-JSON input",async()=>{
    expect((await GET(new Request(origin+"/api/advertiser-profile?userId=victim"))).status).toBe(400);
    expect((await PUT(request({...input,userId:"victim"}))).status).toBe(400);
    expect((await PUT(request(input,{origin,"content-type":"text/plain"}))).status).toBe(415);expect(mocks.save).not.toHaveBeenCalled();
  });
  it("bounds streamed bodies and rejects malformed UTF-8 safely",async()=>{
    expect((await PUT(request({...input,description:"x".repeat(5000)}))).status).toBe(413);
    const invalid=new Request(origin+"/api/advertiser-profile",{method:"PUT",headers:{origin,"content-type":"application/json"},body:new Uint8Array([255])});
    expect((await PUT(invalid)).status).toBe(400);expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([["suspended",403],["limited",429],["not-found",401]] as const)("handles repository result %s without privilege fallback",async(result,status)=>{
    mocks.save.mockResolvedValue(result);const response=await PUT(request());expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");
    if(status===429)expect(response.headers.get("retry-after")).toBe("60");
  });
});