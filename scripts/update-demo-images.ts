import {db} from "../src/lib/db";
import {updateDemoImages} from "./demo-images";
if(process.env.NODE_ENV==="production"||process.env.ALLOW_DEMO_SEED!=="true")throw new Error("Requires explicit demo opt-in and non-production environment");
try{console.log("Updated demo listing images:",await updateDemoImages(db()));}finally{await db().end();}