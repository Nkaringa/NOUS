// Smart heading parser. Handles:
//  (1) markdown headers (# / ## / ###) — header = heading, following text = body
//  (2) multi-line plain text — one heading per line
//  (3) single-line with commas/semicolons — split into list, IGNORING separators
//      inside parens, brackets, braces, or quotes (so "SQL joins (INNER, LEFT,
//      RIGHT, FULL OUTER)" stays as one heading)
//  (4) single-line otherwise — treat as one heading

export type ParsedHeading = { heading: string; body: string | null };

const MAX_HEADING_LEN = 500;

export function parseHeadings(input: string): ParsedHeading[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // (1) Markdown headers
  if (/^#{1,3}\s+/m.test(trimmed)) {
    return parseMarkdownHeaders(trimmed);
  }

  // (2) Multi-line
  if (/\r?\n/.test(trimmed)) {
    return splitLines(trimmed);
  }

  // (3) Single-line with separators that look like a list of topics
  if (/[,;]/.test(trimmed)) {
    const parts = smartSplit(trimmed);

    const looksLikeList =
      parts.length >= 2 &&
      parts.every((p) => p.length <= 100) &&
      parts.reduce((s, p) => s + p.length, 0) / parts.length <= 70;

    if (looksLikeList) {
      return parts.map((heading) => ({
        heading: heading.slice(0, MAX_HEADING_LEN),
        body: null,
      }));
    }
  }

  // (4) Fallback: single heading
  return [{ heading: trimmed.slice(0, MAX_HEADING_LEN), body: null }];
}

/**
 * Split on top-level commas/semicolons, ignoring those inside (), [], {} or
 * matching quote pairs. Preserves the original characters within each part.
 */
export function smartSplit(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote: string | null = null;
  const openers = new Set(["(", "[", "{"]);
  const closers = new Set([")", "]", "}"]);
  const quotes = new Set(['"', "'", "`"]);

  for (const ch of input) {
    if (inQuote) {
      current += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (quotes.has(ch)) {
      current += ch;
      inQuote = ch;
      continue;
    }
    if (openers.has(ch)) {
      current += ch;
      depth++;
      continue;
    }
    if (closers.has(ch)) {
      current += ch;
      if (depth > 0) depth--;
      continue;
    }
    if ((ch === "," || ch === ";") && depth === 0) {
      const t = current.trim();
      if (t) parts.push(t);
      current = "";
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

function splitLines(input: string): ParsedHeading[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((heading) => ({
      heading: heading.slice(0, MAX_HEADING_LEN),
      body: null,
    }));
}

function parseMarkdownHeaders(input: string): ParsedHeading[] {
  const lines = input.split(/\r?\n/);
  const out: ParsedHeading[] = [];
  let current: { heading: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match && match[1]) {
      if (current) {
        const body = current.bodyLines.join("\n").trim();
        out.push({
          heading: current.heading.slice(0, MAX_HEADING_LEN),
          body: body || null,
        });
      }
      current = { heading: match[1].trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }

  if (current) {
    const body = current.bodyLines.join("\n").trim();
    out.push({
      heading: current.heading.slice(0, MAX_HEADING_LEN),
      body: body || null,
    });
  }

  return out;
}
