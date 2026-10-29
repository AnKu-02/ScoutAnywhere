export function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}
export function price(value: number, sale = false): string {
  if (sale && value >= 10000000) return `₹${Number((value / 10000000).toFixed(2))} crore`;
  if (sale && value >= 100000) return `₹${Number((value / 100000).toFixed(2))} lakh`;
  return inr(value);
}
export function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}