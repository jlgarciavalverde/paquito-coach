// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment, RoutineBlock } from "@coach/shared";
import { mockFetch, renderWithProviders } from "../test/render";
import { AttendanceControl, QuickDone } from "./agenda/attendance";
import { PrescriptionList, logDiff } from "./training/prescription";

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: "a1", status: "scheduled", packId: null, clientId: "c1", clientName: "Lucía", kind: "session", title: "",
  startsAt: "2026-10-01T08:00:00.000Z", endsAt: "2026-10-01T09:00:00.000Z", location: "", notes: "", ...over,
});

describe("asistencia a una cita", () => {
  it("marca «Hecha» al momento (optimista) y avisa si descuenta del bono", async () => {
    const m = mockFetch({ "/attendance": () => ({ body: appt({ status: "done", packId: "p1" }) }) });
    vi.stubGlobal("fetch", m.fn);
    renderWithProviders(<AttendanceControl appointment={appt()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Hecha" }));
    expect(screen.getByRole("radio", { name: "Hecha" })).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("Hecha: descontada del bono")).toBeInTheDocument();
    expect(JSON.parse(String(m.calls[0]!.init!.body))).toEqual({ status: "done" });
  });

  it("si el servidor falla, vuelve al estado anterior y lo dice", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/attendance": () => ({ status: 500, body: { error: "internal", message: "Algo ha fallado en el servidor" } }) }).fn);
    renderWithProviders(<AttendanceControl appointment={appt()} />);
    await userEvent.click(screen.getByRole("radio", { name: "No vino" }));
    expect(await screen.findByText("Algo ha fallado en el servidor")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Programada" })).toHaveAttribute("aria-checked", "true"));
  });

  it("botón rápido: sin cliente o cancelada no aparece; hecha se puede deshacer", () => {
    const { rerender } = renderWithProviders(<QuickDone appointment={appt({ clientId: null })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<QuickDone appointment={appt({ status: "cancelled" })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<QuickDone appointment={appt({ status: "done" })} />);
    expect(screen.getByRole("button", { name: "Hecha. Deshacer" })).toBeInTheDocument();
  });
});

const item = (over: Partial<RoutineBlock["items"][number]> = {}) => ({
  id: "i1", exerciseId: "e", exerciseName: "Sentadilla", sets: 3, reps: "5", load: "80 kg", effort: "", tempo: "", restSec: null, notes: "", group: null, ...over,
});
describe("prescrito frente a hecho", () => {
  it("diferencias en palabras: más carga, menos carga, series que faltan", () => {
    expect(logDiff(item(), [])).toBeNull();
    expect(logDiff(item(), [{ reps: "5", load: "82,5", done: true }, { reps: "5", load: "80", done: true }, { reps: "5", load: "80", done: true }])).toEqual([{ text: "+2,5 kg sobre lo previsto", tone: "up" }]);
    expect(logDiff(item(), [{ reps: "5", load: "75", done: true }, { reps: "", load: "", done: false }])).toEqual([
      { text: "2 series menos", tone: "down" },
      { text: "−5 kg bajo lo previsto", tone: "down" },
    ]);
    expect(logDiff(item({ load: "70 % 1RM" }), [{ reps: "5", load: "90", done: true }, { reps: "5", load: "90", done: true }, { reps: "5", load: "90", done: true }])).toEqual([]);
  });
  it("la lista enseña el registro del cliente y la diferencia", () => {
    renderWithProviders(<PrescriptionList blocks={[{ id: "b", name: "Fuerza", items: [item()] }]} log={{ i1: [{ reps: "5", load: "85", rpe: 8, done: true }] }} />);
    expect(screen.getByText("Sentadilla")).toBeInTheDocument();
    expect(screen.getByText("2 series menos")).toBeInTheDocument();
    expect(screen.getByText("+5 kg sobre lo previsto")).toBeInTheDocument();
  });
  it("sin ejercicios: mensaje en vez de una lista vacía", () => {
    renderWithProviders(<PrescriptionList blocks={[{ id: "b", name: "", items: [] }]} />);
    expect(screen.getByText("Este entreno no tiene ejercicios.")).toBeInTheDocument();
  });
});

// ── Paleta ⌘K ──
const navigate = vi.fn();
const actions = { newClient: vi.fn(), assign: vi.fn(), newAppointment: vi.fn(), measure: vi.fn(), write: vi.fn(), applyProgram: vi.fn(), generate: vi.fn() };
vi.mock("@tanstack/react-router", async (orig) => ({ ...(await orig<object>()), useNavigate: () => navigate }));
vi.mock("./coach-actions", () => ({ useCoachActions: () => actions }));
const { CommandPalette, norm } = await import("./command-palette");

describe("paleta de órdenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/clients": () => ({ body: [{ id: "c1", name: "Lucía Martínez", status: "active", email: "l@x.es", tags: ["mañanas"] }, { id: "c2", name: "Pepe Gómez", status: "archived", email: null, tags: [] }] }),
        "/routines": () => ({ body: [{ id: "r1", name: "Pierna A", exerciseCount: 4 }] }),
        "/meal-plans": () => ({ body: [] }),
      }).fn,
    );
  });

  it("busca sin tildes ni mayúsculas", () => {
    expect(norm("LUCÍA Martínez")).toBe("lucia martinez");
  });

  it("al escribir un cliente salen sus acciones; flechas + Intro ejecutan la elegida", async () => {
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "lucia");
    expect(await screen.findByRole("option", { name: /Escribir a Lucía/ })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(actions.write).toHaveBeenCalledWith("c1");
  });

  it("los archivados no salen; por etiqueta sí se encuentra", async () => {
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "pepe");
    expect(await screen.findByText(/Nada con «pepe»/)).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "mananas");
    expect(await screen.findByRole("option", { name: /Lucía Martínez/ })).toBeInTheDocument();
  });

  it("una sola rutina encontrada ofrece asignarla", async () => {
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "pierna");
    await userEvent.click(await screen.findByRole("option", { name: "Asignar «Pierna A»" }));
    expect(actions.assign).toHaveBeenCalledWith({ routineId: "r1" });
  });

  it("combobox accesible: la opción activa se anuncia", async () => {
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />);
    const box = screen.getByRole("combobox");
    await waitFor(() => expect(box.getAttribute("aria-activedescendant")).toBeTruthy());
    const active = document.getElementById(box.getAttribute("aria-activedescendant")!);
    expect(active).toHaveAttribute("aria-selected", "true");
  });
});
