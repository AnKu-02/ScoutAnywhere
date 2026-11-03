/** Deliberately allow only known internal destinations; never arbitrary URLs. */
export function accountDestination(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  if (/^\/listings\/[1-9]\d{0,9}$/.test(value) || value === "/dashboard/saved") return value;
  if (value === "/dashboard/messages" || /^\/dashboard\/messages\?listing=[1-9]\d{0,9}$/.test(value)
    || /^\/dashboard\/messages\?conversation=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) return value;
  return "/dashboard";
}