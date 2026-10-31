import {test,expect} from "@playwright/test";
import postgres from "postgres";
import {demoImageGroups} from "../../src/modules/listings/demo-images";

test("supplied demo photographs: covers, ordered galleries, public assets and responsive layouts",async({page},info)=>{
  test.setTimeout(90000);const sql=postgres(process.env.TEST_DATABASE_URL!,{max:1});
  try{
    for(const group of demoImageGroups){
      const [listing]=await sql`SELECT l.id FROM listings l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
        JOIN locations loc ON loc.id=p.location_id JOIN cities c ON c.id=loc.city_id
        WHERE l.is_demo AND l.category=${group.category} AND c.name=${group.city} AND loc.locality=${group.locality}`;
      await page.goto(`/${group.category}?city=${encodeURIComponent(group.city)}&locality=${encodeURIComponent(group.locality)}`);
      const card=page.locator(".property-card:visible").filter({has:page.locator(`a[href='/listings/${listing.id}']`)});
      const cover=`/images/demo/${group.images[0][0]}`;
      const optimizerPath=(src:string)=>new URL(src,"http://localhost").searchParams.get("url");
      expect(optimizerPath(await card.locator("img").getAttribute("src")||"")).toBe(cover);
      await expect(card.locator("img")).toBeVisible();await card.locator("img").scrollIntoViewIfNeeded();
      await expect.poll(()=>card.locator("img").evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await card.locator("h3 a").click();
      const gallery=page.getByRole("region",{name:"Demo property photographs"}).filter({visible:true});
      await expect(gallery.locator("img")).toHaveCount(5);
      for(const [index,[filename]] of group.images.entries()){
        expect(optimizerPath(await gallery.locator("img").nth(index).getAttribute("src")||"")).toBe(`/images/demo/${filename}`);
        expect((await page.request.get(`/images/demo/${encodeURIComponent(filename)}`)).status()).toBe(200);
        await gallery.locator("img").nth(index).scrollIntoViewIfNeeded();
        await expect.poll(()=>gallery.locator("img").nth(index).evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      await expect(gallery).toContainText("not photographs of a verified available property");
      for(const width of [375,768,1440]){
        await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await gallery.screenshot({path:info.outputPath(`${group.category}-${width}.png`)});
      }
    }
    await page.goto("/");
    // Homepage currently selects other recent flatshares: keep their existing artwork.
    await expect(page.locator(".property-card:visible img")).toHaveCount(3);
    expect((await sql`SELECT count(*)::int AS n FROM listings WHERE is_demo`)[0].n).toBe(24);
    expect((await sql`SELECT count(*)::int AS n FROM advertisers WHERE is_demo`)[0].n).toBe(24);
  }finally{await sql.end();}
});