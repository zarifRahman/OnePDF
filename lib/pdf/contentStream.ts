/**
 * A minimal PDF content-stream scanner.
 *
 * We only need to understand enough of the syntax to find the operators that
 * paint images and to know the transformation matrix in force at each one.
 * The scanner is deliberately forgiving: anything it cannot classify is
 * reported as an opaque operand and skipped, so a malformed stream never
 * throws — it just yields fewer hits.
 */

/** A 2D affine transform, in PDF `cm` operand order: [a, b, c, d, e, f]. */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** newCTM = m1 x m2 — m2 is applied to the point first. */
export function mul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Map a point through a transform. */
export function apply(m: Mat, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

export type Operand =
  | { kind: "num"; value: number; start: number; end: number }
  | { kind: "name"; value: string; start: number; end: number }
  | { kind: "other"; start: number; end: number };

export type OperatorHit = {
  op: string;
  operands: Operand[];
  /** Byte range of the operator token itself. */
  start: number;
  end: number;
  /** Byte range covering the operands and the operator. */
  blockStart: number;
  blockEnd: number;
};

const CHAR_TAB = 0x09;
const CHAR_LF = 0x0a;
const CHAR_FF = 0x0c;
const CHAR_CR = 0x0d;
const CHAR_SPACE = 0x20;
const CHAR_LPAREN = 0x28;
const CHAR_RPAREN = 0x29;
const CHAR_LT = 0x3c;
const CHAR_GT = 0x3e;
const CHAR_LBRACKET = 0x5b;
const CHAR_RBRACKET = 0x5d;
const CHAR_LBRACE = 0x7b;
const CHAR_RBRACE = 0x7d;
const CHAR_SLASH = 0x2f;
const CHAR_PERCENT = 0x25;
const CHAR_HASH = 0x23;

function isWs(b: number) {
  return (
    b === 0 ||
    b === CHAR_TAB ||
    b === CHAR_LF ||
    b === CHAR_FF ||
    b === CHAR_CR ||
    b === CHAR_SPACE
  );
}

function isDelim(b: number) {
  return (
    b === CHAR_LPAREN ||
    b === CHAR_RPAREN ||
    b === CHAR_LT ||
    b === CHAR_GT ||
    b === CHAR_LBRACKET ||
    b === CHAR_RBRACKET ||
    b === CHAR_LBRACE ||
    b === CHAR_RBRACE ||
    b === CHAR_SLASH ||
    b === CHAR_PERCENT
  );
}

function isRegular(b: number) {
  return !isWs(b) && !isDelim(b);
}

function isDigit(b: number) {
  return b >= 0x30 && b <= 0x39;
}

/** Decode a `/Name` token, resolving `#xx` hex escapes. */
function decodeName(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i++) {
    if (bytes[i] === CHAR_HASH && i + 2 < end) {
      const hex = String.fromCharCode(bytes[i + 1], bytes[i + 2]);
      const n = parseInt(hex, 16);
      if (!Number.isNaN(n)) {
        out += String.fromCharCode(n);
        i += 2;
        continue;
      }
    }
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Walk a decoded content stream, calling `visit` once per operator.
 *
 * Inline images (`BI … ID … EI`) are reported as a single `BI` hit whose
 * block range covers the whole image, binary payload included.
 */
export function walkContent(
  content: Uint8Array,
  visit: (hit: OperatorHit) => void,
) {
  const len = content.length;
  let pos = 0;
  let operands: Operand[] = [];

  const flush = (op: string, start: number, end: number, blockStart: number) => {
    visit({ op, operands, start, end, blockStart, blockEnd: end });
    operands = [];
  };

  while (pos < len) {
    const b = content[pos];

    if (isWs(b)) {
      pos++;
      continue;
    }

    // Comment: runs to the end of the line.
    if (b === CHAR_PERCENT) {
      while (pos < len && content[pos] !== CHAR_LF && content[pos] !== CHAR_CR) pos++;
      continue;
    }

    // Name object: /Name
    if (b === CHAR_SLASH) {
      const start = pos;
      pos++;
      while (pos < len && isRegular(content[pos])) pos++;
      operands.push({
        kind: "name",
        value: decodeName(content, start + 1, pos),
        start,
        end: pos,
      });
      continue;
    }

    // Literal string: ( … ) with balanced parens and backslash escapes.
    if (b === CHAR_LPAREN) {
      const start = pos;
      pos++;
      let depth = 1;
      while (pos < len && depth > 0) {
        const c = content[pos];
        if (c === 0x5c) {
          pos += 2;
          continue;
        }
        if (c === CHAR_LPAREN) depth++;
        else if (c === CHAR_RPAREN) depth--;
        pos++;
      }
      operands.push({ kind: "other", start, end: pos });
      continue;
    }

    // Hex string or dictionary.
    if (b === CHAR_LT) {
      const start = pos;
      if (content[pos + 1] === CHAR_LT) {
        pos += 2;
        let depth = 1;
        while (pos < len && depth > 0) {
          if (content[pos] === CHAR_LT && content[pos + 1] === CHAR_LT) {
            depth--;
            pos += 2;
            continue;
          }
          if (content[pos] === CHAR_GT && content[pos + 1] === CHAR_GT) {
            depth--;
            pos += 2;
            continue;
          }
          pos++;
        }
      } else {
        pos++;
        while (pos < len && content[pos] !== CHAR_GT) pos++;
        pos++; // consume '>'
      }
      operands.push({ kind: "other", start, end: pos });
      continue;
    }

    // Array.
    if (b === CHAR_LBRACKET) {
      const start = pos;
      pos++;
      let depth = 1;
      while (pos < len && depth > 0) {
        const c = content[pos];
        if (c === CHAR_LPAREN) {
          // Skip a nested literal string wholesale.
          pos++;
          let pdepth = 1;
          while (pos < len && pdepth > 0) {
            const pc = content[pos];
            if (pc === 0x5c) {
              pos += 2;
              continue;
            }
            if (pc === CHAR_LPAREN) pdepth++;
            else if (pc === CHAR_RPAREN) pdepth--;
            pos++;
          }
          continue;
        }
        if (c === CHAR_LBRACKET) depth++;
        else if (c === CHAR_RBRACKET) depth--;
        pos++;
      }
      operands.push({ kind: "other", start, end: pos });
      continue;
    }

    // PostScript calculator function: { … }
    if (b === CHAR_LBRACE) {
      const start = pos;
      pos++;
      let depth = 1;
      while (pos < len && depth > 0) {
        const c = content[pos];
        if (c === CHAR_LBRACE) depth++;
        else if (c === CHAR_RBRACE) depth--;
        pos++;
      }
      operands.push({ kind: "other", start, end: pos });
      continue;
    }

    // Stray closing delimiters.
    if (b === CHAR_RPAREN || b === CHAR_RBRACKET || b === CHAR_RBRACE || b === CHAR_GT) {
      pos++;
      continue;
    }

    // Number.
    if (isDigit(b) || b === 0x2b || b === 0x2d || (b === 0x2e && isDigit(content[pos + 1]))) {
      const start = pos;
      if (b === 0x2b || b === 0x2d) pos++;
      let seenDot = false;
      while (pos < len) {
        const c = content[pos];
        if (isDigit(c)) {
          pos++;
          continue;
        }
        if (c === 0x2e && !seenDot) {
          seenDot = true;
          pos++;
          continue;
        }
        break;
      }
      const text = String.fromCharCode(...content.subarray(start, pos));
      const value = parseFloat(text);
      operands.push({
        kind: "num",
        value: Number.isNaN(value) ? 0 : value,
        start,
        end: pos,
      });
      continue;
    }

    // Operator keyword.
    const opStart = pos;
    while (pos < len && isRegular(content[pos])) pos++;
    if (pos === opStart) {
      // Not a regular character we know — skip it so we cannot loop forever.
      pos++;
      continue;
    }
    const op = String.fromCharCode(...content.subarray(opStart, pos));

    if (op === "BI") {
      // An inline image is one operator plus a raw binary payload. Report it
      // as a single hit whose block covers the whole thing, so a caller can
      // excise it by byte range.
      const blockEnd = findInlineImageEnd(content, pos);
      visit({
        op: "BI",
        operands,
        start: opStart,
        end: pos,
        blockStart: opStart,
        blockEnd,
      });
      operands = [];
      pos = blockEnd;
      continue;
    }

    const blockStart = operands.length
      ? operands[0].start
      : opStart;
    flush(op, opStart, pos, blockStart);
  }
}

/**
 * Find the end of an inline image that starts after `pos`.
 * Returns the index just past the closing `EI`.
 */
function findInlineImageEnd(content: Uint8Array, pos: number): number {
  const len = content.length;
  // Scan forward for the `ID` keyword.
  let i = pos;
  while (i < len) {
    const b = content[i];
    if (isWs(b)) {
      i++;
      continue;
    }
    if (b === CHAR_SLASH) {
      while (i < len && isRegular(content[i])) i++;
      continue;
    }
    if (isDigit(b) || b === 0x2b || b === 0x2d) {
      while (i < len && (isRegular(content[i]) || content[i] === 0x2e)) i++;
      continue;
    }
    // A keyword: check for "ID".
    const kwStart = i;
    while (i < len && isRegular(content[i])) i++;
    const kw = String.fromCharCode(...content.subarray(kwStart, i));
    if (kw === "ID") {
      // Exactly one whitespace byte separates `ID` from the binary payload.
      let dataStart = i;
      if (dataStart < len && isWs(content[dataStart])) dataStart++;
      // The payload ends at the whitespace that precedes `EI`.
      let end = dataStart;
      while (end < len) {
        if (
          isWs(content[end]) &&
          content[end + 1] === 0x45 /* E */ &&
          content[end + 2] === 0x49 /* I */
        ) {
          const after = content[end + 3];
          if (after === undefined || isWs(after) || isDelim(after)) {
            return end + 3;
          }
        }
        end++;
      }
      return len;
    }
    // Unknown keyword — keep looking.
  }
  return len;
}
