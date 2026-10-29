import { test, expect } from "@playwright/test";
test("homepage search, deterministic filters, and property details",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{level:1})).toContainText("A place that fits");
  await page.getByLabel("City",{exact:true}).selectOption("Bengaluru");
  await page.getByLabel("Locality",{exact:true}).fill("HSR Layout");
  await page.getByRole("button",{name:"Find a place"}).click();
  await page.getByLabel("Maximum rent").fill("15000");
  await page.getByLabel("Furnishing",{exact:true}).selectOption("furnished");
  await page.getByRole("button",{name:"Apply filters"}).click();
  await expect(page.getByText("1 demo property",{exact:true})).toBeVisible();
  await page.getByRole("heading",{level:3}).getByRole("link").click();
  await expect(page.getByRole("heading",{name:"Clear costs. No guesswork."})).toBeVisible();
  await expect(page.getByText("FICTIONAL DEMO LISTING",{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test("empty and invalid searches are actionable",async({page})=>{
  await page.goto("/flatshares?maxPrice=1");
  await expect(page.getByRole("heading",{name:"No homes match these filters."})).toBeVisible();
  await page.getByRole("link",{name:"Reset search"}).click();
  await expect(page.getByText("8 demo properties",{exact:true})).toBeVisible();
  await page.goto("/rent?minPrice=200&maxPrice=100");
  await expect(page.getByRole("heading",{name:"Check your search filters"})).toBeVisible();
});
test("categories, sorting, pagination, and disabled PG inquiries",async({page})=>{
  await page.goto("/rent?sort=price-asc");
  await expect(page.getByLabel("BHK",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Next",exact:true}).click();
  await expect(page.getByText("Page 2 of 2",{exact:true})).toBeVisible();
  await page.goto("/buy");
  await expect(page.getByRole("heading",{level:1})).toHaveText("Homes for sale");
  await expect(page.getByLabel("Available on or before")).toHaveCount(0);
  await page.goto("/flatshares");
  await expect(page.getByLabel("BHK",{exact:true})).toHaveCount(0);
  await page.goto("/pg-management");
  await expect(page.getByRole("button",{name:"Inquiries opening"})).toBeDisabled();
  await expect(page.getByLabel("Business email")).toBeDisabled();
});