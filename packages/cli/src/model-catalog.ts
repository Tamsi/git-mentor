import type { OllamaModelCatalog } from "@git-mentor/llm";
import { isCloudTag, resolveCloudModelTag } from "@git-mentor/llm";

export const SIGNIN_VALUE = "__ollama_signin__";

export interface ModelPickerItem {
  label: string;
  value: string;
  hint?: string;
}

export function buildModelPickerItems(
  catalog: OllamaModelCatalog,
  signedIn: boolean,
): ModelPickerItem[] {
  const items: ModelPickerItem[] = [];
  const seen = new Set<string>();

  const add = (item: ModelPickerItem) => {
    if (seen.has(item.value)) return;
    seen.add(item.value);
    items.push(item);
  };

  if (!signedIn && catalog.cloud.length > 0) {
    add({
      label: "Sign in to Ollama (cloud models)",
      value: SIGNIN_VALUE,
      hint: "auth",
    });
  }

  for (const name of catalog.local) {
    add({
      label: name,
      value: name,
      hint: isCloudTag(name) ? "cloud" : "local",
    });
  }
  for (const name of catalog.cloud) {
    add({ label: name, value: resolveCloudModelTag(name), hint: "cloud" });
  }

  return items;
}

export function formatPickerLabel(item: ModelPickerItem): string {
  const hint = item.hint ? ` (${item.hint})` : "";
  return `${item.label}${hint}`;
}
