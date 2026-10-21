import { describe, it, expect } from "vitest";
import { parseRanges, parseRangeGroups, describeSelection } from "./ranges";

describe("parseRanges", () => {
  it("parses a single page", () => {
    expect(parseRanges("3", 10)).toEqual([2]);
  });

  it("parses a closed range", () => {
    expect(parseRanges("1-3", 10)).toEqual([0, 1, 2]);
  });

  it("parses an open-ended range", () => {
    expect(parseRanges("8-", 10)).toEqual([7, 8, 9]);
  });

  it("parses a mixed list and de-duplicates", () => {
    expect(parseRanges("1-3, 2, 5, 1", 10)).toEqual([0, 1, 2, 4]);
  });

  it("clamps to the document length", () => {
    expect(parseRanges("8-99", 10)).toEqual([7, 8, 9]);
  });

  it("supports 'all'", () => {
    expect(parseRanges("all", 3)).toEqual([0, 1, 2]);
  });

  it("ignores garbage", () => {
    expect(parseRanges("abc", 10)).toEqual([]);
  });

  it("reverses a descending range", () => {
    expect(parseRanges("5-2", 10)).toEqual([1, 2, 3, 4]);
  });
});

describe("parseRangeGroups", () => {
  it("splits comma groups into separate outputs", () => {
    expect(parseRangeGroups("1-2,4", 10)).toEqual([
      [0, 1],
      [3],
    ]);
  });

  it("skips empty groups", () => {
    expect(parseRangeGroups("1,,3", 10)).toEqual([[0], [2]]);
  });
});

describe("describeSelection", () => {
  it("counts pages", () => {
    expect(describeSelection([0, 1, 2])).toBe("3 pages (1-3)");
  });

  it("describes a single page", () => {
    expect(describeSelection([4])).toBe("1 page (5)");
  });
});
