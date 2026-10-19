import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { errorMessage } from "@/lib/action";
import { audit } from "@/lib/audit";
import { renderQuotationPdf } from "@/lib/pdf/quotation";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "quote:view")) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await params;
  try {
    const { buffer, fileName } = await renderQuotationPdf(id);
    await audit(user.id, "quotation.pdf", "Quotation", id, "Generato PDF preventivo");
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 400 });
  }
}
