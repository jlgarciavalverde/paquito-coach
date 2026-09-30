import { useEffect, useState } from "react";

/**
 * URL de vista previa de un archivo que se libera al cambiarlo o al salir. `URL.createObjectURL` dentro del render creaba
 * una URL nueva en cada pintado y ninguna se liberaba: con varias fotos de móvil (4–8 MB cada una) se llenaba la memoria.
 */
export function useObjectUrl(file: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/** Miniatura de un archivo local (usa `useObjectUrl`). */
export function FilePreview({ file, className }: { file: Blob; className?: string }) {
  const url = useObjectUrl(file);
  return url ? <img src={url} alt="" className={className} /> : null;
}
