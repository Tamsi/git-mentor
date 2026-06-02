import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

export const APP_NAME = "git-mentor";

export const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
  APP_NAME,
);
export const DATA_DIR = path.join(
  process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
  APP_NAME,
);
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.yaml");
export const CACHE_DIR = path.join(DATA_DIR, "cache");
export const REPORTS_DIR = path.join(DATA_DIR, "reports");

const LLMConfigSchema = z.object({
  provider: z.string().default("ollama"),
  model: z.string().default("qwen3:8b"),
  baseUrl: z.string().default("http://localhost:11434"),
  apiKey: z.string().optional(),
  temperature: z.number().default(0.2),
  maxTokens: z.number().default(4096),
});

const GitHubConfigSchema = z.object({
  token: z.string().optional(),
  useGhCli: z.boolean().default(true),
});

export const GitMentorConfigSchema = z.object({
  llm: LLMConfigSchema.default({}),
  github: GitHubConfigSchema.default({}),
  defaultRole: z.string().default("ai-engineer"),
  cacheTtlHours: z.number().default(24),
});

export type GitMentorConfig = z.infer<typeof GitMentorConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export function ensureDirs(): void {
  for (const dir of [CONFIG_DIR, DATA_DIR, CACHE_DIR, REPORTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): GitMentorConfig {
  ensureDirs();
  let config = GitMentorConfigSchema.parse({});

  if (fs.existsSync(CONFIG_FILE)) {
    const raw = YAML.parse(fs.readFileSync(CONFIG_FILE, "utf8")) ?? {};
    config = GitMentorConfigSchema.parse(raw);
  }

  if (process.env.GIT_MENTOR_GITHUB_TOKEN) {
    config.github.token = process.env.GIT_MENTOR_GITHUB_TOKEN;
  }
  if (process.env.GIT_MENTOR_LLM_PROVIDER) {
    config.llm.provider = process.env.GIT_MENTOR_LLM_PROVIDER;
  }
  if (process.env.GIT_MENTOR_LLM_MODEL) {
    config.llm.model = process.env.GIT_MENTOR_LLM_MODEL;
  }
  if (process.env.GIT_MENTOR_LLM_BASE_URL) {
    config.llm.baseUrl = process.env.GIT_MENTOR_LLM_BASE_URL;
  }
  if (process.env.GIT_MENTOR_LLM_API_KEY) {
    config.llm.apiKey = process.env.GIT_MENTOR_LLM_API_KEY;
  }

  return config;
}

export function saveConfig(config: GitMentorConfig): void {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, YAML.stringify(config));
}
