import { cleanupMedia } from "../src/modules/draft-media/repository";
import { db } from "../src/lib/db";
try{console.log(`Reclaimed ${await cleanupMedia(undefined,100)} private media objects (bounded batch).`);}finally{await db().end();}