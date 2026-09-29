import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, PaperPlaneRight, X } from "@phosphor-icons/react";
import type { Message } from "@coach/shared";
import { Button, IconButton } from "../ui/button";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { markRead, mediaUrl, threadQuery, uploadPhoto, useSendMessage, type ThreadKey } from "../../lib/chat";
import { dayLong, today } from "../../lib/dates";
import { localDate, hhmm } from "../../lib/agenda";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";

/**
 * Conversación entre el entrenador y un cliente. `threadKey` = "me" en el lado del cliente, o el id del cliente
 * en el del entrenador. `mine` decide qué mensajes son «míos» (a la derecha).
 */
export function Thread({ threadKey, mine, otherName, disabledReason, className }: { threadKey: ThreadKey; mine: (m: Message) => boolean; otherName: string; disabledReason?: string; className?: string }) {
  const q = useInfiniteQuery(threadQuery(threadKey));
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const messages = (q.data?.pages ?? []).slice().reverse().flatMap((p) => p.messages);
  const otherReadAt = q.data?.pages[0]?.otherReadAt ?? null;
  const last = messages.at(-1);

  // Al abrir y al llegar mensajes nuevos: bajar al final (si ya estabas abajo) y marcar como leído.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [last?.id, q.isSuccess]);
  const qc = useQueryClient();
  useEffect(() => {
    if (!q.isSuccess || (last && mine(last))) return;
    // Al leer, se actualizan los contadores de no leídos (pestaña y bandeja).
    void markRead(threadKey).then(() => qc.invalidateQueries({ queryKey: threadKey === "me" ? ["unread", "me"] : ["conversations"] }));
  }, [last?.id, q.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastMineRead = [...messages].reverse().find(mine);
  const seen = lastMineRead && otherReadAt && otherReadAt >= lastMineRead.createdAt;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-1"
        role="log"
        aria-live="polite"
        aria-label={`Conversación con ${otherName}`}
      >
        {q.hasNextPage && (
          <div className="py-3 text-center">
            <Button size="sm" variant="quiet" loading={q.isFetchingNextPage} onClick={() => ((stick.current = false), q.fetchNextPage())}>
              Ver mensajes anteriores
            </Button>
          </div>
        )}
        {q.isPending ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-2">Aún no os habéis escrito. Lo que pongas aquí solo lo veis {otherName.split(" ")[0]} y tú.</p>
        ) : (
          <ol className="flex flex-col gap-1 py-4">
            {messages.map((m, i) => {
              const day = localDate(m.createdAt);
              const newDay = i === 0 || localDate(messages[i - 1]!.createdAt) !== day;
              const own = mine(m);
              const grouped = !newDay && i > 0 && mine(messages[i - 1]!) === own;
              return (
                <li key={m.id} className="flex flex-col">
                  {newDay && <p className="my-3 text-center text-[12.5px] text-ink-3 first-letter:uppercase">{day === today() ? "hoy" : dayLong(day)}</p>}
                  <div className={cn("flex max-w-[82%] flex-col gap-1", own ? "self-end items-end" : "self-start items-start", !grouped && "mt-2")}>
                    {m.mediaId && (
                      <a href={mediaUrl(m.mediaId)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--radius-control)] border border-rule">
                        <img src={mediaUrl(m.mediaId)} alt={own ? "Foto que has enviado" : `Foto de ${otherName}`} className="max-h-72 w-auto" loading="lazy" />
                      </a>
                    )}
                    {m.body && (
                      <p className={cn("rounded-[var(--radius-control)] px-3 py-2 text-[15px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]", own ? "bg-primary text-primary-ink" : "bg-tray text-ink")}>{m.body}</p>
                    )}
                    <span className="font-narrow px-0.5 text-[12px] text-ink-3">
                      {hhmm(m.createdAt)}
                      {own && m.id === lastMineRead?.id && seen && ", visto"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {disabledReason ? <p className="border-t border-rule px-2 py-3 text-sm text-ink-2">{disabledReason}</p> : <Composer threadKey={threadKey} />}
    </div>
  );
}

function Composer({ threadKey }: { threadKey: ThreadKey }) {
  const send = useSendMessage(threadKey);
  const toast = useToast();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [text]);

  const submit = async () => {
    if (!text.trim() && !photo) return;
    try {
      setUploading(Boolean(photo));
      const mediaId = photo ? await uploadPhoto(photo.file, threadKey === "me" ? undefined : threadKey) : null;
      await send.mutateAsync({ body: text.trim(), mediaId });
      setText("");
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto(null);
      input.current?.focus();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="border-t border-rule pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {photo && (
        <div className="mb-2 flex items-center gap-2">
          <img src={photo.url} alt="Foto a punto de enviarse" className="h-16 w-16 rounded-[var(--radius-control)] object-cover" />
          <IconButton label="Quitar la foto" onClick={() => (URL.revokeObjectURL(photo.url), setPhoto(null))}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 8 * 1024 * 1024) toast("La foto pesa demasiado (máximo 8 MB)", "error");
              else setPhoto({ file: f, url: URL.createObjectURL(f) });
            }
            e.target.value = "";
          }}
        />
        <IconButton label="Adjuntar una foto" onClick={() => fileRef.current?.click()} className="size-11">
          <Camera size={20} />
        </IconButton>
        <label className="sr-only" htmlFor={`msg-${threadKey}`}>
          Escribe un mensaje
        </label>
        <textarea
          id={`msg-${threadKey}`}
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Escribe un mensaje"
          className="min-h-11 flex-1 resize-none rounded-[var(--radius-control)] border border-rule-strong bg-paper px-3 py-2.5 text-[15px] leading-snug outline-none placeholder:text-ink-3 focus:border-primary"
        />
        <Button type="submit" className="size-11 shrink-0 px-0" loading={send.isPending || uploading} disabled={!text.trim() && !photo} aria-label="Enviar" icon={<PaperPlaneRight size={20} weight="fill" className="shrink-0" />} />
      </div>
    </form>
  );
}
