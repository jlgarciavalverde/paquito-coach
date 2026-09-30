// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Button, IconButton } from "./button";
import { useConfirm } from "./confirm";
import { useToast, useUndoToast } from "./toast";
import { QueryState } from "./query-state";
import { DecimalField, parseDecimal } from "./field";
import { RadioGroup } from "./radio-group";
import { renderWithProviders } from "../../test/render";
import { OfflineBanner } from "../offline-banner";

describe("Button", () => {
  it("cargando: deshabilitado y sin segundo clic (evita dobles envíos)", async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );
    const b = screen.getByRole("button", { name: /Guardar/ });
    expect(b).toBeDisabled();
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("por defecto no envía formularios (type=button)", () => {
    renderWithProviders(<Button>Acción</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
  it("IconButton siempre tiene nombre accesible", () => {
    renderWithProviders(<IconButton label="Borrar fila">x</IconButton>);
    expect(screen.getByRole("button", { name: "Borrar fila" })).toBeInTheDocument();
  });
});

function AskDemo() {
  const ask = useConfirm();
  const [r, setR] = useState("nada");
  return (
    <>
      <button onClick={async () => setR(String(await ask({ title: "Borrar la rutina", confirm: "Borrar", danger: true })))}>preguntar</button>
      <p>resultado: {r}</p>
    </>
  );
}

describe("useConfirm (sustituye a confirm())", () => {
  it("confirmar → true", async () => {
    renderWithProviders(<AskDemo />);
    await userEvent.click(screen.getByText("preguntar"));
    expect(await screen.findByRole("dialog", { name: "Borrar la rutina" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(await screen.findByText("resultado: true")).toBeInTheDocument();
  });
  it("cancelar o Escape → false", async () => {
    renderWithProviders(<AskDemo />);
    await userEvent.click(screen.getByText("preguntar"));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("resultado: false")).toBeInTheDocument();
    await userEvent.click(screen.getByText("preguntar"));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText("resultado: false")).toBeInTheDocument();
  });
  it("la acción peligrosa tiene el foco para confirmarse con Intro", async () => {
    renderWithProviders(<AskDemo />);
    await userEvent.click(screen.getByText("preguntar"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Borrar" })).toHaveFocus());
  });
});

function ToastDemo({ onUndo }: { onUndo: () => void }) {
  const undo = useUndoToast();
  const toast = useToast();
  return (
    <>
      <button onClick={() => undo("Bloque quitado", onUndo)}>quitar</button>
      <button onClick={() => toast("No se ha podido", "error")}>fallar</button>
    </>
  );
}

describe("avisos", () => {
  it("«Deshacer» ejecuta la vuelta atrás y desaparece", async () => {
    const onUndo = vi.fn();
    renderWithProviders(<ToastDemo onUndo={onUndo} />);
    await userEvent.click(screen.getByText("quitar"));
    await userEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("Bloque quitado")).not.toBeInTheDocument());
  });
  it("los errores se anuncian al momento (alert), los demás sin interrumpir (status), y se van solos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<ToastDemo onUndo={() => {}} />);
    await userEvent.click(screen.getByText("fallar"));
    expect(screen.getByRole("alert")).toHaveTextContent("No se ha podido");
    expect(screen.getByRole("status")).not.toHaveTextContent("No se ha podido");
    await userEvent.click(screen.getByText("quitar"));
    expect(screen.getByRole("status")).toHaveTextContent("Bloque quitado");
    await act(async () => void vi.advanceTimersByTime(4500));
    await waitFor(() => expect(screen.queryByText("No se ha podido")).not.toBeInTheDocument());
    vi.useRealTimers();
  });
});

describe("sin conexión", () => {
  it("aparece al perder la red y se va al volver", async () => {
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });
});

describe("QueryState", () => {
  const q = (over: object) => ({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...over });
  it("cargando: esqueleto; con datos: el contenido", () => {
    const { rerender } = renderWithProviders(<QueryState q={q({ isPending: true })}>{() => <p>datos</p>}</QueryState>);
    expect(screen.queryByText("datos")).not.toBeInTheDocument();
    rerender(<QueryState q={q({ data: ["a"] })}>{(d: string[]) => <p>datos {d.length}</p>}</QueryState>);
    expect(screen.getByText("datos 1")).toBeInTheDocument();
  });
  it("si falla: el motivo y «Reintentar» (antes, un vacío falso)", async () => {
    const refetch = vi.fn();
    renderWithProviders(<QueryState q={q({ isError: true, error: new Error("No hay conexión con el servidor."), refetch })}>{() => <p>No tienes plan</p>}</QueryState>);
    expect(screen.getByText("No hay conexión con el servidor.").closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText("No tienes plan")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("DecimalField", () => {
  it("deja escribir decimales con coma (antes «72,» volvía a «72») y avisa del número", async () => {
    const onValue = vi.fn();
    function Demo() {
      const [v, setV] = useState<number | null>(null);
      return <DecimalField label="Peso" value={v} onValue={(n) => (setV(n), onValue(n))} />;
    }
    renderWithProviders(<Demo />);
    const input = screen.getByLabelText("Peso");
    await userEvent.type(input, "72,5");
    expect(input).toHaveValue("72,5");
    expect(onValue).toHaveBeenLastCalledWith(72.5);
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
    await userEvent.type(input, "abc");
    expect(input).toHaveValue("abc");
    expect(onValue).toHaveBeenLastCalledWith(null); // lo que no es número no se manda
  });
  it("parseDecimal", () => {
    expect([parseDecimal("72,5"), parseDecimal("72,"), parseDecimal(" "), parseDecimal("7a"), parseDecimal(",5")]).toEqual([72.5, 72, null, undefined, 0.5]);
  });
});

describe("RadioGroup", () => {
  function Demo() {
    const [v, setV] = useState("semana");
    return (
      <>
        <button>antes</button>
        <RadioGroup aria-label="Vista">
          {["semana", "mes", "lista"].map((k) => (
            <button key={k} type="button" role="radio" aria-checked={v === k} onClick={() => setV(k)}>
              {k}
            </button>
          ))}
        </RadioGroup>
        <button>después</button>
      </>
    );
  }
  it("una sola parada con Tab (la elegida) y flechas para moverse y elegir", async () => {
    renderWithProviders(<Demo />);
    await userEvent.click(screen.getByText("antes"));
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "semana" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "mes" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "mes" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}"); // da la vuelta
    expect(screen.getByRole("radio", { name: "lista" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "semana" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText("después")).toHaveFocus(); // no pasa por las otras opciones
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("radio", { name: "semana" })).toHaveFocus();
  });
});
