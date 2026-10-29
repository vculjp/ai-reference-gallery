#!/usr/bin/env node
"use strict";

// Standalone Agent Skill: self-contained indexes, selected-image downloads,
// and the website's original Canvas compositor bundled with the installed skill.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { render } = require("./render.cjs");
const { prepareAssets } = require("./asset-store.cjs");
const { interpret, rank, selectionInfo } = require("./smart-select.cjs");
const { diagnostics } = require("./doctor.cjs");

const root = process.cwd();
const skillRoot = path.resolve(__dirname, "..");
const locales = ["zh-CN", "en", "ja"];
let bundled;
function read(name) {
  if (!bundled) {
    const archive = path.join(skillRoot, "data", "runtime.json.gz");
    bundled = JSON.parse(zlib.gunzipSync(fs.readFileSync(archive)).toString("utf8"));
  }
  if (!Object.hasOwn(bundled, name)) throw new Error(`Missing bundled source ${name}`);
  return bundled[name];
}

function catalogs(language = "zh-CN") {
  if (!locales.includes(language)) throw new Error("--lang must be zh-CN, en or ja");
  const scope = { window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
  for (const file of ["catalog.js", "costume-catalog.js", "i18n.js"]) {
    vm.runInNewContext(read(file), scope, { filename: file, timeout: 2000 });
  }
  const i18n = scope.window.ReferenceGalleryI18n;
  i18n.setLocale(language);
  return { poses: scope.window.POSE_GALLERY_CATALOG,
    outfits: scope.window.COSTUME_GALLERY_CATALOG, i18n };
}

const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().trim();
function matches(item, query, i18n) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const fields = [item.id, item.pose_key, item.pose_number,
    ...i18n.searchable(item)].map(normalize).join(" ");
  return words.every((word) => fields.includes(word));
}
function hasCategory(item, name, i18n) {
  if (!name) return true;
  return [item.category, item.category_zh, item.category_en, item.category_ja,
    i18n.label(item, "category")].some((field) => normalize(field).includes(normalize(name)));
}
const isDuo = (pose) => pose.series === "2人絡み";
function findAssets(data, type, { query = "", category = "", includeDuo = false } = {}) {
  if (!["pose", "outfit"].includes(type)) throw new Error("--type must be pose or outfit");
  return (type === "pose" ? data.poses : data.outfits).filter((item) =>
    (type !== "pose" || includeDuo || !isDuo(item)) &&
    hasCategory(item, category, data.i18n) && matches(item, query, data.i18n));
}

function parseArgs(args) {
  const [command, ...rest] = args;
  if (!["search", "categories", "compose", "grid", "doctor", "help", "--help"].includes(command)) {
    throw new Error("Expected search, categories, compose, grid or doctor. Run 'help' for examples.");
  }
  const flags = {};
  const booleans = new Set(["include-duo", "overwrite"]);
  const known = new Set(["type", "query", "category", "limit", "lang", "pose-id",
    "outfit-id", "pose-query", "outfit-query", "pose-category", "outfit-category",
    "person", "outfit-image", "count", "seed", "out", "out-dir", "background",
    "labels", "size", "describe", "grid-mode", "grid-source", "aspect", ...booleans]);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--") || !known.has(arg.slice(2))) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2);
    if (key in flags) throw new Error(`Duplicate option: ${arg}`);
    if (booleans.has(key)) flags[key] = true;
    else {
      if (i + 1 >= rest.length || rest[i + 1].startsWith("--")) throw new Error(`Missing value for ${arg}`);
      flags[key] = rest[++i];
    }
  }
  return { command, flags };
}

