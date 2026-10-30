"use strict";

// Lightweight distribution tests: runnable with a sparse checkout and no
// 2GB image gallery, no browsers and no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const api = require("../.agents/skills/ai-reference-gallery/scripts/catalog-api.cjs");
const { catalogs, selectCompositions, selectSingles } =
  require("../.agents/skills/ai-reference-gallery/scripts/gallery.cjs");
const root = path.resolve(__dirname, "..");
const cli = path.join(root, "bin/ai-reference-gallery.cjs");

function run(...args) {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args],
    { cwd: os.tmpdir(), encoding: "utf8", maxBuffer: 5 * 1024 * 1024 }));
}

test("Catalog v1 has a stable version, validated records and matching counts", () => {
  const manifest = api.loadManifest();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.counts.pose, 1439);
  assert.equal(manifest.counts.depth, 1439);
  assert.equal(manifest.counts.outfit, 1407);
  assert.equal(manifest.counts.portrait, 1499);
  assert.deepEqual(Object.keys(manifest.collections), ["pose", "depth", "outfit", "portrait"]);
  assert.deepEqual(manifest.collections.depth.map((item) => item.id),
    manifest.collections.pose.map((item) => item.id));
  assert.equal(catalogs().depths.length, manifest.counts.depth);
  assert.equal(catalogs().poses.length, manifest.counts.pose);
  assert.equal(catalogs().outfits.length, manifest.counts.outfit);
  assert.equal(catalogs().portraits.length, manifest.counts.portrait);
  assert.equal(api.loadManifest(path.join(root, "metadata/catalog-v1.json.gz")).counts.pose, 1439);
});

test("Catalog API filters and paginates, returns local asset paths and resolvable URLs", () => {
  const manifest = api.loadManifest();
  const result = api.query(manifest, { type: "outfit", category: "spring",
    q: "SPR-", offset: 5, limit: 3 });
  assert.equal(result.items.length, 3);
  assert.ok(result.total > 50);
  assert.ok(result.items.every((item) => item.category === "spring"));
  const record = api.query(manifest, { type: "outfit", id: "SPR-0001" }).items[0];
  assert.equal(record.original, "img/costume/spring/original/SPR-0001.png");
  assert.equal(api.imageURL(record), "https://gallery.zsj.pp.ua/img/costume/spring/original/SPR-0001.png");
  const portrait = api.query(manifest, {type:"portrait",id:"f71f980dde3"}).items[0];
  assert.equal(portrait.original, "img/portrait/original/f71f980dde3.png");
  assert.equal(api.imageURL(portrait), "https://gallery.zsj.pp.ua/img/portrait/original/f71f980dde3.png");
  const depth = api.query(manifest, {type:"depth",id:"full_sexy_P001_front"}).items[0];
  assert.equal(depth.original, "img/depth/original/full_sexy_P001_front.png");
  assert.equal(depth.relatedPoseId, depth.id);
  assert.equal(api.imageURL(depth), "https://gallery.zsj.pp.ua/img/depth/original/full_sexy_P001_front.png");
  assert.equal(run("catalog", "--type", "depth", "--limit", "1").total, 1439);
  assert.throws(() => api.query(manifest, { type: "nonexistent" }), /type must be/);
  assert.throws(() => api.query(manifest, { limit: 0 }), /limit/);
  assert.throws(() => api.imageURL({ original: "../private.txt" }), /Unsupported/);
  assert.throws(() => api.checkManifest({ schemaVersion: 2 }), /version/);
});

test("Global CLI catalog endpoint works from any directory, supports JSON export", () => {
  const record = run("catalog", "--type", "pose", "--limit", "1", "--offset", "1");
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.items.length, 1);
  assert.equal(record.offset, 1);
  const manifest = run("catalog", "--format", "manifest");
  assert.equal(manifest.counts.pose, 1439);
  assert.equal(manifest.counts.depth, 1439);
  assert.equal(manifest.counts.outfit, 1407);
  assert.equal(manifest.counts.portrait, 1499);
  assert.ok(manifest.collections.pose.length);
});

test("Skill selection continues to use the versioned catalog with no gallery files", () => {
  const data = catalogs();
  const options = { describe: "春季自然站姿，不要性感风格", count: "9", seed: "v1" };
  const pairs = selectCompositions(data, options);
  assert.equal(pairs.length, 9);
  assert.equal(new Set(pairs.map((p) => p.pose.pose_key)).size, 9);
  assert.equal(new Set(pairs.map((p) => p.outfit.id)).size, 9);
  const singles = selectSingles(data, { "grid-source": "pose",
    "pose-category": "站姿", seed: "v1" }, 4);
  assert.equal(singles.length, 4);
  assert.equal(new Set(singles.map((p) => p.pose_key)).size, 4);
});

test("npm archive is independent from the 2GB gallery and contains the entire Skill", () => {
  // npm is a .cmd launcher on Windows; execFileSync cannot spawn it directly.
  const output = process.platform === "win32" ?
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm pack --dry-run --ignore-scripts --json"],
      { cwd: root, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 }) :
    execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"],
      { cwd: root, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  const result = JSON.parse(output)[0];
  const paths = result.files.map((file) => file.path);
  for (const name of ["bin/ai-reference-gallery.cjs",
    ".agents/skills/ai-reference-gallery/SKILL.md",
    ".agents/skills/ai-reference-gallery/data/catalog-v1.json.gz",
    ".agents/skills/ai-reference-gallery/data/runtime.json.gz",
    ".agents/skills/ai-reference-gallery/scripts/catalog-api.cjs"]) {
    assert.ok(paths.includes(name), `Missing npm packaged file: ${name}`);
  }
  assert.ok(paths.every((name) => !name.startsWith("img/")),
    "npm archive must never include the image gallery");
  assert.ok(result.size < 750000, `Package unexpectedly large: ${result.size} bytes`);
});
