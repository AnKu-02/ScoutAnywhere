import {test,expect} from "@playwright/test";
import postgres from "postgres";
import { randomInt } from "node:crypto";

const origin="http://127.0.0.1:3100";
// Test-only trusted header: isolate repeat runs without disabling database rate limits.
// All requests within the abuse test still share a bucket and must be throttled.
test.use({extraHTTPHeaders:async({},provide)=>{
  await provide({"x-scout-test-ip":`198.18.${randomInt(256)}.${randomInt(1,255)}`});
}});
async function emailLink(request:import("@playwright/test").APIRequestContext,email:string,kind:"verify-email"|"reset-password") {
  let link="";
  await expect.poll(async()=>{
    const result=await (await request.get("http://127.0.0.1:8025/api/v1/messages")).json();
    for(const item of result.messages||[]) {
      if(!item.To?.some((to:{Address:string})=>to.Address===email))continue;
      const mail=await (await request.get(`http://127.0.0.1:8025/api/v1/message/${item.ID}`)).json();
      const match=String(mail.Text).match(new RegExp(`http://[^\\s]+${kind}[^\\s]*`));
      if(match){link=match[0];return true;}
    }return false;
  },{timeout:15000}).toBe(true);return link;
}

test("private routes and write APIs reject anonymous access",async({page,request})=>{
  await page.goto("/dashboard");await expect(page).toHaveURL(/sign-in/);
  await page.goto("/account");await expect(page).toHaveURL(/sign-in/);
  expect((await request.patch("/api/account",{headers:{origin},data:{}})).status()).toBe(401);
  expect((await request.post("/api/auth/sign-up/email",{headers:{origin:"https://evil.example"},data:{}})).status()).toBe(403);
  expect((await request.post("/api/auth/update-user",{headers:{origin},data:{role:"admin"}})).status()).toBe(404);
});

test("verified registration, sessions, profile ownership, reset and logout",async({page,request})=>{
  test.setTimeout(120000);
  const email=`scout-${Date.now()}-${test.info().project.name}@example.test`;
  const password="A-unique-test-passphrase-876";
  const sql=postgres(process.env.TEST_DATABASE_URL!,{max:1});
  const victimId=`victim-${Date.now()}-${test.info().project.name}`;
  // Ignore inactive route forms retained by React; keep visible-field assertions strict.
  const profileForm=page.locator("form.account-form:visible");
  try {
    await sql`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES(${victimId},'Other Account',${victimId+'@example.test'},true)`;
    await page.goto("/register");
    await page.getByLabel("Display name",{exact:true}).fill("Account Tester");await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);
    await page.getByRole("button",{name:"Create account",exact:true}).click();await expect(page.getByRole("status")).toContainText("Check your email");
    const unverified=await request.post("/api/auth/sign-in/email",{headers:{origin},data:{email,password}});expect(unverified.status()).toBe(403);
    const verify=await emailLink(request,email,"verify-email");await page.goto(verify);
    await page.goto("/sign-in");await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
    await page.reload();await expect(page.getByRole("heading",{name:"Hello, Account Tester"})).toBeVisible();
    const cookies=await page.context().cookies();expect(cookies.some(c=>c.name.includes("session_token")&&c.httpOnly&&c.sameSite==="Lax")).toBe(true);
    expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
    expect((await page.request.post("/api/auth/change-password",{headers:{origin},data:{currentPassword:"wrong-password",newPassword:password+"-changed",revokeOtherSessions:true}})).ok()).toBe(false);
    await page.goto("/account");await profileForm.getByLabel("Display name",{exact:true}).fill("Updated Tester");await profileForm.getByLabel("Preferred city").fill("Mumbai");await page.getByRole("button",{name:"Save profile"}).click();await expect(page.getByRole("status")).toContainText("Profile updated");await page.reload();await expect(profileForm.getByLabel("Display name",{exact:true})).toHaveValue("Updated Tester");
    const forged=await page.request.patch("/api/account",{headers:{origin},data:{displayName:"Hacker",image:"",preferredCity:"",seeking:true,owning:false,brokering:false,userId:victimId,role:"administrator"}});expect(forged.status()).toBe(400);
    expect((await sql`SELECT name FROM auth_user WHERE id=${victimId}`)[0].name).toBe("Other Account");
    const [user]=await sql`SELECT id FROM auth_user WHERE email=${email}`;expect(await sql`SELECT * FROM account_capabilities WHERE user_id=${user.id}`).toHaveLength(0);
    expect((await sql`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
    const reset=await request.post("/api/auth/request-password-reset",{headers:{origin},data:{email,redirectTo:"/reset-password"}});expect(reset.ok()).toBe(true);
    const resetLink=await emailLink(request,email,"reset-password");await page.goto(resetLink);await page.getByLabel("New password",{exact:true}).fill(password+"-new");await page.getByRole("button",{name:"Set new password"}).click();await expect(page.getByRole("status")).toContainText("Password changed");
    const token=new URL(page.url()).searchParams.get("token");
    expect((await request.post("/api/auth/reset-password",{headers:{origin},data:{token,newPassword:password+"-reused"}})).ok()).toBe(false);
    await page.goto("/dashboard");await expect(page).toHaveURL(/sign-in/);
    await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password+"-new");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
    await page.getByRole("button",{name:"Sign out",exact:true}).click();await expect(page).toHaveURL(/sign-in/);await page.goto("/dashboard");await expect(page).toHaveURL(/sign-in/);
  } finally {await sql`DELETE FROM auth_user WHERE email=${email} OR id=${victimId}`;await sql.end();}
});

test("invalid input and repeated login attempts are rejected",async({request},info)=>{
  test.skip(info.project.name!=="mobile","Run once, after both account journeys, to avoid consuming their shared login bucket.");
  expect((await request.post("/api/auth/sign-up/email",{headers:{origin},data:{name:"X",email:"invalid",password:"short",role:"admin"}})).status()).toBe(400);
  let limited=false;
  for(let i=0;i<10;i++) {
    const response=await request.post("/api/auth/sign-in/email",{headers:{origin},data:{email:"missing@example.test",password:"wrong-long-password"}});
    if(response.status()===429){limited=true;break;}
    expect(response.ok()).toBe(false);
  }
  expect(limited).toBe(true);
});