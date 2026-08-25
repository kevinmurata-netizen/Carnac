/**
 * Applies the stored theme before the page paints.
 *
 * This runs as a blocking inline script on purpose. Reading the preference in
 * React would mean the page renders light first and then snaps to dark on
 * hydration — the flash is worse than the milliseconds this costs.
 */
export const THEME_STORAGE_KEY = "carnac.theme";
export const ACCENT_STORAGE_KEY = "carnac.accent";

export const ACCENTS = [
  { key: "blue", label: "Blue", light: "oklch(0.546 0.215 262.881)", dark: "oklch(0.72 0.16 262.881)" },
  { key: "teal", label: "Teal", light: "oklch(0.58 0.12 195)", dark: "oklch(0.74 0.11 195)" },
  { key: "green", label: "Green", light: "oklch(0.56 0.15 150)", dark: "oklch(0.73 0.14 150)" },
  { key: "violet", label: "Violet", light: "oklch(0.55 0.22 300)", dark: "oklch(0.72 0.18 300)" },
  { key: "amber", label: "Amber", light: "oklch(0.62 0.16 70)", dark: "oklch(0.78 0.15 70)" },
  { key: "slate", label: "Slate", light: "oklch(0.44 0.03 260)", dark: "oklch(0.72 0.03 260)" },
] as const;

export type AccentKey = (typeof ACCENTS)[number]["key"];
export type ThemeMode = "light" | "dark" | "system";

const ACCENT_MAP = JSON.stringify(
  Object.fromEntries(ACCENTS.map((a) => [a.key, { light: a.light, dark: a.dark }]))
);

export function ThemeScript() {
  const script = `
(function () {
  try {
    var mode = localStorage.getItem('${THEME_STORAGE_KEY}') || 'system';
    var dark = mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);

    var accents = ${ACCENT_MAP};
    var accent = localStorage.getItem('${ACCENT_STORAGE_KEY}');
    if (accent && accents[accent]) {
      var value = dark ? accents[accent].dark : accents[accent].light;
      document.documentElement.style.setProperty('--primary', value);
      document.documentElement.style.setProperty('--sidebar-primary', value);
      document.documentElement.style.setProperty('--ring', value);
    }
  } catch (e) {
    // A blocked localStorage must not stop the page rendering.
  }
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
