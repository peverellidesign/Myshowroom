import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { aiConfigured } from "@/lib/ai";
import { PageHeader } from "@/components/ui/misc";
import { AskChat } from "./ask-chat";

export const metadata = { title: "Ask myshowroom" };

export default async function AskPage() {
  const user = await requireUser("ai:use");
  return (
    <div className="mx-auto max-w-5xl animate-fadein">
      <PageHeader eyebrow="08 / Ask myshowroom" title="Chiedi." subtitle="Trova il pezzo giusto, mentre sei accanto al cliente." />
      <AskChat aiEnabled={aiConfigured()} canQuote={can(user.role, "quote:edit")} />
    </div>
  );
}
