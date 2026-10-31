/** Public, user-supplied demonstration assets only; unrelated to private uploads. */
export const demoImageGroups=[
  {category:"flatshares",city:"Bengaluru",locality:"HSR Layout",bhk:null,images:[
    ["Cosy Modern Bedroom Study Retreat.png","Bedroom with a study desk",1448,1086],
    ["Sunlit Modern Boho Living Room.png","Sunlit shared living room",1536,1024],
    ["Sunlit Olive-Green Kitchen with Plants.png","Olive-green kitchen with plants",1536,1024],
    ["Bright Modern Bathroom with Greenery.png","Bright bathroom with greenery",1536,1024],
    ["Sunlit Urban Balcony Retreat.png","Balcony seating area",1536,1024],
  ]},
  {category:"rent",city:"Mumbai",locality:"Powai",bhk:2,images:[
    ["Sunlit Modern Living Room with City Views.png","Living room with city views",1536,1024],
    ["2B_Powai_master_bedroom.png","Master bedroom with city views",1086,724],
    ["2C_Powai_second_bedroom.png","Second bedroom and study desk",1086,724],
    ["2D_Powai_kitchen.png","Apartment kitchen",760,1024],
    ["2E_Powai_building_exterior.png","Residential building exterior",760,1024],
  ]},
  {category:"buy",city:"Bengaluru",locality:"Whitefield",bhk:3,images:[
    ["3A_Whitefield_living_room.png","Living room",1720,1014],
    ["3B_Whitefield_dining_area.png","Dining area",1330,1014],
    ["3C_Whitefield_master_bedroom.png","Master bedroom",1104,1014],
    ["3D_Whitefield_kitchen.png","Kitchen",992,1014],
    ["3E_Whitefield_balcony_view.png","Balcony view",930,1014],
  ]},
] as const;
export const demoPhotographs=demoImageGroups.flatMap(group=>group.images.map(([filename,scene,width,height])=>({
  path:`/images/demo/${filename}`,alt:`${scene} — fictional ${group.locality} demo imagery, not real availability`,width,height,caption:scene,
})));