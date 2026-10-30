"use strict";
// Maintainer-only importer. Public gallery remains a static, dependency-free site.
// Usage: node scripts/import-portraits.cjs [--catalog-only | --thumbs | --full | --verify]
// --full is an optional resumable ~5 GB original-image mirror for authorized hosts.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const base = "https://ai-portrait-gallery.pages.dev/";
const action = process.argv[2] || "--thumbs";
if (!["--catalog-only", "--thumbs", "--full", "--verify"].includes(action) || process.argv.length > 3) {
  throw new Error("Usage: node scripts/import-portraits.cjs [--catalog-only|--thumbs|--full|--verify]");
}
const sections = new Set(["face", "styling"]);
const hairs = { "ショート": ["short", "短发", "Short"], "ミディアム": ["medium", "中发", "Medium"],
  "セミロング": ["semi-long", "中长发", "Medium-long"], "ロング": ["long", "长发", "Long"] };
async function fetchFile(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
function isValid(bytes, ext, row) {
  const png = ext === "png";
  if (bytes.length < 100 || (png
    ? bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      (row?.w && bytes.readUInt32BE(16) !== row.w) ||
      (row?.h && bytes.readUInt32BE(20) !== row.h)
    : bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP")) return false;
  return !(png && row?.bytes && bytes.length !== row.bytes);
}
function isValidHeader(head, size, ext, row) {
  if (size < 100) return false;
  if (ext === "png") return head.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" &&
    head.toString("ascii", 12, 16) === "IHDR" &&
    (!row?.w || head.readUInt32BE(16) === row.w) &&
    (!row?.h || head.readUInt32BE(20) === row.h) &&
    (!row?.bytes || size === row.bytes);
  return head.toString("ascii", 0, 4) === "RIFF" &&
    head.toString("ascii", 8, 12) === "WEBP";
}
function validLocalFile(relative, ext, row) {
  const target = path.join(root, ...relative.split("/"));
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size < 100) return false;
    const fd = fs.openSync(target, "r");
    try {
      const head = Buffer.alloc(32);
      if (fs.readSync(fd, head, 0, 32, 0) !== 32) return false;
      return isValidHeader(head, stat.size, ext, row);
    } finally { fs.closeSync(fd); }
  } catch { return false; }
}
async function fetchAsset(source, relative, ext, row) {
  const target = path.join(root, ...relative.split("/"));
  if (validLocalFile(relative, ext, row)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let bytes, error;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      bytes = await fetchFile(new URL(source, base));
      if (!isValid(bytes, ext, row)) throw new Error(`Invalid image size or contents: ${source}`);
      error = null;
      break;
    } catch (err) {
      error = err;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
    }
  }
  if (error) throw error;
  const tmp = target + ".part";
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, target);
  return true;
}
async function main() {
  const src = (await fetchFile(new URL("data/images.js", base))).toString("utf8");
  const first = src.indexOf("["), last = src.lastIndexOf("]");
  if (first === -1 || last < first) throw new Error("Unexpected source catalog");
  const rows = JSON.parse(src.slice(first, last + 1));
  if (!rows.length || new Set(rows.map((x) => x.id)).size !== rows.length) {
    throw new Error("Missing or duplicated portrait IDs");
  }
  const fullAlreadyPresent = rows.every((row) =>
    validLocalFile(`img/portrait/original/${row.id}.png`, "png", row));
  if (action === "--verify") {
    const missing = rows.filter((row) =>
      !validLocalFile(`img/portrait/original/${row.id}.png`, "png", row));
    console.log(`Portrait originals: ${rows.length - missing.length}/${rows.length} validated`);
    if (missing.length) throw new Error(`Missing/corrupt originals: ${missing.slice(0, 20).map((r) => r.id).join(", ")}`);
    return;
  }
  const catalog = rows.map((row) => {
    if (!/^[a-z0-9]{11}$/.test(row.id) || !sections.has(row.section) || !hairs[row.hair] ||
        row.thumb !== `img/thumb/${row.id}.webp` || row.full !== `img/full/${row.id}.png`) {
      throw new Error(`Unexpected catalog row: ${row.id}`);
    }
    const [hairCategory, hairZh, hairEn] = hairs[row.hair];
    return {
      id: row.id, section: row.section, category: hairCategory,
      category_ja: row.hair, category_zh: hairZh, category_en: hairEn,
      style: row.style || "", width: row.w, height: row.h,
      thumbnail: `img/portrait/thumb/${row.id}.webp`,
      preview: `img/portrait/thumb/${row.id}.webp`,
      original: action === "--full" || fullAlreadyPresent ? `img/portrait/original/${row.id}.png` :
        new URL(row.full, base).href
    };
  });
  const dest = path.join(root, "portrait-catalog.js");
  const content = `"use strict";\n// Licensed metadata: ${base} (あぎ / CC0).\nwindow.PORTRAIT_GALLERY_CATALOG = ${JSON.stringify(catalog)};\n`;
  // Do not switch the catalog to local originals until ALL originals exist.
  if (action !== "--full" || fullAlreadyPresent) fs.writeFileSync(dest, content, "utf8");
  console.log(`Portrait catalog: ${catalog.length} records; face=${catalog.filter((x)=>x.section==="face").length}; styling=${catalog.filter((x)=>x.section==="styling").length}`);
  if (action === "--catalog-only") return;
  const failure = [];
  const tasks = rows.map((row) => action === "--full"
    ? { source: row.full, target: `img/portrait/original/${row.id}.png`, ext: "png", row }
    : { source: row.thumb, target: `img/portrait/thumb/${row.id}.webp`, ext: "webp", row });
  let next = 0, finished = 0;
  await Promise.all(Array.from({length: 12}, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      try { await fetchAsset(task.source, task.target, task.ext, task.row); }
      catch (error) { failure.push(`${task.target}: ${error.message}`); }
      finished++;
      if (finished % 200 === 0 || finished === tasks.length) {
        console.log(`${finished}/${tasks.length}, errors=${failure.length}`);
      }
    }
  }));
  if (failure.length) throw new Error(failure.slice(0, 15).join("\n"));
  if (action === "--full") fs.writeFileSync(dest, content, "utf8");
  console.log("Verified all " + tasks.length + " portrait " + (action === "--full" ? "originals" : "thumbnails"));
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
