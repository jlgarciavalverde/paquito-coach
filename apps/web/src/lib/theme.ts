export type ThemePref = "system" | "light" | "dark";
const KEY = "coach_theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setThemePref(p: ThemePref) {
  try {
    if (p === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {
    /* sin almacenamiento: solo esta sesión */
  }
  applyTheme(p);
}

function applyTheme(p: ThemePref) {
  const el = document.documentElement;
  if (p === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", p);
}

export const applyStoredTheme = () => applyTheme(getThemePref());
