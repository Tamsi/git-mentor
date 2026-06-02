import chalk from "chalk";
import { colors, LOGO } from "./colors.js";

export { LOGO } from "./colors.js";

const noColor = Boolean(process.env.NO_COLOR);

function paint(hex: string, text: string): string {
  if (noColor) return text;
  return chalk.hex(hex)(text);
}

/** Chalk helpers for non-Ink CLI output (doctor, init, analyze). */
export const theme = {
  brand: (text: string) => paint(colors.brand, text),
  brandBold: (text: string) => (noColor ? text : chalk.hex(colors.brand).bold(text)),
  muted: (text: string) => paint(colors.muted, text),
  border: (text: string) => paint(colors.border, text),
  success: (text: string) => paint(colors.success, text),
  bold: (text: string) => (noColor ? text : chalk.bold(text)),
  prompt: () => theme.brandBold("> "),
};
