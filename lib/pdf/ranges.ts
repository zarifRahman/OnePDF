// Page-range parsing shared by Split PDF and Extract Pages.
//
// Accepts the shapes people actually type:
//   "1-3,5,8-"   pages 1-3, page 5, page 8 to the end
//   "all"        every page
//   "2-2"        a single page
// Returns 0-based page indices, sorted and de-duplicated.

export function parseRanges(spec: string, pageCount: number): number[] {
  const text = spec.trim().toLowerCase();
  if (!text || pageCount <= 0) return [];
  if (text === "all" || text === "*") {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  const out = new Set<number>();
  for (const rawPart of text.split(/[,;]/)) {
    const part = rawPart.trim();
    if (!part) continue;
    if (!/^\d*\s*(-\s*\d*)?$/.test(part)) continue;

    let start: number;
    let end: number;
    if (part.includes("-")) {
      const [a, b] = part.split("-");
      start = a.trim() ? parseInt(a, 10) : 1;
      end = b.trim() ? parseInt(b, 10) : pageCount;
    } else {
      start = end = parseInt(part, 10);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    if (start > end) [start, end] = [end, start];
    start = Math.max(1, start);
    end = Math.min(pageCount, end);
    for (let i = start; i <= end; i++) out.add(i - 1);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Split a range spec into one index list per comma-separated group.
 * "1-3,7-8" -> [[0,1,2],[6,7]] (each group expanded).
 */
export function parseRangeGroups(spec: string, pageCount: number): number[][] {
  const groups: number[][] = [];
  for (const rawPart of spec.split(/[,;]/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const idx = parseRanges(part, pageCount);
    if (idx.length) groups.push(idx);
  }
  return groups;
}

/** Human summary of a selection, e.g. "1-3, 7" -> "3 pages". */
export function describeSelection(indices: number[]): string {
  if (!indices.length) return "0 pages";
  const sorted = [...indices].sort((a, b) => a - b);
  const groups: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur !== prev + 1) {
      groups.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
      start = cur;
    }
    prev = cur;
  }
  return `${sorted.length} page${sorted.length === 1 ? "" : "s"} (${groups.join(", ")})`;
}
