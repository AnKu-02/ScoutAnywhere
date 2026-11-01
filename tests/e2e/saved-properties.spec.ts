import {test,expect,type BrowserContext,type APIRequestContext} from "@playwright/test";
import postgres from "postgres";
import {randomInt} from "node:crypto";

const origin="http://127.0.0.1:3100";
// Isolated production test server only: keep this journey's abuse bucket separate
// from the existing test which deliberately exhausts the default login bucket.
test.use({extraHTTPHeaders:async({},provide)=>{await provide({"x-scout-test-ip":`198.18.${randomInt(256)}.${randomInt(1,255)}`});}});
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
    await first.getByRole("button",{name:/^Add to Wishlist:/}).click();
    await expect(page).toHaveURL(/sign-in\?next=/);
    const password=await register(request,email);
    await page.getByLabel("Email address",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await expect(page).toHaveURL(origin+href);
    const detailSave=page.getByRole("button",{name:/^Add to Wishlist:/});
    await expect(detailSave).toHaveAttribute("aria-pressed","false");
    expect((await(await page.request.get("/api/saved-listings")).json()).ids).toEqual([]);
    await detailSave.click();await expect(page.getByRole("button",{name:/^Remove from Wishlist:/})).toHaveAttribute("aria-pressed","true");
    await page.goto("/flatshares");await expect(page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button")).toHaveAttribute("aria-pressed","true");
    await page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button").click();await expect(page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button")).toHaveAttribute("aria-pressed","false");
    await page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button").click();await expect(page.locator(`article:has(h3 a[href='${href}'])`).getByRole("button")).toHaveAttribute("aria-pressed","true");
    for(const category of ["rent","buy"]){await page.goto('/'+category);const button=page.locator(".property-card").first().getByRole("button");await button.click();await expect(button).toHaveAttribute("aria-pressed","true");}
    const ids=(await(await page.request.get("/api/saved-listings")).json()).ids as number[];expect(ids).toHaveLength(3);
    await page.goto("/dashboard/saved");await expect(page.locator(".property-card")).toHaveCount(3);
    for(const label of ["Flatshares","Apartments for Rent","Apartments for Sale"]){await page.getByRole("button",{name:label,exact:true}).click();await expect(page.locator(".property-card")).toHaveCount(1);await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");}
    await page.getByRole("button",{name:"All",exact:true}).click();await expect(page.locator(".property-card")).toHaveCount(3);
    await expect(page.getByRole("navigation",{name:"Account navigation"}).getByRole("link",{name:"Wishlist",exact:true})).toHaveAttribute("aria-current","page");
    for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator(".property-card").first().getByRole("button")).toBeVisible();}
    // Assigned demo covers must remain consistent in Saved Properties.
    const photoListings=await sql`SELECT DISTINCT l.id FROM listings l JOIN units u ON u.id=l.unit_id JOIN property_images im ON im.property_id=u.property_id WHERE l.is_demo AND im.path LIKE '/images/demo/%' ORDER BY l.id`;
    for(const listing of photoListings)expect((await page.request.put("/api/saved-listings",{headers:{origin},data:{listingId:listing.id}})).ok()).toBe(true);
    await page.reload();
    for(const listing of photoListings){
      const [cover]=await sql`SELECT im.path FROM property_images im JOIN units u ON u.property_id=im.property_id JOIN listings l ON l.unit_id=u.id WHERE l.id=${listing.id} ORDER BY im.sort_order,im.id LIMIT 1`;
      const image=page.locator(`article:visible:has(h3 a[href='/listings/${listing.id}']) .card-image img`);
      await expect(image).toBeVisible();expect(new URL(await image.getAttribute("src")||"",origin).searchParams.get("url")).toBe(cover.path);
    }
    for(const listing of photoListings)if(!ids.includes(listing.id))expect((await page.request.delete("/api/saved-listings",{headers:{origin},data:{listingId:listing.id}})).ok()).toBe(true);
    await page.locator(`article:visible:has(h3 a[href='${href}']) h3 a`).click();await expect(page).toHaveURL(origin+href);
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
    const tab=await page.context().newPage();await tab.goto(href!);await tab.getByRole("button",{name:/^Remove from Wishlist:/}).click();await expect(page.locator(".property-card")).toHaveCount(2);await tab.close();
    for(let i=0;i<2;i++){await page.locator(".property-card").first().getByRole("button").click();await expect(page.locator(".property-card")).toHaveCount(1-i);}
    await expect(page.getByRole("heading",{name:"Your Wishlist is waiting."})).toBeVisible();
    await expect(page.getByRole("link",{name:"Explore properties",exact:true}).last()).toBeVisible();
    expect((await(await second.request.get("/api/saved-listings")).json()).ids).toEqual([ids[0]]);
  }finally{await second?.close();await sql`DELETE FROM auth_user WHERE email IN (${email},${secondEmail})`;await sql.end();}
});

