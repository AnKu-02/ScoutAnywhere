import { afterEach,describe,expect,it,vi } from "vitest";
import { authReady } from "../src/modules/auth/auth";
import { emailReady } from "../src/modules/auth/email";
import { boundedBody } from "../src/modules/auth/request";

afterEach(()=>vi.unstubAllEnvs());
function configure() {
  vi.stubEnv("DATABASE_URL","postgres://unused");
  vi.stubEnv("BETTER_AUTH_SECRET","test-configuration-secret-with-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL","http://localhost:3000");
  vi.stubEnv("SMTP_HOST","127.0.0.1");vi.stubEnv("SMTP_PORT","1025");
  vi.stubEnv("SMTP_SECURE","false");vi.stubEnv("SMTP_USER","");vi.stubEnv("SMTP_PASSWORD","");
  vi.stubEnv("MAIL_FROM","noreply@scout.local");
}
describe("fail-closed account configuration",()=>{
  it("accepts explicit loopback configuration",()=>{configure();expect(authReady()).toBe(true);});
  it.each(["","not-a-url","http://example.test","ftp://localhost","https://user:pass@example.test","https://example.test/other"])("rejects unsafe origin %s",url=>{configure();vi.stubEnv("BETTER_AUTH_URL",url);expect(authReady()).toBe(false);});
  it("rejects absent secrets and incomplete mail credentials",()=>{configure();vi.stubEnv("BETTER_AUTH_SECRET","");expect(authReady()).toBe(false);vi.stubEnv("SMTP_USER","user");expect(emailReady()).toBe(false);});
  it("requires TLS-capable remote SMTP configuration",()=>{configure();vi.stubEnv("SMTP_HOST","smtp.example.test");expect(emailReady()).toBe(false);vi.stubEnv("SMTP_PORT","587");expect(emailReady()).toBe(true);});
});
describe("bounded request bodies",()=>{
  it("accepts a small body",async()=>expect(await boundedBody(new Request("http://localhost",{method:"POST",body:"hello"}),5)).toBe("hello"));
  it("rejects oversized bytes even without content-length",async()=>expect(await boundedBody(new Request("http://localhost",{method:"POST",body:"ééé"}),5)).toBeNull());
  it("rejects declared oversized requests",async()=>expect(await boundedBody(new Request("http://localhost",{method:"POST",body:"x",headers:{"content-length":"100"}}),5)).toBeNull());
});