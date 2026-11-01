import { cleanupMedia } from "../src/modules/draft-media/repository";
import { db } from "../src/lib/db";
import { cleanupPublicMedia } from "../src/modules/publications/repository";
try{console.log(`Reclaimed ${await cleanupMedia(undefined,100)} private media objects and ${await cleanupPublicMedia(undefined,100)} publication copies (bounded batches).`);}finally{await db().end();}