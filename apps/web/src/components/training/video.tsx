/** Convierte un enlace de YouTube/Vimeo en su reproductor sin cookies (el CSP solo permite estos dos orígenes). */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.match(/\/(shorts|embed)\/([^/]+)/)?.[2];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (u.hostname.endsWith("vimeo.com")) {
      const id = u.pathname.match(/\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const src = embedUrl(url);
  if (!src) return null;
  return (
    <div className="aspect-video overflow-hidden rounded-[var(--radius-control)] bg-tray-2">
      <iframe src={src} title={`Vídeo: ${title}`} className="size-full" allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  );
}
