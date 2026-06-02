import React from "react";
import { Text } from "ink";
import { colors } from "../ui/colors.js";

type Segment = { text: string; bold?: boolean; code?: boolean };

function parseSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      segments.push({ text: line.slice(last, match.index) });
    }
    const token = match[0]!;
    if (token.startsWith("**")) {
      segments.push({ text: token.slice(2, -2), bold: true });
    } else {
      segments.push({ text: token.slice(1, -1), code: true });
    }
    last = match.index + token.length;
  }

  if (last < line.length) {
    segments.push({ text: line.slice(last) });
  }

  return segments.length > 0 ? segments : [{ text: line }];
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <Text wrap="wrap">
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 ? "\n" : null}
          {parseSegments(line).map((segment, segmentIndex) => (
            <Text
              key={segmentIndex}
              bold={segment.bold}
              color={segment.code ? colors.muted : undefined}
            >
              {segment.code ? `\`${segment.text}\`` : segment.text}
            </Text>
          ))}
        </React.Fragment>
      ))}
    </Text>
  );
}
