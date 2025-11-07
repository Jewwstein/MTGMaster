import type { CSSProperties } from "react";

const FALLBACK_HEX = ["#60a5fa", "#6ee7b7", "#fcd34d", "#fb7185"] as const;

export function normalizeHexColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(prefixed) ? prefixed.toLowerCase() : null;
}

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function shadeHexColor(hex: string, percent: number): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#4b5563";
  const value = parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const adjust = (channel: number) =>
    percent >= 0 ? channel + (255 - channel) * percent : channel * (1 + percent);
  const nr = clampChannel(adjust(r));
  const ng = clampChannel(adjust(g));
  const nb = clampChannel(adjust(b));
  return `#${[nr, ng, nb]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getContrastingTextColor(hex: string): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#f9fafb";
  const value = parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 150 ? "#1c1917" : "#f9fafb";
}

export function computeCounterAppearance(
  lifeThemeHex: string | null,
  lifeThemeIndex: number,
  lifeThemeImage?: string | null,
): { baseHex: string; textColor: string; style: CSSProperties } {
  const normalizedHex = normalizeHexColor(lifeThemeHex);
  const baseHex = normalizedHex ?? FALLBACK_HEX[Math.abs(lifeThemeIndex) % FALLBACK_HEX.length];
  const textColor = getContrastingTextColor(baseHex);
  const image = typeof lifeThemeImage === "string" ? lifeThemeImage.trim() : "";
  const hasImage = image.length > 0;
  if (hasImage) {
    return {
      baseHex,
      textColor,
      style: {
        backgroundColor: baseHex,
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        borderColor: shadeHexColor(baseHex, -0.35),
        borderWidth: 1,
        borderStyle: "solid",
        boxShadow: "0 0 10px rgba(15, 23, 42, 0.55)",
      },
    };
  }
  const top = shadeHexColor(baseHex, 0.25);
  const bottom = shadeHexColor(baseHex, -0.18);
  const border = shadeHexColor(baseHex, -0.35);
  const glow = shadeHexColor(baseHex, 0.4);
  return {
    baseHex,
    textColor,
    style: {
      backgroundImage: `linear-gradient(135deg, ${top}, ${bottom})`,
      borderColor: border,
      borderWidth: 1,
      borderStyle: "solid",
      boxShadow: `0 0 6px ${glow}66`,
    },
  };
}
