import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { pushSubscriptions } from "../db/schema";

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushSender = (userIds: string[], payload: PushPayload) => Promise<void>;

/** Web Push con VAPID (sin Firebase). Si no hay claves configuradas, no hace nada. */
export function createPushSender(db: DB, keys: { publicKey?: string; privateKey?: string; subject: string }): PushSender {
  if (!keys.publicKey || !keys.privateKey) return async () => {};
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  return async (userIds, payload) => {
    if (userIds.length === 0) return;
    const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          // 404/410: el navegador anuló la suscripción → se borra.
          if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
      }),
    );
  };
}
