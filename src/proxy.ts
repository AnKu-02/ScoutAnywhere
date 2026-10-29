import { NextResponse } from "next/server";

/** Reject the design lab before streaming starts; keep it strictly development-only. */
export function proxy() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Design preview is available in development only.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/design-lab/:path*"] };