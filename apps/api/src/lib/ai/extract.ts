import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type DocKind = "pdf" | "docx" | "text";

/** Tipo por los bytes (y la extensión solo para distinguir texto plano). */
export function sniffDoc(buf: Buffer, filename: string): DocKind | null {
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b && /\.docx$/i.test(filename)) return "docx";
  if (/\.(txt|md)$/i.test(filename) && !buf.subarray(0, 4096).includes(0)) return "text";
  return null;
}

/**
 * Suma de tamaños descomprimidos de un ZIP según su directorio central (sin descomprimir nada). Un .docx «bomba»
 * declara gigas; se rechaza antes de abrirlo. Devuelve null si el ZIP no se puede leer.
 */
export function zipUncompressedSize(buf: Buffer): { total: number; entries: number } | null {
  const min = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    total += buf.readUInt32LE(p + 24);
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return { total, entries };
}

export const MAX_DOCX_UNCOMPRESSED = 60 * 1024 * 1024;

export async function extractDocText(buf: Buffer, kind: DocKind): Promise<string> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }
  if (kind === "docx") {
    const z = zipUncompressedSize(buf);
    if (!z || z.total > MAX_DOCX_UNCOMPRESSED || z.entries > 2000) throw new Error("docx demasiado grande o dañado");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  return buf.toString("utf8");
}
