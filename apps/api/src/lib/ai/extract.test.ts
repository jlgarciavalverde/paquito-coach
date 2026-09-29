import { describe, expect, it } from "vitest";
import { extractDocText, sniffDoc } from "./extract";

/** PDF mínimo válido con una línea de texto (offsets de la tabla xref calculados). */
function tinyPdf(text: string) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

describe("extracción de texto", () => {
  it("lee un PDF con texto", async () => {
    const buf = tinyPdf("Fase 2: trote suave");
    expect(sniffDoc(buf, "x.pdf")).toBe("pdf");
    expect(await extractDocText(buf, "pdf")).toContain("Fase 2: trote suave");
  });
  it("reconoce texto plano solo por extensión y sin bytes nulos", () => {
    expect(sniffDoc(Buffer.from("hola"), "notas.md")).toBe("text");
    expect(sniffDoc(Buffer.from([0, 1, 2]), "x.txt")).toBeNull();
    expect(sniffDoc(Buffer.from("PK\x03\x04"), "x.zip")).toBeNull();
  });
});
