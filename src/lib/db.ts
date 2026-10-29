import postgres from "postgres";
type Client = ReturnType<typeof postgres>;
const globalDb = globalThis as typeof globalThis & { scoutDb?: Client };
export function db(): Client {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return globalDb.scoutDb ??= postgres(process.env.DATABASE_URL, { max: 10, connect_timeout: 5, idle_timeout: 20 });
}