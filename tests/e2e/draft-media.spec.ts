import {test,expect,type APIRequestContext,type BrowserContext} from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
import {LocalPrivateStorage} from "../../src/modules/draft-media/storage";
import {cleanupMedia} from "../../src/modules/draft-media/repository";
import {db} from "../../src/lib/db";

const origin="http://127.0.0.1:3100",password="Private-media-browser-passphrase-123";
test.use({extraHTTPHeaders:async({},provide,info)=>{await provide({"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.91":"192.0.2.92"});}});
async function register(request:APIRequestContext,email:string){
  expect((await request.post("/api/auth/sign-up/email",{headers:{origin},data:{name:"Photo Tester",email,password,callbackURL:"/verify-email"}})).ok()).toBe(true);
  let link="";
  await expect.poll(async()=>{
    const data=await(await request.get("http://127.0.0.1:8025/api/v1/messages")).json();
    for(const item of data.messages||[]){
      if(!item.To?.some((to:{Address:string})=>to.Address===email))continue;
      const mail=await(await request.get(`http://127.0.0.1:8025/api/v1/message/${item.ID}`)).json();
      link=String(mail.Text).split(/\s+/).find(value=>value.startsWith(origin)&&value.includes("verify-email"))||"";if(link)return true;
    }return false;
  },{timeout:15000}).toBe(true);
  expect((await request.get(link)).ok()).toBe(true);
}
test("private photography upload, cover, ordering, persistence and access control",async({page,browser},info)=>{
  test.setTimeout(120000);
  const sql=postgres(process.env.TEST_DATABASE_URL!,{max:1});
  const email=`photos-${Date.now()}-${info.project.name}@example.test`,otherEmail=`other-${email}`;
  let other:BrowserContext|undefined;
  try{
    await register(page.request,email);
    await page.goto("/sign-in");await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
    expect((await page.request.put("/api/advertiser-profile",{headers:{origin},data:{displayName:"Photo Advertiser",type:"owner",primaryCity:"Bengaluru",description:""}})).ok()).toBe(true);
    await page.goto("/dashboard/listings/new");await page.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page).toHaveURL(/\/edit$/);
    const draftId=page.url().split("/").at(-2)!;
    const section=page.locator("section.photo-section").filter({visible:true});
    await expect(section.getByText("No photos yet. Start with your favourite view.",{exact:true})).toBeVisible();
    await expect(section.locator(".photo-card")).toHaveCount(0);
    await expect(page.locator(".demo-banner")).toContainText("Sign in to create private drafts");
    await expect(page.getByText(/(?:Photo|Saved) version/)).toHaveCount(0);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.getByRole("link",{name:"Jump to Photos ↓",exact:true}).click();
    await expect(page).toHaveURL(/#draft-photos$/);
    const picker=section.getByLabel("Choose property photographs",{exact:true});
    await picker.focus();await expect(picker).toBeFocused();
    const red=await sharp({create:{width:100,height:60,channels:3,background:"red"}}).jpeg().toBuffer();
    const blue=await sharp({create:{width:80,height:60,channels:3,background:"blue"}}).png().toBuffer();
    const uploadRoute=`**/api/listing-drafts/${draftId}/photos`;
    await page.route(uploadRoute,async route=>{
      if(route.request().method()==="POST")await new Promise(resolve=>setTimeout(resolve,500));
      await route.continue();
    });
    await picker.setInputFiles({name:"bedroom.jpg",mimeType:"image/jpeg",buffer:red});
    await expect(section.getByRole("progressbar")).toBeVisible();
    await expect(section.locator(".photo-card")).toHaveCount(1);
    await expect(section.getByText("Uploaded privately",{exact:true})).toHaveCount(1);
    await expect(section.getByRole("progressbar")).toHaveCount(0);
    await expect(section.getByRole("button",{name:"Move photograph 1 earlier",exact:true})).toBeDisabled();
    await expect(section.getByRole("button",{name:"Move photograph 1 later",exact:true})).toBeDisabled();
    await expect(section.getByRole("button",{name:"Use photograph 1 as cover",exact:true})).toBeDisabled();
    await expect(section.locator(".photo-cover-badge")).toHaveText("Cover photograph");
    await picker.setInputFiles({name:"kitchen.png",mimeType:"image/png",buffer:blue});
    await expect(section.locator(".photo-card")).toHaveCount(2);await expect(section.getByText("Uploaded privately",{exact:true})).toHaveCount(1);
    await expect(section.getByRole("progressbar")).toHaveCount(0);
    await page.unroute(uploadRoute);
    await expect(section.getByRole("button",{name:"Move photograph 1 earlier",exact:true})).toBeDisabled();
    await expect(section.getByRole("button",{name:"Move photograph 2 later",exact:true})).toBeDisabled();
    let media=await(await page.request.get(`/api/listing-drafts/${draftId}/photos`)).json();
    const firstId=media.images[0].id,secondId=media.images[1].id,privateUrl=media.images[0].url;
    await expect(section.getByRole("img").first()).toBeVisible();
    await section.getByRole("img").first().scrollIntoViewIfNeeded();
    await expect.poll(()=>section.getByRole("img").first().evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await section.getByRole("button",{name:"Use photograph 2 as cover",exact:true}).click();
    await expect(section.getByRole("button",{name:"Use photograph 2 as cover",exact:true})).toBeDisabled();
    await section.getByRole("button",{name:"Move photograph 2 earlier",exact:true}).click();
    await expect.poll(async()=>{media=await(await page.request.get(`/api/listing-drafts/${draftId}/photos`)).json();return media.images[0].id;}).toBe(secondId);
    expect(media.images[0].cover).toBe(true);
    for(const width of [375,768,1440]){
      await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      const card=await section.locator(".photo-card").first().boundingBox();expect(card!.width).toBeLessThan(360);
      await section.scrollIntoViewIfNeeded();await section.screenshot({path:info.outputPath(`photos-${width}.png`)});
    }
    await page.getByRole("link",{name:"Preview saved draft",exact:true}).click();await expect(page.getByText("Draft preview. Not published.",{exact:true})).toBeVisible();
    await expect(page.locator(".photo-gallery img")).toHaveCount(2);
    await expect(page.locator(".photo-gallery img").first()).toHaveAttribute("src",media.images[0].url);
    const delivery=await page.request.get(privateUrl);expect(delivery.status()).toBe(200);expect(delivery.headers()["cache-control"]).toContain("no-store");expect(delivery.headers()["content-type"]).toBe("image/webp");
    expect((await page.request.get(`/_next/image?url=${encodeURIComponent(privateUrl)}&w=640&q=75`)).status()).toBe(400);
    expect((await page.request.get(`/images/${firstId}.webp`)).status()).toBe(404);
    await page.goto("/dashboard");await page.getByRole("button",{name:"Sign out",exact:true}).click();await expect(page).toHaveURL(/sign-in/);
    expect((await page.request.get(privateUrl)).status()).toBe(401);
    await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
    await page.goto(`/dashboard/listings/${draftId}/edit`);await expect(section.locator(".photo-card")).toHaveCount(2);
    expect((await(await page.request.get(`/api/listing-drafts/${draftId}/photos`)).json()).images.map((image:{id:string})=>image.id)).toEqual([secondId,firstId]);
    other=await browser.newContext({baseURL:origin,extraHTTPHeaders:{"x-scout-test-ip":info.project.name==="desktop"?"192.0.2.93":"192.0.2.94"}});
    await register(other.request,otherEmail);expect((await other.request.post("/api/auth/sign-in/email",{headers:{origin},data:{email:otherEmail,password}})).ok()).toBe(true);
    expect((await other.request.get(privateUrl)).status()).toBe(404);
    expect((await other.request.post(`/api/listing-drafts/${draftId}/photos`,{headers:{origin,"content-type":"application/octet-stream","idempotency-key":crypto.randomUUID()},data:red})).status()).toBe(404);
    expect((await other.request.delete(`/api/listing-drafts/${draftId}/photos/${firstId}`,{headers:{origin},data:{version:media.version}})).status()).toBe(404);
    await section.getByRole("button",{name:"Delete photograph 2",exact:true}).click();await section.getByRole("button",{name:"Cancel",exact:true}).click();await expect(section.locator(".photo-card")).toHaveCount(2);
    await section.getByRole("button",{name:"Delete photograph 2",exact:true}).click();await section.getByRole("button",{name:"Delete photograph permanently",exact:true}).click();await expect(section.locator(".photo-card")).toHaveCount(1);
    expect((await page.request.get(privateUrl)).status()).toBe(404);
    await expect(section.getByRole("button",{name:"Move photograph 1 earlier",exact:true})).toBeDisabled();
    await expect(section.getByRole("button",{name:"Move photograph 1 later",exact:true})).toBeDisabled();
    await section.getByLabel("Choose property photographs",{exact:true}).setInputFiles({name:"document.heic",mimeType:"image/heic",buffer:Buffer.from("unsupported HEIC")});
    await expect(section.getByText(/HEIC, SVG, GIF, video and PDF are not supported/)).toBeVisible();
    await page.goto("/dashboard/listings");await expect(page.locator(".draft-cover img")).toHaveCount(1);
    expect((await sql`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
  }finally{
    await other?.close();await sql`DELETE FROM auth_user WHERE email IN (${email},${otherEmail})`;await sql.end();
    process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;await cleanupMedia(new LocalPrivateStorage(process.env.TEST_MEDIA_LOCAL_ROOT||".private-media/test"),100);await db().end();
  }
});