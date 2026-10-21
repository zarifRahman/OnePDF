import { describe, it, expect } from "vitest";
import { makeZip, crc32 } from "./zip";

describe("crc32", () => {
  it("matches the known CRC of '123456789'", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("makeZip", () => {
  it("writes a store-only archive with one local header per entry", () => {
    const zip = makeZip([
      { name: "a.pdf", data: new Uint8Array([1, 2, 3]) },
      { name: "b.pdf", data: new Uint8Array([4, 5]) },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local file header
    // End of central directory record at the tail.
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2); // entries on this disk
  });

  it("stores the file names", () => {
    const zip = makeZip([{ name: "report.pdf", data: new Uint8Array([9]) }]);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("report.pdf");
  });
});
