export type PromptHistoryState = {
  entries: string[];
  index: number | null;
  draft: string;
};

export function createPromptHistoryState(): PromptHistoryState {
  return { entries: [], index: null, draft: "" };
}

export function recordPromptSubmission(state: PromptHistoryState, line: string): PromptHistoryState {
  const trimmed = line.trim();
  if (!trimmed) {
    return { ...state, index: null, draft: "" };
  }

  const entries = [...state.entries];
  if (entries[entries.length - 1] !== trimmed) {
    entries.push(trimmed);
  }

  return { entries, index: null, draft: "" };
}

export function navigatePromptHistory(
  state: PromptHistoryState,
  currentInput: string,
  direction: "up" | "down",
): { state: PromptHistoryState; input: string } {
  if (state.entries.length === 0) {
    return { state, input: currentInput };
  }

  if (direction === "up") {
    if (state.index === null) {
      const next: PromptHistoryState = {
        ...state,
        index: state.entries.length - 1,
        draft: currentInput,
      };
      return { state: next, input: state.entries[state.entries.length - 1]! };
    }

    if (state.index > 0) {
      const nextIndex = state.index - 1;
      const next: PromptHistoryState = { ...state, index: nextIndex };
      return { state: next, input: state.entries[nextIndex]! };
    }

    return { state, input: currentInput };
  }

  if (state.index === null) {
    return { state, input: currentInput };
  }

  if (state.index < state.entries.length - 1) {
    const nextIndex = state.index + 1;
    const next: PromptHistoryState = { ...state, index: nextIndex };
    return { state: next, input: state.entries[nextIndex]! };
  }

  return {
    state: { ...state, index: null },
    input: state.draft,
  };
}

export function clearPromptHistoryDraft(state: PromptHistoryState, value: string): PromptHistoryState {
  if (state.index !== null) {
    return { ...state, index: null, draft: value };
  }
  return state;
}
