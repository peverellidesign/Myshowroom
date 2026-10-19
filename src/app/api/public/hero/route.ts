import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getFile } from "@/lib/storage";

// Public: the brand hero image shown on the login and booking pages.
export async function GET() {
  const site = await getSetting<{ heroImageKey?: string }>("site", {});
  if (!site.heroImageKey) return new NextResponse(null, { status: 404 });
  try {
    const data = await getFile(site.heroImageKey);
    const ext = site.heroImageKey.split(".").pop();
    const type = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=300", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
