import {test,expect,type BrowserContext,type APIRequestContext} from "@playwright/test";
import postgres from "postgres";

const origin="http://127.0.0.1:3100";
// Isolated production test server only: keep this journey's abuse bucket separate
// from the existing test which deliberately exhausts the default login bucket.
test.use({extraHTTPHeaders:async({},provide,info)=>{await provide({"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.42":"192.0.2.43"});}});
async function register(request:APIRequestContext,email:string) {
  const password="Saved-properties-browser-passphrase-123";
  const response=await request.post("/api/auth/sign-up/email",{headers:{origin},data:{name:"Saved Browser",email,password,callbackURL:"/verify-email"}});
  expect(response.ok()).toBe(true);
  let link="";
  await expect.poll(async()=>{
    const data=await(await request.get("http://127.0.0.1:8025/api/v1/messages")).json();
    for(const item of data.messages||[]){
      if(!item.To?.some((to:{Address:string})=>to.Address===email))continue;
      const message=await(await request.get(`http://127.0.0.1:8025/api/v1/message/${item.ID}`)).json();
      link=String(message.Text).split(/\s+/).find(value=>value.startsWith(origin)&&value.includes("verify-email"))||"";
      if(link)return true;
    }return false;
  }).toBe(true);
  expect((await request.get(link)).ok()).toBe(true);
  return password;
}

test("saved properties: authentication intent, all categories, persistence and two-account isolation",async({page,request,browser},info)=>{
  test.setTimeout(120000);
  const sql=postgres(process.env.TEST_DATABASE_URL!,{max:1});
  const email=`favorites-${Date.now()}-${info.project.name}@example.test`;
  const secondEmail=`second-${email}`;
  let second:BrowserContext|undefined;
  try{
    await page.goto("/dashboard/saved");await expect(page).toHaveURL(/sign-in/);
    expect((await request.put("/api/saved-listings",{headers:{origin},data:{listingId:8}})).status()).toBe(401);
    await page.goto("/flatshares");
    const first=page.locator(".property-card").first();
    const href=await first.locator("h3 a").getAttribute("href");
    await first.getByRole("button",{name:/^Save property:/}).click();
    await expect(page).toHaveURL(/sign-in\?next=/);
    const password=await register(request,email);
    await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await expect(page).toHaveURL(origin+href);
    const detailSave=page.getByRole("button",{name:/^Save property:/});
    await expect(detailSave).toHaveAttribute("aria-pressed","false");
    expect((await(await page.request.get("/api/saved-listings")).json()).ids).toEqual([]);
    await detailSave.click();await expect(page.getByRole("button",{name:/^Remove from saved properties:/})).toHaveAttribute("aria-pressed","true");
    await page.goto("/flatshares");await expect(page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button")).toHaveAttribute("aria-pressed","true");
    await page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button").click();await expect(page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button")).toHaveAttribute("aria-pressed","false");
    await page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button").click();await expect(page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button")).toHaveAttribute("aria-pressed","true");
    for(const category of ["rent","buy"]){await page.goto('/'+category);const button=page.locator(".property-card").first().getByRole("button");await button.click();await expect(button).toHaveAttribute("aria-pressed","true");}
    const ids=(await(await page.request.get("/api/saved-listings")).json()).ids as number[];expect(ids).toHaveLength(3);
    await page.goto("/dashboard/saved");await expect(page.locator(".property-card")).toHaveCount(3);
    for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator(".property-card").first().getByRole("button")).toBeVisible();}
    await page.locator(`article:has(h3 a[href='${href}']) h3 a`).click();await expect(page).toHaveURL(origin+href);
    expect((await page.request.put("/api/saved-listings",{headers:{origin:"https://evil.example"},data:{listingId:ids[0]}})).status()).toBe(403);
    expect((await page.request.put("/api/saved-listings",{headers:{origin},data:{listingId:-1}})).status()).toBe(400);
    const [user]=await sql`SELECT id FROM auth_user WHERE email=${email}`;
    expect((await page.request.put("/api/saved-listings",{headers:{origin},data:{listingId:ids[0],userId:"another"}})).status()).toBe(400);
    expect((await page.request.get(`/api/saved-listings?userId=${user.id}`)).status()).toBe(400);
    second=await browser.newContext({baseURL:origin,extraHTTPHeaders:{"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.44":"192.0.2.45"}});
    await register(second.request,secondEmail);
    expect((await second.request.post("/api/auth/sign-in/email",{headers:{origin},data:{email:secondEmail,password}})).ok()).toBe(true);
    expect((await(await second.request.get("/api/saved-listings")).json()).ids).toEqual([]);
    expect((await second.request.delete("/api/saved-listings",{headers:{origin},data:{listingId:ids[0]}})).ok()).toBe(true);
    expect((await(await page.request.get("/api/saved-listings")).json()).ids).toHaveLength(3);
    expect((await second.request.put("/api/saved-listings",{headers:{origin},data:{listingId:ids[0]}})).ok()).toBe(true);
    await page.goto("/dashboard");await page.getByRole("button",{name:"Sign out",exact:true}).click();
    await page.goto("/sign-in?next=%2Fdashboard%2Fsaved");await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard\/saved/);await expect(page.locator(".property-card")).toHaveCount(3);
    // Changes in another tab are reflected without a manual reload.
    const tab=await page.context().newPage();await tab.goto(href!);await tab.getByRole("button",{name:/^Remove from saved properties:/}).click();await expect(page.locator(".property-card")).toHaveCount(2);await tab.close();
    for(let i=0;i<2;i++){await page.locator(".property-card").first().getByRole("button").click();await expect(page.locator(".property-card")).toHaveCount(1-i);}
    await expect(page.getByRole("heading",{name:"You haven't saved any properties yet."})).toBeVisible();
    expect((await(await second.request.get("/api/saved-listings")).json()).ids).toEqual([ids[0]]);
  }finally{await second?.close();await sql`DELETE FROM auth_user WHERE email IN (${email},${secondEmail})`;await sql.end();}
});