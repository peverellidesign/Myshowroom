import { NextResponse, type NextRequest } from "next/server";

// Lightweight gate: the session itself is validated server-side on every request
// (getCurrentUser); this only avoids rendering protected pages without a cookie.
const PUBLIC = [/^\/login/, /^\/book(\/|$)/, /^\/api\/public\//, /^\/offline\.html$/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.get("ms_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|sw.js|manifest.webmanifest|favicon.ico|pdf.worker.min.mjs).*)"],
};
