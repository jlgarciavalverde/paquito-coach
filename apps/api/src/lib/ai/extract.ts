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

export async function extractDocText(buf: Buffer, kind: DocKind): Promise<string> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }
  if (kind === "docx") return (await mammoth.extractRawText({ buffer: buf })).value;
  return buf.toString("utf8");
}
