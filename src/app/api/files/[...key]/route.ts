import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFile } from "@/lib/storage";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
};

// Serves product/inventory/site images to authenticated users only.
// Documents (PDF) are never served here: see /api/documents/[id]/file.
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const { key } = await params;
  const path = key.join("/");
  if (!/^(products|inventory|site)\//.test(path)) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  const ext = path.split(".").pop() ?? "";
  try {
    const data = await getFile(path);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
}
