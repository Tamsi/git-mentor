import type { AnalysisResult } from "@git-mentor/core";

export interface ChatReply {
  content: string;
  toolUsed?: string;
  analysis?: AnalysisResult;
}

export type ProgressCallback = (message: string) => void;
