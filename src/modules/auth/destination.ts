/** Deliberately allow only known internal destinations; never arbitrary URLs. */
export function accountDestination(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  if (/^\/listings\/[1-9]\d{0,9}$/.test(value) || value === "/dashboard/saved") return value;
  return "/dashboard";
}