import { test,expect,type APIRequestContext } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
const origin="http://127.0.0.1:3100",password="Submission-browser-passphrase-123";
test.use({extraHTTPHeaders:async({},provide,info)=>provide({"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.111":"192.0.2.112"})});
async function account(request:APIRequestContext,email:string){
  expect((await request.post("/api/auth/sign-up/email",{headers:{origin},data:{name:"Submission Tester",email,password}})).ok()).toBe(true);
  let link="";await expect.poll(async()=>{
    const data=await(await request.get("http://127.0.0.1:8025/api/v1/messages")).json();
    for(const item of data.messages||[]){if(!item.To?.some((to:{Address:string})=>to.Address===email))continue;const mail=await(await request.get(`http://127.0.0.1:8025/api/v1/message/${item.ID}`)).json();link=String(mail.Text).split(/\s+/).find(value=>value.startsWith(origin)&&value.includes("verify-email"))||"";if(link)return true;}return false;
  },{timeout:15000}).toBe(true);expect((await request.get(link)).ok()).toBe(true);
  expect((await request.post("/api/auth/sign-in/email",{headers:{origin},data:{email,password}})).ok()).toBe(true);
}
test("advertiser submits immutable photos, receives feedback, resubmits, and is approved without publishing",async({page,browser},info)=>{
  test.setTimeout(120000);
  const sql=postgres(process.env.TEST_DATABASE_URL!,{max:2}),email=`submit-${Date.now()}-${info.project.name}@example.test`,modEmail=`mod-${email}`;
  const mod=await browser.newContext({baseURL:origin,extraHTTPHeaders:{"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.113":"192.0.2.114"}});
  let userId="";
  try{
    await account(page.request,email);await account(mod.request,modEmail);
    const [user]=await sql`SELECT id FROM auth_user WHERE email=${email}`;userId=user.id;
    const [moderator]=await sql`SELECT id FROM auth_user WHERE email=${modEmail}`;
    expect((await mod.request.get("/api/moderation")).status()).toBe(403);
    await sql`INSERT INTO account_capabilities(user_id,capability) VALUES (${moderator.id},'moderator'),(${user.id},'moderator')`;
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin},data:{displayName:"Browser submission advertiser",type:"owner",primaryCity:"Bengaluru",description:""}})).ok()).toBe(true);
    const content={category:"rent",relationship:"owner",property:{city:"Bengaluru",locality:"Indiranagar",propertyType:"apartment"},unit:{bhk:2},advertisement:{title:`Private reviewed home ${Date.now()}`,description:"A bright spacious apartment with excellent ventilation and convenient access to shops and transport.",monthlyRent:30000,deposit:0,maintenance:0,brokerage:0}};
    const created=await page.request.post("/api/listing-drafts",{headers:{origin},data:{requestId:crypto.randomUUID(),content}});expect(created.status()).toBe(201);const {draft}=await created.json();
    await page.goto(`/dashboard/listings/${draft.id}/edit`);
    const photos=page.locator("section.photo-section").filter({visible:true});
    await photos.getByLabel("Choose property photographs",{exact:true}).setInputFiles({name:"property.png",mimeType:"image/png",buffer:await sharp({create:{width:100,height:70,channels:3,background:"#6747ff"}}).png().toBuffer()});
    await expect(photos.locator(".photo-card")).toHaveCount(1);
    const controls=page.getByRole("region",{name:"Submit for human review"}).filter({visible:true});
    await controls.getByRole("button",{name:"Check readiness",exact:true}).click();await expect(controls.getByText("Ready to submit for review",{exact:true})).toBeVisible();
    for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
    await controls.getByRole("button",{name:"Submit for Review",exact:true}).click();await controls.getByRole("button",{name:"Confirm submission",exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/listings$/);await expect(page.getByText("Under review",{exact:true})).toBeVisible();
    const first=(await(await page.request.get("/api/submissions")).json()).submissions[0];
    const firstPhoto=`/api/submissions/${first.id}/photos/${first.photos[0].id}`;
    expect((await page.request.get(`/api/moderation/${first.id}`)).status()).toBe(404);
    expect((await page.request.post(`/api/moderation/${first.id}`,{headers:{origin},data:{version:1,decision:"approved",reason:"Self review attempt"}})).status()).toBe(404);
    await page.goto(`/dashboard/listings/${draft.id}/edit`);await page.getByLabel("Listing title",{exact:true}).fill("Updated private working draft");await page.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.getByText("Draft saved privately.",{exact:true})).toBeVisible();
    const media=await(await page.request.get(`/api/listing-drafts/${draft.id}/photos`)).json();expect((await page.request.delete(`/api/listing-drafts/${draft.id}/photos/${media.images[0].id}`,{headers:{origin},data:{version:media.version}})).ok()).toBe(true);
    expect((await page.request.get(firstPhoto)).status()).toBe(200);
    expect((await(await page.request.get(`/api/submissions/${first.id}`)).json()).submission.content.advertisement.title).toBe(content.advertisement.title);
    const reviewPage=await mod.newPage();await reviewPage.goto("/dashboard/moderation");await reviewPage.getByRole("link",{name:"Review submitted version",exact:true}).filter({visible:true}).first().click();
    // The shared test database can contain prior audit fixtures; navigate to this exact snapshot.
    await reviewPage.goto(`/dashboard/moderation/${first.id}`);await expect(reviewPage.getByRole("heading",{name:content.advertisement.title,exact:true})).toBeVisible();
    await reviewPage.getByLabel("Decision",{exact:true}).selectOption("changes_requested");await reviewPage.getByLabel("Decision reason",{exact:true}).fill("Please clarify the description and restore the updated photo.");await reviewPage.getByRole("button",{name:"Review decision before confirming",exact:true}).click();await Promise.all([reviewPage.waitForResponse(response=>response.url().includes("/api/moderation/")&&response.request().method()==="POST"&&response.status()===200),reviewPage.getByRole("button",{name:"Confirm decision",exact:true}).click()]);await expect(reviewPage.getByText(/Immutable submitted version.*Changes requested/)).toBeVisible();
    await page.goto("/dashboard/listings");await expect(page.getByText("Changes requested",{exact:true}).filter({visible:true})).toBeVisible();await expect(page.getByText(/Latest review feedback: Please clarify/).filter({visible:true})).toBeVisible();
    await page.goto(`/dashboard/listings/${draft.id}/edit`);await photos.getByLabel("Choose property photographs",{exact:true}).setInputFiles({name:"updated.png",mimeType:"image/png",buffer:await sharp({create:{width:90,height:60,channels:3,background:"#c7f75d"}}).png().toBuffer()});await expect(photos.locator(".photo-card")).toHaveCount(1);
    await controls.getByRole("button",{name:"Check readiness",exact:true}).click();await expect(controls.getByText("Ready to submit for review",{exact:true})).toBeVisible();await controls.getByRole("button",{name:"Submit for Review",exact:true}).click();await controls.getByRole("button",{name:"Confirm submission",exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/listings$/);
    const second=(await(await page.request.get("/api/submissions")).json()).submissions[0];expect(second.previousId).toBe(first.id);
    await reviewPage.goto(`/dashboard/moderation/${second.id}`);await reviewPage.getByLabel("Decision reason",{exact:true}).fill("Requested details and updated photographs reviewed.");await reviewPage.getByRole("button",{name:"Review decision before confirming",exact:true}).click();await Promise.all([reviewPage.waitForResponse(response=>response.url().includes("/api/moderation/")&&response.request().method()==="POST"&&response.status()===200),reviewPage.getByRole("button",{name:"Confirm decision",exact:true}).click()]);await expect(reviewPage.getByText(/Immutable submitted version.*Approved, not published/)).toBeVisible();
    await page.goto("/dashboard/listings");await expect(page.getByText("Approved, not published",{exact:true}).filter({visible:true})).toBeVisible();
    await page.goto("/rent?locality=Indiranagar");await expect(page.getByRole("heading",{name:"Updated private working draft",exact:true})).toHaveCount(0);
    expect((await sql`SELECT count(*)::int AS n FROM listings WHERE title IN (${content.advertisement.title},'Updated private working draft')`)[0].n).toBe(0);
    const another=await(await page.request.post("/api/listing-drafts",{headers:{origin},data:{requestId:crypto.randomUUID(),content}})).json();
    const uploaded=await(await page.request.post(`/api/listing-drafts/${another.draft.id}/photos`,{headers:{origin,"content-type":"application/octet-stream","idempotency-key":crypto.randomUUID()},data:await sharp({create:{width:50,height:50,channels:3,background:"#17251f"}}).png().toBuffer()})).json();
    const submitted=await(await page.request.post("/api/submissions",{headers:{origin},data:{requestId:crypto.randomUUID(),draftId:another.draft.id,version:1,mediaVersion:uploaded.version}})).json();
    await page.goto(`/dashboard/submissions/${submitted.submission.id}`);await page.getByRole("button",{name:"Withdraw submission",exact:true}).click();await page.getByRole("button",{name:"Confirm withdrawal",exact:true}).click();await expect(page.getByText(/Immutable submitted version.*Withdrawn/)).toBeVisible();
    await sql`DELETE FROM account_capabilities WHERE user_id=${moderator.id} AND capability='moderator'`;expect((await mod.request.get(`/api/moderation/${second.id}`)).status()).toBe(403);
  }finally{
    if(userId){const pending=await sql`SELECT id,version FROM listing_submissions WHERE user_id=${userId} AND state='pending'`;for(const s of pending)await page.request.post(`/api/submissions/${s.id}`,{headers:{origin},data:{version:s.version,decision:"withdrawn",reason:"Browser fixture cleanup"}});}
    await mod.close();await sql`DELETE FROM auth_user WHERE email IN (${email},${modEmail})`;await sql.end();
  }
});