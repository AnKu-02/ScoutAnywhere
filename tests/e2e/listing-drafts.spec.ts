import {test,expect,type APIRequestContext,type BrowserContext} from "@playwright/test";
import postgres from "postgres";

const origin="http://127.0.0.1:3100",password="Private-draft-browser-passphrase-123";
test.use({extraHTTPHeaders:async({},provide,info)=>{await provide({"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.81":"192.0.2.82"});}});
async function account(request:APIRequestContext,email:string){
  expect((await request.post("/api/auth/sign-up/email",{headers:{origin},data:{name:"Draft Tester",email,password,callbackURL:"/verify-email"}})).ok()).toBe(true);
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
  expect((await request.post("/api/auth/sign-in/email",{headers:{origin},data:{email,password}})).ok()).toBe(true);
}
test("private draft lifecycle, all categories, validation and account isolation",async({page,browser},info)=>{
  test.setTimeout(150000);
  const sql=postgres(process.env.TEST_DATABASE_URL!,{max:1});
  const email=`draft-${Date.now()}-${info.project.name}@example.test`,otherEmail=`other-${email}`;
  let other:BrowserContext|undefined;
  const form=page.locator("form.draft-form").filter({visible:true});
  try{
    await page.goto("/dashboard/listings");await expect(page).toHaveURL(/sign-in/);
    expect((await page.request.get("/api/listing-drafts")).status()).toBe(401);
    await account(page.request,email);
    await page.goto("/dashboard/listings");await expect(page.getByRole("heading",{name:"An active advertiser profile is required"})).toBeVisible();
    expect((await page.request.post("/api/advertiser-profile",{headers:{origin},data:{}})).status()).toBe(405);
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin},data:{displayName:"Draft Advertiser",type:"owner",primaryCity:"Bengaluru",description:""}})).ok()).toBe(true);
    await page.reload();await expect(page.getByRole("heading",{name:"No listing drafts yet"})).toBeVisible();
    await page.getByRole("link",{name:"Create Listing",exact:true}).click();
    await form.getByLabel("Listing category",{exact:true}).selectOption("flatshares");
    await form.getByLabel("Your relationship to this property",{exact:true}).selectOption("tenant");
    await form.getByLabel("City",{exact:true}).fill("Bengaluru");
    await form.getByLabel("Listing title",{exact:true}).fill("Private room draft");
    await form.getByLabel("Monthly rent (INR)",{exact:true}).fill("-10");
    await form.getByRole("button",{name:"Save draft",exact:true}).click();
    await expect(form.getByRole("alert")).toContainText("Check the highlighted fields");
    await form.getByLabel("Monthly rent (INR)",{exact:true}).fill("14000");
    await form.getByLabel("Security deposit (INR)",{exact:true}).fill("0");
    await form.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page).toHaveURL(/\/edit$/);
    const id=page.url().split("/").at(-2)!;
    await page.reload();await expect(form.getByLabel("Listing title",{exact:true})).toHaveValue("Private room draft");
    await expect(form.getByLabel("Listing category",{exact:true})).toBeDisabled();
    await page.getByRole("link",{name:"Preview saved draft",exact:true}).click();
    await expect(page.getByText("Draft preview. Not published.",{exact:true})).toBeVisible();
    await expect(page.getByText("No photographs added",{exact:true})).toBeVisible();
    const preview=await page.request.get(`/dashboard/listings/${id}/preview`);expect(preview.headers()["cache-control"]).toContain("no-store");expect(preview.headers()["x-robots-tag"]).toContain("noindex");
    const stored=await(await page.request.get(`/api/listing-drafts/${id}`)).json();
    expect(stored.draft.content.relationship).toBe("tenant");expect(stored.draft.content.advertisement.deposit).toBe(0);
    for(const category of ["rent","buy"]){
      await page.goto("/dashboard/listings/new");await form.getByLabel("Listing category",{exact:true}).selectOption(category);
      await expect(form.getByLabel("BHK configuration",{exact:true})).toBeVisible();
      if(category==="buy")await expect(form.getByLabel("Monthly rent (INR)",{exact:true})).toHaveCount(0);
      await form.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page).toHaveURL(/\/edit$/);
    }
    await page.goto(`/dashboard/listings/${id}/edit`);
    await form.getByLabel("Listing title",{exact:true}).fill("Unsaved local title");
    const updated=await page.request.put(`/api/listing-drafts/${id}`,{headers:{origin},data:{version:stored.draft.version,content:{...stored.draft.content,advertisement:{...stored.draft.content.advertisement,title:"Saved elsewhere"}}}});expect(updated.ok()).toBe(true);
    await form.getByRole("button",{name:"Save draft",exact:true}).click();await expect(form.getByRole("alert")).toContainText("This draft changed");
    await expect(form.getByLabel("Listing title",{exact:true})).toHaveValue("Unsaved local title");
    page.once("dialog",dialog=>dialog.dismiss());await page.getByRole("link",{name:"Back to My Listings",exact:true}).click();await expect(page).toHaveURL(/\/edit$/);
    page.once("dialog",dialog=>dialog.accept());await page.getByRole("link",{name:"Back to My Listings",exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/listings$/);
    const card=page.locator("article:visible").filter({has:page.getByRole("heading",{name:"Saved elsewhere",exact:true})});
    await card.getByRole("button",{name:"Delete draft: Saved elsewhere",exact:true}).click();await card.getByRole("button",{name:"Cancel",exact:true}).click();await expect(card).toBeVisible();
    other=await browser.newContext({baseURL:origin,extraHTTPHeaders:{"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.83":"192.0.2.84"}});
    await account(other.request,otherEmail);
    expect((await other.request.put("/api/advertiser-profile",{headers:{origin},data:{displayName:"Other Draft Advertiser",type:"broker",primaryCity:"Mumbai",description:""}})).ok()).toBe(true);
    expect((await other.request.get(`/api/listing-drafts/${id}`)).status()).toBe(404);
    expect((await other.request.put(`/api/listing-drafts/${id}`,{headers:{origin},data:{version:2,content:stored.draft.content}})).status()).toBe(404);
    expect((await other.request.delete(`/api/listing-drafts/${id}`,{headers:{origin},data:{version:2}})).status()).toBe(404);
    // App Router can start streaming the shared layout before notFound sets the body.
    // Verify the actual denial and absence of private content, not a streamed HTTP status.
    const otherPage=await other.newPage();await otherPage.goto(`/dashboard/listings/${id}/preview`);
    await expect(otherPage.getByRole("heading",{name:"We couldn’t find that page.",exact:true})).toBeVisible();
    await expect(otherPage.getByText("Saved elsewhere",{exact:true})).toHaveCount(0);
    await expect(otherPage.getByText("Draft preview. Not published.",{exact:true})).toHaveCount(0);
    await otherPage.close();
    expect((await page.request.post("/api/listing-drafts",{headers:{origin:"https://evil.example"},data:{}})).status()).toBe(403);
    await card.getByRole("button",{name:"Delete draft: Saved elsewhere",exact:true}).click();await card.getByRole("button",{name:"Delete permanently",exact:true}).click();await expect(card).toHaveCount(0);
    expect((await page.request.get(`/api/listing-drafts/${id}`)).status()).toBe(404);
    const [user]=await sql`SELECT id FROM auth_user WHERE email=${email}`;
    const drafts=(await(await page.request.get("/api/listing-drafts")).json()).drafts;
    await sql`UPDATE advertiser_profiles SET status='suspended' WHERE user_id=${user.id}`;
    expect((await page.request.get(`/api/listing-drafts/${drafts[0].id}`)).status()).toBe(404);
    expect((await page.request.delete(`/api/listing-drafts/${drafts[0].id}`,{headers:{origin},data:{version:1}})).status()).toBe(403);
    await page.goto("/dashboard/listings");await expect(page.getByRole("heading",{name:"An active advertiser profile is required"})).toBeVisible();
    expect((await sql`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
    expect((await sql`SELECT count(*)::int AS n FROM advertisers WHERE is_demo`)[0].n).toBe(24);
  }finally{await other?.close();await sql`DELETE FROM auth_user WHERE email IN (${email},${otherEmail})`;await sql.end();}
});