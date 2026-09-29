import { CLIENT_STATUS_LABEL, type ClientStatus } from "@coach/shared";
import { Badge } from "../ui/surface";

const TONE = { active: "success", pending: "clay", invited: "accent", no_account: "neutral", archived: "neutral" } as const;

export function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {CLIENT_STATUS_LABEL[status]}
    </Badge>
  );
}
