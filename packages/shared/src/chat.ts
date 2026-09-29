import { z } from "zod";

export const Message = z.object({
  id: z.string(),
  clientId: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  fromCoach: z.boolean(),
  body: z.string(),
  mediaId: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof Message>;

export const SendMessageInput = z
  .object({
    body: z.string().trim().max(4000, "El mensaje es demasiado largo").default(""),
    mediaId: z.string().uuid().nullable().default(null),
  })
  .refine((m) => m.body.length > 0 || m.mediaId, { message: "Escribe algo o adjunta una foto" });

export const MessagePage = z.object({ messages: z.array(Message), hasMore: z.boolean(), otherReadAt: z.string().nullable() });
export type MessagePage = z.infer<typeof MessagePage>;

export const MessagesQuery = z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(40) });

export const Conversation = z.object({
  clientId: z.string(),
  clientName: z.string(),
  hasAccount: z.boolean(),
  lastMessage: Message.nullable(),
  unread: z.number(),
});
export type Conversation = z.infer<typeof Conversation>;

/** Eventos del canal en tiempo real (servidor → navegador). */
export type ServerEvent =
  | { type: "ready" }
  | { type: "message.new"; message: Message }
  | { type: "message.read"; clientId: string; readerId: string; at: string }
  | { type: "workout.completed"; workoutId: string; clientId: string };

export const PushSubscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
