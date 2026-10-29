import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { sendAccountEmail, emailReady } from "./email";

export function authReady() {
  try {
    const url = new URL(process.env.BETTER_AUTH_URL || "");
    const validOrigin = !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
    return Boolean(validOrigin && process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32 && emailReady());
  } catch { return false; }
}

let instance: ReturnType<typeof createAuth> | undefined;
let pool: Pool | undefined;
function createAuth() {
  const baseURL = process.env.BETTER_AUTH_URL!;
  const url = new URL(baseURL);
  if (url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new Error("Authentication requires HTTPS outside localhost");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
  return betterAuth({
    appName: "ScoutAnywhere", baseURL, secret: process.env.BETTER_AUTH_SECRET,
    database: pool,
    trustedOrigins: [url.origin],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true, requireEmailVerification: true, minPasswordLength: 12, maxPasswordLength: 128,
      autoSignIn: false, revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) => sendAccountEmail(user.email, url, "reset"),
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => sendAccountEmail(user.email, url, "verify"),
    },
    user: { modelName: "auth_user", changeEmail: { enabled: false } },
    account: { modelName: "auth_account" },
    session: { modelName: "auth_session", expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    verification: { modelName: "auth_verification", storeIdentifier: "hashed" },
    rateLimit: { enabled: true, storage: "database", modelName: "auth_rate_limit", window: 60, max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 600, max: 5 },
        "/request-password-reset": { window: 600, max: 5 },
        "/send-verification-email": { window: 600, max: 5 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: url.protocol === "https:",
      // Do not trust arbitrary client-forwarded headers. Configure only an edge-overwritten header.
      ipAddress: { ipAddressHeaders: process.env.AUTH_TRUSTED_IP_HEADER ? [process.env.AUTH_TRUSTED_IP_HEADER] : [] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
  });
}
export function auth() {
  if (!authReady()) throw new Error("Authentication configuration is incomplete");
  return instance ??= createAuth();
}

export async function closeAuth() { await pool?.end(); pool = undefined; instance = undefined; }