function number(value, fallback, min, max, key) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || +value < min || +value > max) {
    throw new Error(`--${key} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}
function randomFromSeed(seed) {
  if (seed === undefined) return Math.random;
  let h = 2166136261;
  for (const char of String(seed)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(items, random) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectCompositions(data, options) {
  const count = number(options.count, 1, 1, 20, "count");
  const random = randomFromSeed(options.seed);
  const intent = options.describe ? interpret(options.describe) : null;
  if (intent && !intent.understood.length) {
    throw new Error(`No supported catalog constraints recognized in --describe: ${options.describe}. Try 春季 站姿 自然 or use category filters.`);
  }
  const poseOptions = { query: options["pose-query"] || "",
    category: options["pose-category"] || "",
    includeDuo: !!options["include-duo"] || !!intent?.includeDuo };
  let poses = findAssets(data, "pose", poseOptions);
  if (options["pose-id"]) {
    poses = data.poses.filter((entry) => entry.id === options["pose-id"]);
    if (!poses.length) throw new Error(`Pose not found: ${options["pose-id"]}`);
  }
  poses = rank(poses, "pose", intent, random);
  // Draw poses by distinct pose groups, not individual angles.
  const groups = new Map();
  for (const pose of poses) {
    if (!groups.has(pose.pose_key)) groups.set(pose.pose_key, []);
    groups.get(pose.pose_key).push(pose);
  }
  const outfitFile = options["outfit-image"];
  let outfits = outfitFile ? [null] : findAssets(data, "outfit", {
    query: options["outfit-query"] || "", category: options["outfit-category"] || "" });
  if (outfitFile && options["outfit-id"]) {
    throw new Error("Use only one of --outfit-id or --outfit-image");
  }
  if (!outfitFile && options["outfit-id"]) {
    outfits = data.outfits.filter((entry) => entry.id === options["outfit-id"]);
    if (!outfits.length) throw new Error(`Outfit not found: ${options["outfit-id"]}`);
  }
  if (!outfitFile) outfits = rank(outfits, "outfit", intent, random);
  if (!groups.size) throw new Error("No matching poses after applying exclusions. Try another description or broader filters.");
  if (!outfits.length) throw new Error("No matching outfits after applying exclusions. Try another description or broader filters.");
  // Higher-scoring natural language matches first. Without --describe preserve
  // the previous fully random selection.
  const poseKeys = intent ? [...groups.keys()] : shuffled([...groups.keys()], random);
  const outfitOrder = intent ? outfits : shuffled(outfits, random);
  return Array.from({ length: count }, (_, i) => {
    const poseGroup = groups.get(poseKeys[i % poseKeys.length]);
    const pose = poseGroup[Math.floor(random() * poseGroup.length)];
    const outfit = outfitOrder[i % outfitOrder.length];
    return { pose, outfit };
  });
}

function selectSingles(data, options, count) {
  const type = options["grid-source"] || "pose";
  if (!["pose", "outfit"].includes(type)) throw new Error("--grid-source must be pose or outfit");
  if (options.person || options["outfit-image"]) {
    throw new Error("Single-image grids do not accept --person or --outfit-image; use --grid-mode pairs");
  }
  const intent = options.describe ? interpret(options.describe) : null;
  if (intent && !intent.understood.length) {
    throw new Error("No supported constraints recognized in --describe; try 春季 站姿 自然");
  }
  const random = randomFromSeed(options.seed);
  const id = options[type === "pose" ? "pose-id" : "outfit-id"];
  const mismatch = options[type === "pose" ? "outfit-id" : "pose-id"];
  if (mismatch) throw new Error(`--${type === "pose" ? "outfit-id" : "pose-id"} does not apply to a ${type} single-image grid`);
  const filtered = id ? (type === "pose" ? data.poses : data.outfits).filter((x) => x.id === id) :
    findAssets(data, type, { query: options[type + "-query"] || "",
      category: options[type + "-category"] || "",
      includeDuo: !!options["include-duo"] || !!intent?.includeDuo });
  if (!filtered.length) throw new Error(`No matching ${type} images`);
  const sorted = intent ? rank(filtered, type, intent, random) : shuffled(filtered, random);
  const unique = type === "pose" ?
    [...new Map(sorted.map((item) => [item.pose_key, item])).values()] : sorted;
  if (!unique.length) throw new Error("No matching images after applying style exclusions");
  if (unique.length < count && !id) {
    throw new Error(`Only ${unique.length} unique ${type} references match; ${count} requested. Broaden your filters.`);
  }
  return Array.from({ length: count }, (_, i) => unique[i % unique.length]);
}

function localImage(filename, label) {
  if (!filename) return null;
  const resolved = path.resolve(filename);
  const stat = fs.statSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  if (!stat.isFile() || ![".jpg", ".jpeg", ".png", ".webp"].includes(ext) ||
    !stat.size || stat.size > 50 * 1024 * 1024) {
    throw new Error(`${label} must be a JPG, PNG or WebP file no larger than 50 MB`);
  }
  return { filename: resolved, name: path.basename(resolved) };
}

function promptFor(data, pose, outfit, person) {
  const { t } = data.i18n;
  const second = outfit ? outfit.id : "UPLOAD";
  return person
    ? t("composePromptThree", pose.id, t("composePosLeft"), second,
      t("composePosMiddleHorizontal"), t("composePosRight"))
    : t("composePrompt", pose.id, t("composePosLeft"), second, t("composePosRight"));
}

function gridPrompt(data, pairs, person) {
  const language = data.i18n.locale;
  const count = pairs.length;
  const introductions = {
    "zh-CN": `这是一张${count === 4 ? "四宫格" : "九宫格"}搭配方案对比参考板，按从左到右、从上到下编号。每格是一个独立的创作方案，不要把所有格子拼成一张人物成品图。请先选择要使用的格子，再参照对应的姿势、服装${person ? "与人物照片" : ""}生成作品。`,
    en: `This is a ${count}-panel outfit/pose comparison sheet, numbered left to right and top to bottom. Each panel represents a separate creative option, not one finished scene. Choose a panel before generating the final artwork.`,
    ja: `これは${count}コマのポーズ・衣装比較シートです。左から右、上から下の順に番号が付いています。各コマは独立した案です。すべてを一枚の完成作品として混ぜず、使用するコマを選んでください。`
  };
  return [introductions[language], ...pairs.map(({ pose, outfit }, i) => {
    const prefix = language === "zh-CN" ? `第${i + 1}格` :
      language === "ja" ? `${i + 1}コマ目` : `Panel ${i + 1}`;
    return `${prefix}（${pose.id} / ${outfit?.id || "UPLOAD"}）\n${promptFor(data, pose, outfit, person)}`;
  })].join("\n\n---\n\n");
}

function compositionInputs(pair, person, outfitFile, flags) {
  return { pose: pair.pose, second: pair.outfit ||
    { id: outfitFile.name, uploadUrl: "/__upload/outfit" },
  person: person ? { id: person.name, uploadUrl: "/__upload/person" } : null,
  background: flags.background || "white", labels: flags.labels !== "false" };
}

function compositionMeta(data, pair, person, outfitFile) {
  const { pose, outfit } = pair;
  return { pose: { id: pose.id, category: data.i18n.label(pose, "category"),
    name: data.i18n.label(pose, "pose_name"), angle: data.i18n.label(pose, "angle") },
  outfit: outfit ? { id: outfit.id, category: data.i18n.label(outfit, "category") }
    : { uploaded: outfitFile.name },
  person: person ? { uploaded: person.name } : null };
}

function validateCompositionFlags(flags) {
  if (flags.background && !["white", "soft"].includes(flags.background)) {
    throw new Error("--background must be white or soft");
  }
  if (flags.labels && !["true", "false"].includes(flags.labels)) {
    throw new Error("--labels must be true or false");
  }
}

function outputPaths(options, count) {
  if (options.out && count !== 1) throw new Error("--out is only supported with --count 1");
  if (options.out && path.extname(options.out).toLowerCase() !== ".png") {
    throw new Error("--out must end in .png");
  }
  const dir = path.resolve(options["out-dir"] || path.join(root, "output", "skill-compositions"));
  return Array.from({ length: count }, (_, i) => {
    const png = options.out ? path.resolve(options.out) :
      path.join(dir, `reference-${String(i + 1).padStart(3, "0")}.png`);
    return { png, prompt: png.replace(/\.png$/i, ".txt"),
      metadata: png.replace(/\.png$/i, ".json") };
  });
}

async function compose(data, flags) {
  validateCompositionFlags(flags);
  if (flags.size !== undefined) throw new Error("--size is for the grid command");
  const pairs = selectCompositions(data, flags);
  const paths = outputPaths(flags, pairs.length);
  const occupied = paths.flatMap((p) => Object.values(p)).filter((p) => fs.existsSync(p));
  if (occupied.length && !flags.overwrite) {
    throw new Error(`Output already exists: ${occupied[0]}. Use --overwrite or choose another path.`);
  }
  const person = localImage(flags.person, "Person photo");
  const outfitFile = localImage(flags["outfit-image"], "Outfit image");
  const uploads = { ...(person ? { person: person.filename } : {}),
    ...(outfitFile ? { outfit: outfitFile.filename } : {}) };
  const records = [];
  const assets = await prepareAssets(pairs);
  await render(read("composition.js"), uploads, async (draw) => {
    for (let i = 0; i < pairs.length; i++) {
      const { pose, outfit } = pairs[i];
      const inputs = compositionInputs(pairs[i], person, outfitFile, flags);
      const result = await draw(inputs);
      const png = Buffer.from(result.base64, "base64");
      if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error("Renderer did not produce a PNG");
      }
      const dest = paths[i];
      fs.mkdirSync(path.dirname(dest.png), { recursive: true });
      const prompt = promptFor(data, pose, outfit, person);
      const meta = { ...compositionMeta(data, pairs[i], person, outfitFile),
        image: { width: result.width, height: result.height }, order: ["pose", "outfit",
        ...(person ? ["person"] : [])], png: dest.png, prompt: dest.prompt,
        ...(flags.describe ? { selection: selectionInfo(interpret(flags.describe)) } : {}) };
      fs.writeFileSync(dest.png, png, flags.overwrite ? undefined : { flag: "wx" });
      fs.writeFileSync(dest.prompt, prompt + "\n");
      fs.writeFileSync(dest.metadata, JSON.stringify(meta, null, 2) + "\n");
      records.push(meta);
    }
  }, assets);
  return { count: records.length, files: records };
}

// Unlike compose --count N (N separate files), grid produces ONE PNG with
// N independently selected two/three-image reference boards in a 2x2 or 3x3 matrix.
async function grid(data, flags) {
  validateCompositionFlags(flags);
  if (flags.count !== undefined) {
    throw new Error("grid uses --size 4 or 9; --count is only for separate PNGs in compose");
  }
  if (flags.size !== "4" && flags.size !== "9") {
    throw new Error("grid requires --size 4 or --size 9");
  }
  const mode = flags["grid-mode"] || "pairs";
  if (!["pairs", "single"].includes(mode)) {
    throw new Error("--grid-mode must be pairs or single");
  }
  if (mode !== "single" && (flags["grid-source"] || flags.aspect)) {
    throw new Error("--grid-source and --aspect require --grid-mode single");
  }
  if (mode === "single" && flags.aspect && !["square", "portrait"].includes(flags.aspect)) {
    throw new Error("--aspect must be square or portrait");
  }
  const count = Number(flags.size);
  if (mode === "single") return gridSingles(data, flags, count);
  const pairs = selectCompositions(data, { ...flags, count: String(count) });
  if (!flags["pose-id"] && new Set(pairs.map((p) => p.pose.pose_key)).size !== count) {
    throw new Error(`Not enough unique pose groups for ${count} panels. Broaden filters or fix --pose-id.`);
  }
  if (!flags["outfit-id"] && !flags["outfit-image"] &&
    new Set(pairs.map((p) => p.outfit.id)).size !== count) {
    throw new Error(`Not enough unique outfits for ${count} panels. Broaden filters or fix --outfit-id.`);
  }
  const outdir = flags["out-dir"] || path.join(root, "output", "skill-grids");
  const filename = path.join(outdir, `grid-${count}.png`);
  const dest = outputPaths({ ...flags, out: flags.out || filename }, 1)[0];
  const occupied = Object.values(dest).find((file) => fs.existsSync(file));
  if (occupied && !flags.overwrite) {
    throw new Error(`Output already exists: ${occupied}. Use --overwrite or choose another path.`);
  }
  const person = localImage(flags.person, "Person photo");
  const outfitFile = localImage(flags["outfit-image"], "Outfit image");
  const uploads = { ...(person ? { person: person.filename } : {}),
    ...(outfitFile ? { outfit: outfitFile.filename } : {}) };
  const entries = pairs.map((pair) => compositionInputs(pair, person, outfitFile, flags));
  const panels = pairs.map((pair, index) => ({
    cell: index + 1, row: Math.floor(index / Math.sqrt(count)) + 1,
    column: index % Math.sqrt(count) + 1,
    ...compositionMeta(data, pair, person, outfitFile)
  }));
  const prompt = gridPrompt(data, pairs, person);
  const assets = await prepareAssets(pairs);
  const rendered = await render(read("composition.js"), uploads, async (_draw, drawGrid) =>
    drawGrid(entries), assets);
  const png = Buffer.from(rendered.base64, "base64");
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Grid renderer did not produce a PNG");
  }
  const metadata = { grid: { size: count, columns: Math.sqrt(count), rows: Math.sqrt(count), mode },
    image: { width: rendered.width, height: rendered.height },
    order: ["pose", "outfit", ...(person ? ["person"] : [])],
    panels, png: dest.png, prompt: dest.prompt,
    ...(flags.describe ? { selection: selectionInfo(interpret(flags.describe)) } : {}) };
  fs.mkdirSync(path.dirname(dest.png), { recursive: true });
  fs.writeFileSync(dest.png, png, flags.overwrite ? undefined : { flag: "wx" });
  fs.writeFileSync(dest.prompt, prompt + "\n");
  fs.writeFileSync(dest.metadata, JSON.stringify(metadata, null, 2) + "\n");
  return metadata;
}

async function gridSingles(data, flags, count) {
  const type = flags["grid-source"] || "pose";
  const selected = selectSingles(data, flags, count);
  const outdir = flags["out-dir"] || path.join(root, "output", "skill-grids");
  const defaultFile = path.join(outdir, `grid-${count}-single-${type}.png`);
  const dest = outputPaths({ ...flags, out: flags.out || defaultFile }, 1)[0];
  const occupied = Object.values(dest).find((file) => fs.existsSync(file));
  if (occupied && !flags.overwrite) {
    throw new Error(`Output already exists: ${occupied}. Use --overwrite or choose another path.`);
  }
  const pairs = selected.map((entry) => ({ pose: type === "pose" ? entry : null,
    outfit: type === "outfit" ? entry : null }));
  const assets = await prepareAssets(pairs);
  const entries = selected.map((item) => ({ path: item.original, id: item.id }));
  const result = await render(read("composition.js"), {}, async (_draw, _drawGrid, drawSingle) =>
    drawSingle(entries, { background: flags.background || "white",
      labels: flags.labels !== "false", aspect: flags.aspect || "square" }), assets);
  const png = Buffer.from(result.base64, "base64");
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Single grid did not produce a PNG");
  }
  const panels = selected.map((item, i) => ({
    cell: i + 1, row: Math.floor(i / Math.sqrt(count)) + 1,
    column: i % Math.sqrt(count) + 1, id: item.id,
    category: data.i18n.label(item, "category"), type
  }));
  const intro = type === "pose" ? "姿势" : "服装";
  const prompt = `这是一张${count}格${intro}素材对比图，每格是一张独立参考图片，依照从左到右、从上到下的格子编号选择需要的素材。\n\n` +
    panels.map((panel) => `第${panel.cell}格：${panel.id}（${panel.category}）`).join("\n");
  const metadata = { grid: { size: count, columns: Math.sqrt(count), rows: Math.sqrt(count),
      mode: "single", source: type, aspect: flags.aspect || "square" },
    image: { width: result.width, height: result.height }, panels,
    png: dest.png, prompt: dest.prompt,
    ...(flags.describe ? { selection: selectionInfo(interpret(flags.describe)) } : {}) };
  fs.mkdirSync(path.dirname(dest.png), { recursive: true });
  fs.writeFileSync(dest.png, png, flags.overwrite ? undefined : { flag: "wx" });
  fs.writeFileSync(dest.prompt, prompt + "\n");
  fs.writeFileSync(dest.metadata, JSON.stringify(metadata, null, 2) + "\n");
  return metadata;
}

const help = `AI Reference Gallery Skill (Node.js 22+)
  search --type pose|outfit [--query words] [--category name] [--limit 10] [--lang zh-CN|en|ja] [--include-duo]
  categories --type pose|outfit [--lang zh-CN|en|ja] [--include-duo]
  compose [--pose-id ID | --pose-query words] [--outfit-id ID | --outfit-query words | --outfit-image FILE]
          [--pose-category NAME] [--outfit-category NAME] [--include-duo]
          [--person FILE] [--count 1..20] [--seed STRING] [--background white|soft]
          [--labels true|false] [--lang zh-CN|en|ja] [--out FILE.png | --out-dir DIR] [--overwrite]
  grid --size 4|9 [the same pose, outfit, person, filters, seed, background, labels and output flags as compose]
  grid --size 4|9 --grid-mode single --grid-source pose|outfit [--aspect square|portrait]
  compose|grid --describe "春季日常站姿，不要性感风格" [other flags]
  doctor       Check Node.js, Chrome/Edge, bundled runtime and cache access without network
No gallery clone required: the skill contains catalogs and fetches selected original images on demand.
Images are cached under ~/.cache/ai-reference-gallery (override with AI_REFERENCE_CACHE_DIR).
Default output directory: ./output/skill-compositions (relative to current working directory)
Default grid output: output/skill-grids/grid-4.png or grid-9.png
PNG export requires an installed Chrome/Edge browser. Set CHROME_PATH if needed.
`;

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (command === "help" || command === "--help") return console.log(help);
  if (command === "doctor") {
    const report = diagnostics(skillRoot);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  const data = catalogs(flags.lang || "zh-CN");
  if (command === "search") {
    const type = flags.type || "pose";
    const intent = flags.describe ? interpret(flags.describe) : null;
    if (intent && !intent.understood.length) {
      throw new Error("No supported constraints recognized in --describe; try 春季 站姿 自然");
    }
    const candidates = findAssets(data, type, {
      query: flags.query, category: flags.category, includeDuo: !!flags["include-duo"] });
    const results = intent ? rank(candidates, type, intent, randomFromSeed(flags.seed)) : candidates;
    const limit = number(flags.limit, 10, 1, 100, "limit");
    const items = results.slice(0, limit).map((item) => ({
      id: item.id, category: data.i18n.label(item, "category"),
      ...(type === "pose" ? { name: data.i18n.label(item, "pose_name"),
        angle: data.i18n.label(item, "angle"), poseKey: item.pose_key } : {}),
      thumbnail: item.thumbnail
    }));
    return console.log(JSON.stringify({ total: results.length, items,
      ...(intent ? { selection: selectionInfo(intent) } : {}) }, null, 2));
  }
  if (command === "categories") {
    const type = flags.type || "pose";
    const records = findAssets(data, type, { includeDuo: !!flags["include-duo"] });
    const categories = new Map();
    for (const item of records) {
      const name = data.i18n.label(item, "category");
      categories.set(name, (categories.get(name) || 0) + 1);
    }
    return console.log(JSON.stringify([...categories].map(([name, images]) =>
      ({ name, images })), null, 2));
  }
  return console.log(JSON.stringify(command === "grid" ?
    await grid(data, flags) : await compose(data, flags), null, 2));
}

if (require.main === module) main(process.argv.slice(2)).catch((error) => {
  console.error(`Skill failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { catalogs, matches, findAssets, selectCompositions, selectSingles,
  promptFor, gridPrompt, parseArgs, main };
