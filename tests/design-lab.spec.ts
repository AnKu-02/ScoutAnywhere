// Explicitly selected by the development-only Playwright configuration.
import {test,expect} from "@playwright/test";

function contrast(a:number[],b:number[]) {
  const luminance=(rgb:number[])=>rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const [x,y]=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (x+.05)/(y+.05);
}

test("Electric Calm reference uses shared components with unique controls and readable colors",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error") errors.push(message.text());});
  await page.goto("/design-lab");
  for (const width of [375,768,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for (const id of ["electric-calm"]) {
      const theme=page.locator(`[data-theme="${id}"]`);
      await expect(theme.getByRole("navigation",{name:/navigation$/})).toBeVisible();
      await expect(theme.getByRole("button",{name:"Find a place"})).toBeVisible();
      await expect(theme.locator(".property-card")).toHaveCount(1);
      await theme.getByRole("radio",{name:"Buy",exact:true}).check();
      await expect(theme.locator(".search-form.compact")).toHaveAttribute("action","/buy");
      // Evaluate actual resolved tokens, not palette guesses. All these carry small text.
      const pairs=await theme.evaluate(el=>{
        const style=getComputedStyle(el);
        const rgb=(token:string)=>{
          const probe=document.createElement("span");probe.style.color=style.getPropertyValue(token);el.appendChild(probe);
          const color=getComputedStyle(probe).color.match(/[\d.]+/g)!.slice(0,3).map(Number);probe.remove();return color;
        };
        return [["--text","--surface"],["--muted","--surface"],["--on-primary","--primary"],["--on-accent","--accent"],["--brand-text","--brand-background"],["--brand-muted","--brand-background"]].map(([a,b])=>({a,b,fg:rgb(a),bg:rgb(b)}));
      });
      for(const pair of pairs) expect(contrast(pair.fg,pair.bg),`${id}: ${pair.a} on ${pair.b}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  const ids=await page.locator("[id]").evaluateAll(nodes=>nodes.map(n=>n.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(errors).toEqual([]);
  await page.screenshot({path:"test-results/design-lab.png",fullPage:true});
});