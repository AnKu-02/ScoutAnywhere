import type postgres from "postgres";
import {access} from "node:fs/promises";
import path from "node:path";
import {demoImageGroups,demoPhotographs} from "../src/modules/listings/demo-images";

/** Repeatable update of image references only, never listings or advertisers. */
export async function updateDemoImages(sql:postgres.Sql){
  for(const image of demoPhotographs)await access(path.join(process.cwd(),"public",image.path));
  return sql.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(8142701)`;
    const updated:number[]=[];
    for(const group of demoImageGroups){
      const matches=await tx`SELECT l.id,u.id unit_id,p.id property_id FROM listings l JOIN units u ON u.id=l.unit_id
        JOIN properties p ON p.id=u.property_id JOIN locations loc ON loc.id=p.location_id JOIN cities c ON c.id=loc.city_id
        JOIN advertisers a ON a.id=l.advertiser_id WHERE l.is_demo AND a.is_demo AND a.owner_user_id IS NULL
        AND l.category=${group.category} AND c.name=${group.city} AND loc.locality=${group.locality}
        AND u.bhk IS NOT DISTINCT FROM ${group.bhk} FOR UPDATE OF l,u,p,a`;
      if(matches.length!==1)throw new Error(`Expected exactly one demo ${group.category} in ${group.locality}; found ${matches.length}`);
      const match=matches[0];
      const shared=await tx`SELECT id FROM listings WHERE unit_id IN (SELECT id FROM units WHERE property_id=${match.property_id}) AND id<>${match.id}`;
      if(shared.length)throw new Error("Refusing to change imagery on a shared property");
      const existing=await tx`SELECT * FROM property_images WHERE property_id=${match.property_id} ORDER BY sort_order,id`;
      const desired=group.images.map(([filename])=>demoPhotographs.find(image=>image.path===`/images/demo/${filename}`)!);
      if(existing.length===desired.length&&existing.every((row,index)=>row.unit_id===match.unit_id&&row.path===desired[index].path&&row.alt===desired[index].alt&&row.sort_order===index))continue;
      if(existing.some(row=>!['/images/room.svg','/images/living.svg','/images/building.svg',...desired.map(image=>image.path)].includes(row.path)))throw new Error("Unexpected existing images; refusing to overwrite custom work");
      await tx`DELETE FROM property_images WHERE property_id=${match.property_id}`;
      for(const [order,image] of desired.entries())await tx`INSERT INTO property_images(property_id,unit_id,path,alt,sort_order) VALUES (${match.property_id},${match.unit_id},${image.path},${image.alt},${order})`;
      updated.push(match.id);
    }
    return updated;
  });
}