"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const scope = {window: {}, TextEncoder, Uint8Array, Uint32Array, DataView, Blob};
vm.runInNewContext(fs.readFileSync("grid-export.js", "utf8"), scope);

function filesFromZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let index = 0;
  const names = [];
  while (index + 4 < bytes.length && view.getUint32(index, true) === 0x04034b50) {
    assert.equal(view.getUint16(index + 8, true), 0, "ZIP entries must be stored");
    const nameLength = view.getUint16(index + 26, true);
    const extraLength = view.getUint16(index + 28, true);
    const dataSize = view.getUint32(index + 18, true);
    const name = new TextDecoder().decode(bytes.subarray(index + 30, index + 30 + nameLength));
    const dataStart = index + 30 + nameLength + extraLength;
    names.push({name, content: bytes.subarray(dataStart, dataStart + dataSize)});
    index = dataStart + dataSize;
  }
  assert.equal(view.getUint32(index, true), 0x02014b50);
  return names;
}

test("standalone panel export makes valid ZIP with exact raw PNG data and prompt", async () => {
  const original = new Uint8Array([137,80,78,71,13,10,26,10, 1,2,3]);
  const archive = await scope.window.ReferenceGridZIP.create([
    {name:"01_reference.png",blob:new Blob([original], {type:"image/png"})},
    {name:"01_depth.png",blob:new Blob([original], {type:"image/png"})},
    {name:"prompt.txt",blob:new Blob(["深度图仅供专业条件输入"], {type:"text/plain"})}
  ]);
  const contents = filesFromZip(new Uint8Array(await archive.arrayBuffer()));
  assert.deepEqual(contents.map(x=>x.name), ["01_reference.png","01_depth.png","prompt.txt"]);
  assert.deepEqual([...contents[1].content], [...original]);
  assert.match(new TextDecoder().decode(contents[2].content), /专业/);
  await assert.rejects(scope.window.ReferenceGridZIP.create([
    {name:"../invalid.txt",blob:new Blob(["bad"])}
  ]), /ZIP_ENTRY_INVALID/);
});
