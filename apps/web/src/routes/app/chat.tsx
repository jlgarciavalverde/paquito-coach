import { createFileRoute } from "@tanstack/react-router";
import { Thread } from "../../components/chat/thread";
import { useMe } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/title";

export const Route = createFileRoute("/app/chat")({
  component: MyChat,
});

function MyChat() {
  const me = useMe()!;
  useDocumentTitle("Chat");
  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[420px] flex-col sm:h-[calc(100dvh-9rem)]">
      <h1 className="font-wide border-b border-rule pb-3 text-[24px]">Chat con {me.studio.coachName.split(" ")[0] || "tu entrenador"}</h1>
      <Thread threadKey="me" mine={(m) => !m.fromCoach} otherName={me.studio.coachName || "tu entrenador"} className="flex-1" />
    </div>
  );
}
