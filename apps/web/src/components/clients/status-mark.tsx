import { CLIENT_STATUS_LABEL, type ClientStatus } from "@coach/shared";
import { PlateMark, type PlateTone } from "../ui/layout";

const TONE: Record<ClientStatus, PlateTone> = { active: "green", pending: "red", invited: "blue", no_account: "white", archived: "grey" };

export function StatusMark({ status }: { status: ClientStatus }) {
  return <PlateMark tone={TONE[status]}>{CLIENT_STATUS_LABEL[status]}</PlateMark>;
}
