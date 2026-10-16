/// <reference types="node" />
import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

test("system dark theme overrides every color token and sets native control schemes", () => {
  const [light, dark] = css.split("@media (prefers-color-scheme: dark)");
  expect(light).toContain("color-scheme: light");
  expect(dark).toContain("color-scheme: dark");
  const colors = (source: string) =>
    [...source.matchAll(/--([\w-]+): oklch\(([^)]+)\)/g)].map((match) => [match[1], match[2]]);
  const lightColors = Object.fromEntries(colors(light));
  const darkColors = Object.fromEntries(colors(dark));
  expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());

  // Achromatic OKLCH colors have relative luminance L³.
  for (const theme of [lightColors, darkColors]) {
    const contrast = (a: string, b: string) => {
      const luminances = [a, b].map((token) => Number(theme[token].split(" ")[0]) ** 3);
      return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
    };
    for (const surface of ["background", "card", "popover", "secondary", "muted", "accent"]) {
      expect(contrast("muted-foreground", surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("ring", surface)).toBeGreaterThanOrEqual(3);
    }
    for (const surface of ["card", "popover", "primary", "secondary", "accent"]) {
      expect(contrast(`${surface}-foreground`, surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast("input", "background")).toBeGreaterThanOrEqual(3);
  }
});
