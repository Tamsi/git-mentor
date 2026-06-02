import type { GitMentorConfig } from "@git-mentor/core";
import {
  runModelPickerInk,
  runOllamaSignInInk,
  type ModelPickerResult,
} from "./ink/ModelSelectView.js";

export type { ModelPickerResult };

export async function runModelPicker(config: GitMentorConfig): Promise<ModelPickerResult> {
  return runModelPickerInk(config);
}

export async function runOllamaSignIn(_config: GitMentorConfig): Promise<ModelPickerResult> {
  return runOllamaSignInInk();
}
