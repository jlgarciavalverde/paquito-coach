import { describe, expect, it } from "vitest";
import { gate } from "./access";

describe("acceso denegado por defecto", () => {
  const coach = { role: "coach" as const };
  const client = { role: "client" as const };
  it("sin sesión: solo lo público", () => {
    expect(gate("POST", "/api/v1/auth/login", null)).toBe("public");
    expect(gate("GET", "/api/v1/clients", null)).toBe("login");
    expect(gate("GET", "/api/v1/me", null)).toBe("login");
  });
  it("cliente: lo suyo y la lista; lo demás, del entrenador", () => {
    expect(gate("GET", "/api/v1/me/workouts", client)).toBe("ok");
    expect(gate("PUT", "/api/v1/workouts/:id/log", client)).toBe("ok");
    expect(gate("PATCH", "/api/v1/workouts/:id", client)).toBe("coach-only");
    expect(gate("GET", "/api/v1/clients", client)).toBe("coach-only");
    expect(gate("GET", "/api/v1/mentira", client)).toBe("coach-only");
  });
  it("entrenador: todo lo que pida permiso por dentro; estáticos y 404 no pasan por aquí", () => {
    expect(gate("GET", "/api/v1/clients", coach)).toBe("ok");
    expect(gate("GET", undefined, null)).toBe("ok");
    expect(gate("GET", "/coach", null)).toBe("ok");
  });
});