test("Wishlist URL restores pagination, filters and browser history",async({page},info)=>{
  test.setTimeout(120000);
  const sql=postgres(process.env.TEST_DATABASE_URL!,{max:1});
  const email=`wishlist-history-${Date.now()}-${info.project.name}@example.test`;
  try{
    const password=await register(page.request,email);
    expect((await page.request.post("/api/auth/sign-in/email",{headers:{origin},data:{email,password}})).ok()).toBe(true);
    const listings=await sql`SELECT id,category FROM listings WHERE is_demo AND status='published' ORDER BY id LIMIT 13`;
    expect(listings).toHaveLength(13);
    for(const listing of listings)expect((await page.request.put("/api/saved-listings",{headers:{origin},data:{listingId:listing.id}})).ok()).toBe(true);
    const ids=(await(await page.request.get("/api/saved-listings")).json()).ids as number[];
    const cards=page.locator(".wishlist-grid .property-card:visible");
    const pageTwo=page.getByRole("navigation",{name:"Wishlist pages"}).getByText("Page 2 of 2",{exact:true});
    await page.goto("/dashboard/saved?page=2");
    await expect(pageTwo).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(cards.locator("h3 a")).toHaveAttribute("href",`/listings/${ids[12]}`);
    await page.reload();
    await expect(pageTwo).toBeVisible();
    for(const width of [375,768,1440]){
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const navigation=page.getByRole("navigation",{name:"Account navigation"});
      await expect(navigation.getByRole("link",{name:"Wishlist",exact:true})).toHaveAttribute("aria-current","page");
      const previous=page.getByRole("button",{name:"Previous page",exact:true});
      await previous.focus();await expect(previous).toBeFocused();
      expect(await previous.evaluate(element=>getComputedStyle(element).outlineStyle)).not.toBe("none");
      await page.screenshot({path:info.outputPath(`wishlist-${width}.png`),fullPage:true});
      await navigation.getByRole("link",{name:"Overview",exact:true}).click();
      await expect(page.getByRole("heading",{name:"Your dashboard",exact:true})).toBeVisible();
      await expect(navigation.getByRole("link",{name:"Overview",exact:true})).toHaveAttribute("aria-current","page");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:info.outputPath(`dashboard-${width}.png`),fullPage:true});
      for(const label of ["Advertiser Profile","My Listings","Profile & Security"]){
        await navigation.getByRole("link",{name:label,exact:true}).click();
        await expect(navigation.getByRole("link",{name:label,exact:true})).toHaveAttribute("aria-current","page");
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      }
      await page.goto("/dashboard/saved?page=2");
      await expect(pageTwo).toBeVisible();
    }
    const previous=page.getByRole("button",{name:"Previous page",exact:true});
    await previous.focus();await previous.press("Enter");
    await expect(page).toHaveURL(origin+"/dashboard/saved");
    await page.goBack();
    await expect(pageTwo).toBeVisible();
    await page.getByRole("button",{name:"Previous page",exact:true}).click();
    await expect(page).toHaveURL(origin+"/dashboard/saved");
    await expect(cards).toHaveCount(12);
    await page.getByRole("button",{name:"Next page",exact:true}).click();
    await expect(page).toHaveURL(origin+"/dashboard/saved?page=2");
    const category=String(listings[0].category);
    const label=category==='flatshares'?"Flatshares":category==='rent'?"Apartments for Rent":"Apartments for Sale";
    const count=listings.filter(listing=>listing.category===category).length;
    await page.getByRole("button",{name:label,exact:true}).click();
    await expect(page).toHaveURL(origin+`/dashboard/saved?category=${category}`);
    await expect(cards).toHaveCount(Math.min(12,count));
    await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");
    await page.goBack();
    await expect(page).toHaveURL(origin+"/dashboard/saved?page=2");
    await expect(pageTwo).toBeVisible();
    await expect(page.getByRole("button",{name:"All",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.goForward();
    await expect(page).toHaveURL(origin+`/dashboard/saved?category=${category}`);
    await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");
    await page.reload();
    await expect(cards).toHaveCount(Math.min(12,count));
    await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");
    await cards.first().locator("h3 a").click();
    await expect(page).toHaveURL(/\/listings\/\d+$/);
    await page.goBack();
    await expect(page).toHaveURL(origin+`/dashboard/saved?category=${category}`);
    await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");
    await page.goto("/dashboard/saved?category=unknown&page=-1");
    await expect(cards).toHaveCount(12);
    await expect(page.getByRole("button",{name:"All",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.goto("/dashboard/saved?page=999");
    await expect(pageTwo).toBeVisible();
    expect((await page.request.delete("/api/saved-listings",{headers:{origin},data:{listingId:ids[12]}})).ok()).toBe(true);
    await page.reload();
    await expect(cards).toHaveCount(12);
    await expect(page.getByRole("navigation",{name:"Wishlist pages"})).toHaveCount(0);
  }finally{await sql`DELETE FROM auth_user WHERE email=${email}`;await sql.end();}
});