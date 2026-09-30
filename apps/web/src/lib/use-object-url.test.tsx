// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { FilePreview } from "./use-object-url";

afterEach(() => vi.restoreAllMocks());

describe("useObjectUrl", () => {
  it("una URL por archivo, liberada al cambiar de archivo y al desmontar (no una por pintado)", () => {
    let n = 0;
    const created = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++n}`);
    const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const a = new Blob(["a"]);
    const b = new Blob(["b"]);
    const { rerender, unmount, container } = render(<FilePreview file={a} />);
    rerender(<FilePreview file={a} />);
    rerender(<FilePreview file={a} />);
    expect(created).toHaveBeenCalledTimes(1);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:1");
    rerender(<FilePreview file={b} />);
    expect(revoked).toHaveBeenCalledWith("blob:1");
    unmount();
    expect(revoked).toHaveBeenCalledWith("blob:2");
  });
});
