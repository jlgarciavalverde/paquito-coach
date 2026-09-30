// @vitest-environment jsdom
import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useShortcuts } from "./shortcuts";

function Host(h: Parameters<typeof useShortcuts>[0]) {
  useShortcuts(h);
  return (
    <>
      <input aria-label="campo" />
      <div role="dialog">
        <button>dentro</button>
      </div>
    </>
  );
}
const handlers = () => ({ palette: vi.fn(), go: vi.fn(() => true), create: vi.fn(), help: vi.fn() });
const key = (k: string, o: KeyboardEventInit = {}, target: Element | Window = window) => fireEvent.keyDown(target, { key: k, ...o });

describe("atajos de teclado", () => {
  it("⌘K y Ctrl K abren la paleta, también desde un campo de texto", () => {
    const h = handlers();
    const { getByLabelText } = render(<Host {...h} />);
    key("k", { metaKey: true });
    key("k", { ctrlKey: true }, getByLabelText("campo"));
    expect(h.palette).toHaveBeenCalledTimes(2);
  });
  it("«g» y otra tecla navegan; «n» crea; «?» ayuda; «/» busca", () => {
    const h = handlers();
    render(<Host {...h} />);
    key("g");
    key("c");
    expect(h.go).toHaveBeenCalledWith("c");
    key("n");
    key("?");
    key("/");
    expect(h.create).toHaveBeenCalled();
    expect(h.help).toHaveBeenCalled();
    expect(h.palette).toHaveBeenCalled();
  });
  it("mientras se escribe o con un diálogo abierto, las letras son letras", () => {
    const h = handlers();
    const { getByLabelText, getByText } = render(<Host {...h} />);
    key("n", {}, getByLabelText("campo"));
    key("g", {}, getByText("dentro"));
    key("c", {}, getByText("dentro"));
    expect(h.create).not.toHaveBeenCalled();
    expect(h.go).not.toHaveBeenCalled();
  });
  it("«g» caduca al segundo: una «c» suelta después no navega", () => {
    vi.useFakeTimers();
    const h = handlers();
    render(<Host {...h} />);
    key("g");
    vi.advanceTimersByTime(1500);
    key("c");
    expect(h.go).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("con Alt o con Ctrl (atajos del navegador) no se hace nada", () => {
    const h = handlers();
    render(<Host {...h} />);
    key("n", { altKey: true });
    key("n", { ctrlKey: true });
    expect(h.create).not.toHaveBeenCalled();
  });
});
