import { test, expect } from "@playwright/test";

test("homepage modes submit to existing category routes",async({page})=>{
  await page.goto("/");
  await expect(page.getByLabel("Looking for")).toHaveCount(0);
  await page.getByRole("radio",{name:"Buy",exact:true}).check();
  await page.getByLabel("City",{exact:true}).selectOption("Mumbai");
  await page.getByRole("button",{name:"Find a place"}).click();
  await expect(page).toHaveURL(/\/buy\?/);
  await expect(page.getByRole("heading",{level:1})).toHaveText("Homes for sale");
});

for (const width of [375,768,1440]) {
  test(`layouts remain usable at ${width}px`,async({page})=>{
    // Six routes plus decoding every lazy image can exceed the default on mobile emulation.
    test.setTimeout(60000);
    await page.setViewportSize({width,height:1000});
    for (const route of ["/","/rent","/buy","/flatshares","/listings/8","/pg-management"]) {
      await page.goto(route);
      await page.evaluate(()=>document.fonts.ready);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),route).toBe(true);
      await expect(page.getByRole("navigation",{name:"Main navigation"})).toBeVisible();
      // React can retain inactive route DOM. Inspect every image on the visible page,
      // not hidden/prefetched route trees that disappear during hydration.
      for (const image of await page.locator(".property-card img:visible, .gallery img:visible").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(()=>image.evaluate(node=>{const img=node as HTMLImageElement;return img.complete&&img.naturalWidth>0;})).toBe(true);
      }
      if (["/rent","/buy","/flatshares"].includes(route)) {
        const sources=await page.locator(".property-card img:visible").evaluateAll(images=>images.map(img=>decodeURIComponent(img.getAttribute("src")??"")));
        for(const source of sources) expect(source).toMatch(route==="/flatshares" ? /room\.svg|lavender-bedroom-workspace\.png/ : /living\.svg|building\.svg/);
      }
      if (route==="/rent") {
        const summary=page.getByRole("complementary",{name:"Property filters",exact:true}).locator(".filter-disclosure summary");
        await summary.click();
        await expect(page.getByRole("button",{name:"Apply filters"})).toBeHidden();
        await summary.press("Enter");
        await expect(page.getByRole("button",{name:"Apply filters"})).toBeVisible();
      }
    }
    await page.goto("/");
    for (const selector of [".hero-artwork img", ".owner-entry-artwork img"]) {
      const image=page.locator(selector).filter({visible:true});
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect.poll(()=>image.evaluate(node=>{const img=node as HTMLImageElement;return img.complete && img.naturalWidth>0;})).toBe(true);
    }
    await expect(page.locator(".coordinate-mark")).toHaveCount(0);
    expect(await page.locator(".hero-artwork:visible").evaluate(el=>getComputedStyle(el).clipPath)).toBe("none");
    const ratio=await page.locator(".hero-artwork img:visible").evaluate(el=>{const r=el.getBoundingClientRect();return r.width/r.height;});
    expect(ratio).toBeCloseTo(1672/941,1);
    await expect(page.locator(".property-card .card-costs")).toHaveCount(0);
    const ownerImage=page.locator(".owner-entry-artwork:visible");
    expect(await ownerImage.evaluate(el=>getComputedStyle(el).borderRadius)).toBe("9px");
    await expect(page.locator(".property-card img[src*='mandala'], .property-card img[src*='doorway']")).toHaveCount(0);
    const artwork=await page.locator(".hero-artwork:visible").boundingBox();
    const copy=await page.locator(".hero-copy:visible").boundingBox();
    if(width>700) expect(artwork!.x).toBeGreaterThanOrEqual(copy!.x+copy!.width);
    else expect(artwork!.y).toBeGreaterThanOrEqual(copy!.y+copy!.height);
    await page.getByRole("radio",{name:"Rent",exact:true}).focus();
    await expect(page.getByRole("radio",{name:"Rent",exact:true})).toBeFocused();
    await page.screenshot({path:`test-results/electric-calm-${width}.png`,fullPage:true});
  });
}

test("design lab is unavailable in production",async({page})=>{
  const response=await page.goto("/design-lab");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading",{name:"Three perspectives."})).toHaveCount(0);
});

test("original brand artwork is served without missing assets",async({request})=>{
  for(const path of ["violet-topographic-map.png","lavender-doorway.png","lavender-bedroom-workspace.png","lavender-doorway-olive-tree.png","topographic-mandala.png"]) {
    const response=await request.get(`/images/${path}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});