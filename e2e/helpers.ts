import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "una-contraseña-larga";

/** Sin infracciones WCAG 2.1 A/AA en la página actual. */
export async function expectAccessible(page: Page, label: string) {
  // Las entradas animadas (opacidad) falsean el contraste mientras duran.
  await page.waitForTimeout(450);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = r.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${v.id === "color-contrast" ? n.any[0]?.message.split(".")[0] : ""}`).slice(0, 3).join(" | ")}`,
  );
  expect(summary, `axe en ${label}`).toEqual([]);
}
