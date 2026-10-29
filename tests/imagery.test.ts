import {describe,it,expect} from "vitest";
import {existsSync} from "node:fs";
import {listingIllustrations} from "../src/components/listing-imagery";

describe("centralized demonstration illustration selection",()=>{
  it("is stable, varied and uses only supplied listing artwork",()=>{
    const paths=new Set<string>();
    for(const id of [22,19,16,13,10,7,4,1]) {
      const listing={id,category:"flatshares" as const,is_demo:true,images:[]};
      const first=listingIllustrations(listing);
      expect(first).toEqual(listingIllustrations(listing));
      expect(first).toHaveLength(3);
      expect(new Set(first.map(i=>i.path)).size).toBe(3);
      for(const image of first) {
        expect(existsSync(`public${image.path}`)).toBe(true);
        expect(image.alt).toContain("not a property photograph");
        expect(image.path).not.toMatch(/doorway|topographic|mandala/);
      }
      paths.add(first[0].path);
    }
    expect(paths).toEqual(new Set(["/images/room.svg","/images/lavender-bedroom-workspace.png"]));
  });
  it.each(["rent","buy"] as const)("uses whole-home covers for %s and keeps gallery selection consistent",category=>{
    const paths=new Set<string>();
    for(let id=1;id<=24;id++) {
      const listing={id,category,is_demo:true,images:[]};
      const images=listingIllustrations(listing);
      expect(images).toEqual(listingIllustrations(listing));
      expect(images).toHaveLength(3);
      expect(["/images/living.svg","/images/building.svg"]).toContain(images[0].path);
      paths.add(images[0].path);
    }
    expect(paths.size).toBe(2);
  });
  it("keeps non-demo image paths unchanged",()=>{
    const images=[{path:"/images/custom.svg",alt:"Provided property image"}];
    expect(listingIllustrations({id:1,category:"rent",is_demo:false,images})[0]).toMatchObject(images[0]);
  });
});