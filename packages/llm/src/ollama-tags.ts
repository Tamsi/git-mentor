export function isCloudTag(name: string): boolean {
  return name.endsWith(":cloud") || name.endsWith("-cloud");
}

/** Map ollama.com catalog names to the tag Ollama actually runs. */
export function resolveCloudModelTag(name: string): string {
  if (name.endsWith(":cloud") || name.endsWith("-cloud")) return name;
  if (name.includes(":")) return `${name}-cloud`;
  return `${name}:cloud`;
}

export function isCloudCatalogName(name: string, cloudNames: string[]): boolean {
  const base = name.replace(/:cloud$/, "").replace(/-cloud$/, "");
  return cloudNames.includes(name) || cloudNames.includes(base);
}
