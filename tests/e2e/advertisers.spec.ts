import {test,expect,type APIRequestContext,type BrowserContext} from "@playwright/test";
import postgres from "postgres";

const origin="http://127.0.0.1:3100";
const password="Advertiser-browser-test-passphrase-123";
test.use({extraHTTPHeaders:async({},provide,info)=>{await provide({"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.61":"192.0.2.62"});}});
async function register(request:APIRequestContext,email:string){
  expect((await request.post("/api/auth/sign-up/email",{headers:{origin},data:{name:"Advertiser Tester",email,password,callbackURL:"/verify-email"}})).ok()).toBe(true);
  let link="";
  await expect.poll(async()=>{
    const data=await(await request.get("http://127.0.0.1:8025/api/v1/messages")).json();
    for(const item of data.messages||[]){
      if(!item.To?.some((to:{Address:string})=>to.Address===email))continue;
      const mail=await(await request.get(`http://127.0.0.1:8025/api/v1/message/${item.ID}`)).json();
      link=String(mail.Text).split(/\s+/).find(value=>value.startsWith(origin)&&value.includes("verify-email"))||"";
      if(link)return true;
    }return false;
  },{timeout:15000}).toBe(true);
  expect((await request.get(link)).ok()).toBe(true);
}

test("advertiser setup, persistence, security boundaries and two-account isolation",async({page,request,browser},info)=>{
  test.setTimeout(120000);
  const sql=postgres(process.env.TEST_DATABASE_URL!,{max:1});
  const email=`advertiser-${Date.now()}-${info.project.name}@example.test`,secondEmail=`other-${email}`;
  const input={displayName:"Private Owner",type:"owner",primaryCity:"Bengaluru",description:"A short description"};
  let other:BrowserContext|undefined;
  const advertiserForm=page.locator("form.account-form:visible");
  try{
    await page.goto("/dashboard/advertiser");await expect(page).toHaveURL(/sign-in/);
    expect((await request.get("/api/advertiser-profile")).status()).toBe(401);
    expect((await request.put("/api/advertiser-profile",{headers:{origin},data:input})).status()).toBe(401);
    await register(request,email);
    expect((await request.put("/api/advertiser-profile",{headers:{origin},data:input})).status()).toBe(401); // verified email alone is not a session
    await page.goto("/sign-in");await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
    await page.getByRole("link",{name:"Become an advertiser",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Become an advertiser",exact:true})).toBeVisible();
    await expect(advertiserForm.getByLabel("Advertiser display name",{exact:true})).toHaveValue("Advertiser Tester");
    await advertiserForm.getByLabel("Advertiser display name",{exact:true}).fill(input.displayName);
    await advertiserForm.getByLabel("Advertiser type",{exact:true}).selectOption("owner");
    await advertiserForm.getByLabel("Primary operating city",{exact:true}).selectOption("Bengaluru");
    await advertiserForm.getByLabel("Short description (optional)",{exact:true}).fill(input.description);
    await page.getByRole("button",{name:"Create advertiser profile",exact:true}).click();await expect(page.getByRole("status")).toContainText("Advertiser profile saved.");
    await expect(page.getByText("Active profile — editing enabled",{exact:true})).toBeVisible();
    await expect(page.getByRole("navigation",{name:"Account navigation"}).getByRole("link",{name:"Advertiser",exact:true})).toHaveAttribute("aria-current","page");
    await expect(page.getByRole("link",{name:"Create your first private draft",exact:true})).toHaveAttribute("href","/dashboard/listings/new");
    await page.getByRole("link",{name:"Create your first private draft",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Create private draft",exact:true})).toBeVisible();
    await expect(page.getByRole("navigation",{name:"Account navigation"}).getByRole("link",{name:"My Listings",exact:true})).toHaveAttribute("aria-current","page");
    await page.getByRole("navigation",{name:"Account navigation"}).getByRole("link",{name:"Advertiser",exact:true}).click();
    await expect(page).toHaveURL(origin+"/dashboard/advertiser");
    await expect(advertiserForm.getByLabel("Advertiser display name",{exact:true})).toBeVisible();
    await page.reload();await expect(advertiserForm.getByLabel("Advertiser display name",{exact:true})).toHaveValue(input.displayName);
    for(const type of ["broker","tenant"]){
      await advertiserForm.getByLabel("Advertiser type",{exact:true}).selectOption(type);
      await advertiserForm.getByLabel("Primary operating city",{exact:true}).selectOption("Mumbai");
      await advertiserForm.getByLabel("Advertiser display name",{exact:true}).fill("Updated private advertiser");
      await page.getByRole("button",{name:"Save advertiser profile",exact:true}).click();await expect(page.getByRole("status")).toContainText("Advertiser profile saved.");await page.reload();await expect(advertiserForm.getByLabel("Advertiser type",{exact:true})).toHaveValue(type);
    }
    for(const width of [375,768,1440]){
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const button=page.getByRole("button",{name:"Save advertiser profile",exact:true});await button.focus();await expect(button).toBeFocused();expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({path:`test-results/advertiser-${info.project.name}-${width}.png`,fullPage:true});
    }
    const response=await page.request.get("/api/advertiser-profile");expect(response.headers()["cache-control"]).toContain("no-store");
    const {profile}=await response.json();expect(profile).not.toHaveProperty("email");expect(profile).not.toHaveProperty("userId");
    const [user]=await sql`SELECT id FROM auth_user WHERE email=${email}`;
    expect(await sql`SELECT * FROM account_capabilities WHERE user_id=${user.id}`).toHaveLength(0);
    for(const extra of [{userId:"victim"},{advertiserId:1},{status:"verified"},{verified:true},{propertyId:1},{listingId:8},{role:"administrator"},{type:"developer"}]){
      expect((await page.request.put("/api/advertiser-profile",{headers:{origin},data:{...input,...extra}})).status()).toBe(400);
    }
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin:"https://evil.example"},data:input})).status()).toBe(403);
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin,"content-type":"text/plain"},data:"not json"})).status()).toBe(415);
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin,"content-type":"application/json"},data:"{"})).status()).toBe(400);
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin},data:{...input,description:"x".repeat(5000)}})).status()).toBe(413);
    expect((await page.request.get(`/api/advertiser-profile?userId=${user.id}`)).status()).toBe(400);
    other=await browser.newContext({baseURL:origin,extraHTTPHeaders:{"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.63":"192.0.2.64"}});
    await register(other.request,secondEmail);
    expect((await other.request.post("/api/auth/sign-in/email",{headers:{origin},data:{email:secondEmail,password}})).ok()).toBe(true);
    expect((await(await other.request.get("/api/advertiser-profile")).json()).profile).toBeNull();
    expect((await other.request.put("/api/advertiser-profile",{headers:{origin},data:{...input,userId:user.id,advertiserId:profile.advertiserId}})).status()).toBe(400);
    expect((await other.request.get(`/api/advertiser-profile/${profile.advertiserId}`)).status()).toBe(404);
    expect((await other.request.put("/api/advertiser-profile",{headers:{origin},data:{...input,displayName:"Independent second advertiser"}})).ok()).toBe(true);
    expect((await(await page.request.get("/api/advertiser-profile")).json()).profile.displayName).toBe("Updated private advertiser");
    await page.goto("/dashboard");await page.getByRole("button",{name:"Sign out",exact:true}).click();await expect(page).toHaveURL(/sign-in/);
    await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
    await page.getByRole("link",{name:"Advertiser",exact:true}).click();await expect(advertiserForm.getByLabel("Advertiser display name",{exact:true})).toHaveValue("Updated private advertiser");
    await sql`UPDATE advertiser_profiles SET status='suspended' WHERE user_id=${user.id}`;
    await page.reload();await expect(page.getByRole("button",{name:"Save advertiser profile",exact:true})).toBeDisabled();
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin},data:input})).status()).toBe(403);
    await page.goto("/dashboard/saved");await expect(page.getByRole("heading",{name:"Saved Properties",exact:true})).toBeVisible();
    await expect(page.getByRole("heading",{name:"You haven't saved any properties yet.",exact:true})).toBeVisible();
    expect((await sql`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
  }finally{await other?.close();await sql`DELETE FROM auth_user WHERE email IN (${email},${secondEmail})`;await sql.end();}
});