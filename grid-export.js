"use strict";
// Dependency-free, UTF-8 ZIP (stored entries). The browser downloads one file
// instead of triggering 4/9 downloads that Chrome may block.
window.ReferenceGridZIP = (() => {
  const encoder = new TextEncoder();
  const table = Uint32Array.from({length: 256}, (_, n) => {
    let value = n;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++)
      crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  const u16 = (view, offset, value) => view.setUint16(offset, value, true);
  const u32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);
  async function create(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 1000)
      throw new Error("ZIP_ENTRIES_INVALID");
    const parts = [], central = [];
    const seen = new Set();
    let offset = 0, centralLength = 0;
    for (const {name, blob} of entries) {
      if (typeof name !== "string" || !/^[\w.-]+$/.test(name) ||
          seen.has(name) || !(blob instanceof Blob)) throw new Error("ZIP_ENTRY_INVALID");
      seen.add(name);
      const filename = encoder.encode(name);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length >= 0xffffffff || offset + bytes.length >= 0xffffffff)
        throw new Error("ZIP_TOO_LARGE");
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + filename.length);
      const l = new DataView(local.buffer);
      u32(l, 0, 0x04034b50); u16(l, 4, 20); u16(l, 6, 0x0800);
      u32(l, 14, crc); u32(l, 18, bytes.length); u32(l, 22, bytes.length);
      u16(l, 26, filename.length);
      local.set(filename, 30);
      parts.push(local, bytes);
      const directory = new Uint8Array(46 + filename.length);
      const d = new DataView(directory.buffer);
      u32(d, 0, 0x02014b50); u16(d, 4, 20); u16(d, 6, 20);
      u16(d, 8, 0x0800);
      u32(d, 16, crc); u32(d, 20, bytes.length); u32(d, 24, bytes.length);
      u16(d, 28, filename.length); u32(d, 42, offset);
      directory.set(filename, 46);
      central.push(directory);
      centralLength += directory.length;
      offset += local.length + bytes.length;
    }
    if (offset + centralLength >= 0xffffffff) throw new Error("ZIP_TOO_LARGE");
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    u32(e, 0, 0x06054b50);
    u16(e, 8, entries.length); u16(e, 10, entries.length);
    u32(e, 12, centralLength); u32(e, 16, offset);
    return new Blob([...parts, ...central, end], {type: "application/zip"});
  }
  return {create};
})();
