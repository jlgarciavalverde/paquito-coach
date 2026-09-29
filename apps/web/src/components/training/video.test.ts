import { describe, expect, it } from "vitest";
import { embedUrl } from "./video";

describe("embedUrl", () => {
  it("YouTube (corto, largo y shorts) y Vimeo", () => {
    expect(embedUrl("https://youtu.be/abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
    expect(embedUrl("https://www.youtube.com/watch?v=xyz&t=3")).toBe("https://www.youtube-nocookie.com/embed/xyz");
    expect(embedUrl("https://youtube.com/shorts/sh1")).toBe("https://www.youtube-nocookie.com/embed/sh1");
    expect(embedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
  });
  it("rechaza otros orígenes", () => expect(embedUrl("https://evil.example/x")).toBeNull());
});
