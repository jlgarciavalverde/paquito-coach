/** Un ejercicio de la biblioteca, lo justo para emparejar nombres. */
export type LibraryExercise = { id: string; name: string; aliases: string[]; own: boolean };

const words = (s: string) => s.toLowerCase().replace(/[()«»"]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/**
 * Empareja los nombres de ejercicio que propone la IA con la biblioteca, en memoria (antes, una consulta por nombre y por
 * cada recorte de palabras: cientos por rutina). Prueba el nombre entero y va quitando palabras del final hasta dos; entre los
 * que contienen el texto, gana: los propios del estudio, luego coincidencia en el nombre (no en un alias), el nombre más corto
 * y el orden alfabético.
 */
export function exerciseMatcher(library: LibraryExercise[]) {
  const rows = library.map((e) => ({ e, name: e.name.toLowerCase(), aliases: e.aliases.join(" ").toLowerCase() }));
  return (raw: string): { id: string; name: string } | null => {
    const w = words(raw);
    if (w.length === 0) return null;
    for (let n = w.length; n >= Math.min(2, w.length); n--) {
      const q = w.slice(0, n).join(" ");
      let best: (typeof rows)[number] | null = null;
      let bestKey: [number, number, number, string] | null = null;
      for (const r of rows) {
        const inName = r.name.includes(q);
        if (!inName && !r.aliases.includes(q)) continue;
        const key: [number, number, number, string] = [r.e.own ? 0 : 1, inName ? 0 : 1, r.name.length, r.e.name];
        if (!bestKey || compare(key, bestKey) < 0) (best = r), (bestKey = key);
      }
      if (best) return { id: best.e.id, name: best.e.name };
    }
    return null;
  };
}

function compare(a: [number, number, number, string], b: [number, number, number, string]) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3].localeCompare(b[3], "es");
}
