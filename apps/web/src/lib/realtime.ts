import { useEffect, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { MessagePage, ServerEvent } from "@coach/shared";
import { appendMessage } from "./chat";

/**
 * Canal en tiempo real (/ws). Se reconecta solo con espera creciente. No es la única vía de datos:
 * al reconectar se invalidan las consultas para ponerse al día por REST.
 */
export function useRealtime(role: "coach" | "client") {
  const qc = useQueryClient();
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        let ev: ServerEvent;
        try {
          ev = JSON.parse(e.data as string);
        } catch {
          return;
        }
        if (ev.type === "ready") {
          if (retry > 0) void qc.invalidateQueries();
          retry = 0;
          setOnline(true);
        } else if (ev.type === "message.new") {
          const key = role === "client" ? "me" : ev.message.clientId;
          appendMessage(qc, key, ev.message);
          void qc.invalidateQueries({ queryKey: role === "client" ? ["unread", "me"] : ["conversations"] });
        } else if (ev.type === "message.read") {
          const key = role === "client" ? "me" : ev.clientId;
          qc.setQueryData<InfiniteData<MessagePage>>(["thread", key], (old) =>
            old ? { ...old, pages: old.pages.map((p, i) => (i === 0 ? { ...p, otherReadAt: ev.at > (p.otherReadAt ?? "") ? ev.at : p.otherReadAt } : p)) } : old,
          );
        } else if (ev.type === "workout.completed") {
          void qc.invalidateQueries({ queryKey: ["activity"] });
          void qc.invalidateQueries({ queryKey: ["workouts"] });
        }
      };
      ws.onclose = () => {
        setOnline(false);
        if (stopped) return;
        retry++;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [qc, role]);
  return online;
}
