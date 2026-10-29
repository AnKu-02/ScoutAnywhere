import { db } from "../src/lib/db";
const sql = db();
if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Demo seed requires ALLOW_DEMO_SEED=true and a non-production environment.");
}
try {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(8142701)`;
    // Never truncate or overwrite existing data. Repeat runs are a no-op.
    if ((await tx`SELECT id FROM listings LIMIT 1`).length) { console.log("Listings exist; seed skipped."); return; }
    const locations = [
      ["Bengaluru","Karnataka","HSR Layout","560102"], ["Bengaluru","Karnataka","Whitefield","560066"],
      ["Bengaluru","Karnataka","Bellandur","560103"], ["Bengaluru","Karnataka","Electronic City","560100"],
      ["Mumbai","Maharashtra","Powai","400076"], ["Mumbai","Maharashtra","Andheri","400053"],
      ["Mumbai","Maharashtra","Ghatkopar","400077"], ["Mumbai","Maharashtra","Goregaon","400063"],
    ];
    for (const name of ["Lift", "Power backup", "Covered parking", "Security", "Balcony", "Water supply"]) await tx`INSERT INTO amenities(name) VALUES (${name}) ON CONFLICT DO NOTHING`;
    for (let i=0; i<locations.length; i++) {
      const [city,state,locality,pin] = locations[i];
      const [c] = await tx`INSERT INTO cities(name,state) VALUES (${city},${state}) ON CONFLICT(name) DO UPDATE SET state=excluded.state RETURNING id`;
      const [loc] = await tx`INSERT INTO locations(city_id,locality,pin_code) VALUES (${c.id},${locality},${pin}) ON CONFLICT(city_id,locality) DO UPDATE SET pin_code=excluded.pin_code RETURNING id`;
      for (let j=0; j<3; j++) {
        const category = ["flatshares","rent","buy"][j];
        const kind = j===0 ? "room" : "entire-home";
        const advertiser = j===2 && i%3===0 ? "developer" : i%2===0 ? "owner" : "broker";
        const [a] = await tx`INSERT INTO advertisers(display_name,kind) VALUES (${`Demo ${advertiser} ${i+1}`},${advertiser}) RETURNING id`;
        const [p] = await tx`INSERT INTO properties(location_id,building,address_line,property_type,coordinates) VALUES (${loc.id},${`Example ${["Gardens","Heights","Residency"][j]} ${i+1}`},${`Fictional lane ${i+1}, ${locality}`},${i%3===2?"independent-house":"apartment"},ST_SetSRID(ST_MakePoint(${i<4?77.64:72.9},${i<4?12.91:19.12}),4326)::geography) RETURNING id`;
        const furnished = i%3===0 ? "furnished" : i%3===1 ? "semi-furnished" : "unfurnished";
        const [u] = await tx`INSERT INTO units(property_id,kind,label,bhk,carpet_sqft,furnishing,household_size,house_rules) VALUES (${p.id},${kind},${j===0?"Private bedroom":"Entire home"},${j===0?null:2+i%2},${j===0?null:850+i*80},${furnished},${j===0?2:null},${j===0?"No smoking indoors. Quiet hours after 10 pm. Shared utilities billed separately at actuals.":null}) RETURNING id`;
        const amount = j===0 ? 14000+i*1500 : j===1 ? 32000+i*3500 : 8500000+i*1800000;
        await tx`INSERT INTO listings(unit_id,unit_kind,advertiser_id,category,title,description,price,deposit,maintenance,brokerage,available_from,published_at) VALUES (${u.id},${kind},${a.id},${category},${j===0?`Private room in a shared home · ${locality}`:`${2+i%2} BHK ${j===1?"for rent":"for sale"} · ${locality}`},${"Fictional demonstration listing, not a real available property. A bright residential space with practical storage and shared neighbourhood conveniences. All names, addresses, prices and coordinates are illustrative. Illustrations are not property photographs."},${amount},${j===2?null:amount*3},${j===0?1000:2500},${advertiser==="broker"?(j===2?amount*0.01:amount):0},${j===2?null:"2026-11-15"},${new Date(Date.UTC(2026,9,1+i,j)).toISOString()})`;
        for (const [order,scene] of ["room","living","building"].entries()) await tx`INSERT INTO property_images(property_id,unit_id,path,alt,sort_order) VALUES (${p.id},${scene==="room"?u.id:null},${`/images/${scene}.svg`},${`Illustrative ${scene}, not a photograph of this demo property`},${order})`;
        await tx`INSERT INTO property_amenities(property_id,amenity_id) SELECT ${p.id}, id FROM amenities WHERE name IN ('Security','Water supply','Balcony')`;
      }
    }
    console.log("Seeded 24 fictional demo listings.");
  });
} finally { await sql.end(); }