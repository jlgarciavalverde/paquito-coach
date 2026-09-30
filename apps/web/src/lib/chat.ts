import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { Conversation, Message, MessagePage } from "@coach/shared";
import { api, RequestError } from "./api";

/** «me» = el cliente hablando con su entrenador; si no, el id del cliente (lado del entrenador). */
export type ThreadKey = "me" | string;
const base = (k: ThreadKey) => (k === "me" ? "/me/messages" : `/conversations/${k}/messages`);

export const threadQuery = (k: ThreadKey) =>
  infiniteQueryOptions({
    queryKey: ["thread", k],
    queryFn: ({ pageParam }) => api<MessagePage>(`${base(k)}?limit=40${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
    staleTime: 0,
  });

export const conversationsQuery = queryOptions({ queryKey: ["conversations"], queryFn: () => api<Conversation[]>("/conversations"), staleTime: 0 });
export const myUnreadQuery = queryOptions({ queryKey: ["unread", "me"], queryFn: () => api<{ unread: number }>("/me/unread"), staleTime: 0 });

/** Añade un mensaje a la caché del hilo (evita duplicados si llega por el socket y por la respuesta). */
export function appendMessage(qc: QueryClient, k: ThreadKey, m: Message) {
  qc.setQueryData<InfiniteData<MessagePage>>(["thread", k], (old) => {
    if (!old) return old;
    if (old.pages.some((p) => p.messages.some((x) => x.id === m.id))) return old;
    const [first, ...rest] = old.pages;
    return { ...old, pages: [{ ...first!, messages: [...first!.messages, m] }, ...rest] };
  });
}

export function useSendMessage(k: ThreadKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { body: string; mediaId: string | null }) => api<Message>(k === "me" ? "/me/messages" : `/conversations/${k}/messages`, { body: b }),
    onSuccess: (m) => {
      appendMessage(qc, k, m);
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export async function markRead(k: ThreadKey) {
  await api(k === "me" ? "/me/messages/read" : `/conversations/${k}/read`, { body: {} }).catch(() => {});
}

/** Sube una foto y devuelve su id. El navegador manda Origin y la cookie solos. */
export async function uploadPhoto(file: File, clientId?: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/v1/media${clientId ? `?clientId=${clientId}` : ""}`, { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new RequestError(res.status, data.error ?? "http", data.message ?? "No se ha podido subir la foto");
  return data.id as string;
}

/**
 * `uploadPhoto` que recuerda lo ya subido: si tras subir la foto falla el paso siguiente (guardar la respuesta, el mensaje…),
 * el reintento reutiliza el mismo archivo del servidor en lugar de subir otro (y dejar huérfano el primero).
 */
export function createUploadCache(clientId?: string) {
  const done = new WeakMap<File, string>();
  return async (file: File) => {
    const hit = done.get(file);
    if (hit) return hit;
    const id = await uploadPhoto(file, clientId);
    done.set(file, id);
    return id;
  };
}

export const mediaUrl = (id: string) => `/api/v1/media/${id}`;
