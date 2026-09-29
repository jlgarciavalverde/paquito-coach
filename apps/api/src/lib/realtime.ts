import type { WebSocket } from "ws";
import type { ServerEvent } from "@coach/shared";

/** Conexiones abiertas por usuario (un solo proceso: basta con memoria). */
export class Hub {
  private sockets = new Map<string, Set<WebSocket>>();

  add(userId: string, ws: WebSocket) {
    const set = this.sockets.get(userId) ?? new Set();
    set.add(ws);
    this.sockets.set(userId, set);
    ws.on("close", () => {
      set.delete(ws);
      if (set.size === 0) this.sockets.delete(userId);
    });
  }

  isOnline = (userId: string) => (this.sockets.get(userId)?.size ?? 0) > 0;

  send(userIds: Iterable<string>, ev: ServerEvent) {
    const data = JSON.stringify(ev);
    for (const id of new Set(userIds)) for (const ws of this.sockets.get(id) ?? []) if (ws.readyState === ws.OPEN) ws.send(data);
  }

  pingAll() {
    for (const set of this.sockets.values()) for (const ws of set) if (ws.readyState === ws.OPEN) ws.ping();
  }
}
