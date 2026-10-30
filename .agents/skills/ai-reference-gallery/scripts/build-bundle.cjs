"use strict";

// Maintainer-only. Root JS catalogs remain the canonical source for the
// file:// website. Generate one versioned data contract for Skill and other
// consumers, plus the Skill's portable browser/i18n runtime.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const { checkManifest, filename, schemaVersion } = require("./catalog-api.cjs");
const root = path.resolve(__dirname, "../../../..");
const skillDir = path.resolve(__dirname, "..");
const flags = new Set(process.argv.slice(2));
if ([...flags].some((flag) => !["--check", "--committed"].includes(flag))) {
  throw new Error("Supported flags: --check, --committed");
}

function source(file) {
  const contents = flags.has("--committed") ?
    execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8" }) :
    fs.readFileSync(path.join(root, file), "utf8");
  // Stable across Windows checkout CRLF and Linux checkout LF.
  return contents.replace(/\r\n/g, "\n");
}
const src = Object.fromEntries(["catalog.js", "costume-catalog.js", "portrait-catalog.js",
  "i18n.js", "composition.js"].map((file) => [file, source(file)]));
const context = { window: {} };
for (const file of ["catalog.js", "costume-catalog.js", "portrait-catalog.js"]) {
  vm.runInNewContext(src[file], context, { filename: file, timeout: 2000 });
}

const pose = JSON.parse(JSON.stringify(context.window.POSE_GALLERY_CATALOG));
const outfit = JSON.parse(JSON.stringify(context.window.COSTUME_GALLERY_CATALOG));
const portrait = JSON.parse(JSON.stringify(context.window.PORTRAIT_GALLERY_CATALOG))
  .map((item) => ({ ...item,
    original: `img/portrait/original/${item.id}.png` }));
const manifest = checkManifest({
  schemaVersion, source: ["catalog.js", "costume-catalog.js", "portrait-catalog.js"],
  counts: { pose: pose.length, outfit: outfit.length, portrait: portrait.length },
  collections: { pose, outfit, portrait }
});
const data = zlib.gzipSync(Buffer.from(JSON.stringify(manifest)), { level: 9 });
const runtime = zlib.gzipSync(Buffer.from(JSON.stringify({
  "i18n.js": src["i18n.js"], "composition.js": src["composition.js"]
})), { level: 9 });
const outputs = [
  [path.join(root, "metadata", filename), data],
  [path.join(skillDir, "data", filename), data],
  [path.join(skillDir, "data", "runtime.json.gz"), runtime]
];

for (const [target, bytes] of outputs) {
  if (flags.has("--check")) {
    // Different Node/zlib versions can encode the same gzip payload using
    // slightly different bytes. Compare decoded content across CI platforms.
    let current;
    try { current = zlib.gunzipSync(fs.readFileSync(target)); }
    catch { current = null; }
    if (!current || !current.equals(zlib.gunzipSync(bytes))) {
      throw new Error(`Stale generated catalog/runtime: ${path.relative(root, target)}. Run node .agents/skills/ai-reference-gallery/scripts/build-bundle.cjs`);
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
}
console.log(`${flags.has("--check") ? "Verified" : "Generated"} Catalog v${schemaVersion}: ${pose.length} poses, ${outfit.length} outfits, ${portrait.length} portraits; manifest ${data.length} bytes, runtime ${runtime.length} bytes`);
