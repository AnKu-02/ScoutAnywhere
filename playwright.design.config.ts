import {defineConfig} from "@playwright/test";
if(!process.env.TEST_DATABASE_URL) throw new Error("Design preview tests require TEST_DATABASE_URL");
export default defineConfig({
  testDir:"./tests",testMatch:"design-lab.spec.ts",workers:1,
  use:{baseURL:"http://localhost:3101",...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})},
  webServer:{command:"npm run dev -- --port 3101",url:"http://127.0.0.1:3101",reuseExistingServer:false,env:{DATABASE_URL:process.env.TEST_DATABASE_URL},timeout:120000},
});