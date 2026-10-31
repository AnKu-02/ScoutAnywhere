import { defineConfig, devices } from "@playwright/test";
if (!process.env.TEST_DATABASE_URL) throw new Error("Browser tests require TEST_DATABASE_URL for an isolated seeded database.");
export default defineConfig({
  testDir:"./tests/e2e", fullyParallel:false, workers:1,
  use:{baseURL:"http://127.0.0.1:3100",trace:"retain-on-failure", ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})},
  projects:[{name:"desktop",use:{...devices["Desktop Chrome"]}},{name:"mobile",use:{...devices["Pixel 7"],defaultBrowserType:"chromium"}}],
  webServer:{command:"npm run start -- --port 3100",url:"http://127.0.0.1:3100",reuseExistingServer:false,env:{DATABASE_URL:process.env.TEST_DATABASE_URL,MEDIA_STORAGE_DRIVER:"local",MEDIA_LOCAL_ROOT:process.env.TEST_MEDIA_LOCAL_ROOT||".private-media/test",BETTER_AUTH_URL:"http://127.0.0.1:3100",BETTER_AUTH_SECRET:"isolated-browser-test-secret-not-for-deployment-123456",SMTP_HOST:"127.0.0.1",SMTP_PORT:"1025",MAIL_FROM:"Scout Test <noreply@scout.local>",AUTH_TRUSTED_IP_HEADER:"x-scout-test-ip"},timeout:120000},
});