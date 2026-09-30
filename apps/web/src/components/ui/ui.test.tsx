// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Button, IconButton } from "./button";
import { useConfirm } from "./confirm";
import { useToast, useUndoToast } from "./toast";
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
  it("se anuncian a lectores de pantalla y se van solos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<ToastDemo onUndo={() => {}} />);
    await userEvent.click(screen.getByText("fallar"));
    expect(screen.getByRole("status")).toHaveTextContent("No se ha podido");
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
