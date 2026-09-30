import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError, api, errorMessage, fallbackMessage, onApiError } from "./api";

const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));
afterEach(() => vi.unstubAllGlobals());

describe("cliente de la API", () => {
  it("devuelve el JSON y manda JSON con la cookie del mismo origen", async () => {
    const f = respond(JSON.stringify({ ok: true }));
    vi.stubGlobal("fetch", f);
    expect(await api("/x", { body: { a: 1 } })).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/x");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe('{"a":1}');
  });

  it("usa el mensaje en español de la API", async () => {
    vi.stubGlobal("fetch", respond(JSON.stringify({ error: "email_taken", message: "Ese correo ya tiene cuenta" }), 409));
    await expect(api("/x")).rejects.toMatchObject({ status: 409, code: "email_taken", message: "Ese correo ya tiene cuenta" });
  });

  it("sin conexión: mensaje claro, no el error técnico", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api("/x")).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("página de error HTML de un proxy (502): mensaje comprensible, sin «Unexpected token <»", async () => {
    vi.stubGlobal("fetch", respond("<html><body>Bad gateway</body></html>", 502));
    const e = (await api("/x").catch((x: unknown) => x)) as RequestError;
    expect(e).toBeInstanceOf(RequestError);
    expect(e.message).toBe(fallbackMessage(502));
    expect(e.message).not.toMatch(/token/i);
  });

  it("respuesta 200 que no es JSON: error propio", async () => {
    vi.stubGlobal("fetch", respond("<html>", 200));
    await expect(api("/x")).rejects.toMatchObject({ code: "bad_response" });
  });

  it("respuesta vacía (204): undefined", async () => {
    vi.stubGlobal("fetch", respond("", 200));
    expect(await api("/x")).toBeUndefined();
  });

  it("tarda demasiado: 408 con mensaje", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("abort", "AbortError"))))));
    await expect(api("/x", { timeoutMs: 20 })).rejects.toMatchObject({ status: 408, code: "timeout" });
  });

  it("cancelado a propósito: se propaga la cancelación (no es un error para el usuario)", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("abort", "AbortError"))))));
    const c = new AbortController();
    const p = api("/x", { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("avisa a los oyentes de los errores (p. ej. sesión caducada) y se puede dejar de escuchar", async () => {
    vi.stubGlobal("fetch", respond(JSON.stringify({ error: "unauthorized", message: "Inicia sesión" }), 401));
    const seen: number[] = [];
    const off = onApiError((e) => seen.push(e.status));
    await api("/x").catch(() => {});
    off();
    await api("/x").catch(() => {});
    expect(seen).toEqual([401]);
  });

  it("errorMessage siempre da un texto", () => {
    expect(errorMessage(new Error("hola"))).toBe("hola");
    expect(errorMessage("raro")).toMatch(/Algo ha fallado/);
    expect(errorMessage(new Error(""))).toMatch(/Algo ha fallado/);
    for (const s of [401, 403, 404, 408, 413, 429, 500, 502, 503, 504]) expect(fallbackMessage(s).length).toBeGreaterThan(10);
  });
});
