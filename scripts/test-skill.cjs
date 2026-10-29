"use strict";

// Run with: node --test scripts/test-skill.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { catalogs, findAssets, selectCompositions, promptFor, gridPrompt } =
  require("../.agents/skills/ai-reference-gallery/scripts/gallery.cjs");
const { browserExecutable } =
  require("../.agents/skills/ai-reference-gallery/scripts/render.cjs");
const root = path.resolve(__dirname, "..");
const cli = path.join(root, ".agents/skills/ai-reference-gallery/scripts/gallery.cjs");
const testCache = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-cache-test-"));
process.on("exit", () => fs.rmSync(testCache, { recursive: true, force: true }));

function seedCache(pairs) {
  for (const pair of pairs) {
    for (const entry of [pair.pose, pair.outfit]) {
      if (!entry) continue;
      const from = path.join(root, ...entry.original.split("/"));
      const to = path.join(testCache, ...entry.original.split("/"));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function command(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: "utf8", timeout: 100000, maxBuffer: 5 * 1024 * 1024,
    env: { ...process.env, AI_REFERENCE_CACHE_DIR: testCache }
  });
}

test("catalog lookup searches the actual 1,439 poses and 1,407 outfits", () => {
  const data = catalogs();
  assert.equal(data.poses.length, 1439);
  assert.equal(data.outfits.length, 1407);
  assert.ok(findAssets(data, "pose", { query: "站姿" }).length > 0);
  assert.ok(findAssets(data, "outfit", { category: "春季", query: "white" }).length > 0);
  assert.ok(findAssets(data, "pose", { query: "impossible-keyword-123" }).length === 0);
  const japanese = catalogs("ja");
  assert.ok(findAssets(japanese, "pose", { query: "立ち" }).length > 0);
});

test("random composition is reproducible and avoids duplicate pose groups", () => {
  const data = catalogs();
  const options = { "pose-category": "站姿", "outfit-category": "spring",
    count: "5", seed: "same-seed" };
  const first = selectCompositions(data, options);
  const again = selectCompositions(data, options);
  assert.deepEqual(first.map((p) => [p.pose.id, p.outfit.id]),
    again.map((p) => [p.pose.id, p.outfit.id]));
  assert.equal(new Set(first.map((p) => p.pose.pose_key)).size, 5);
  assert.equal(new Set(first.map((p) => p.outfit.id)).size, 5);
  assert.equal(first.every((p) => p.pose.category_zh === "站姿" &&
    p.outfit.category === "spring"), true);
  assert.match(promptFor(data, first[0].pose, first[0].outfit, null), /左侧/);
  assert.match(promptFor(data, first[0].pose, first[0].outfit, { id: "upload" }), /右侧/);
});

test("search CLI emits IDs and errors for nonexistent assets or bad options", () => {
  const found = command("search", "--type", "pose", "--query", "站姿", "--limit", "2");
  assert.equal(found.status, 0, found.stderr);
  const result = JSON.parse(found.stdout);
  assert.equal(result.items.length, 2);
  assert.ok(result.items[0].id);
  const missing = command("compose", "--pose-id", "does-not-exist");
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Pose not found/);
  const tooMany = command("compose", "--count", "21");
  assert.notEqual(tooMany.status, 0);
  assert.match(tooMany.stderr, /1 to 20/);
});

test("four- and nine-panel prompts identify each separate option", () => {
  const data = catalogs();
  const four = selectCompositions(data, { count: "4", seed: "comparison" });
  const prompt4 = gridPrompt(data, four, null);
  assert.match(prompt4, /四宫格/);
  for (let i = 0; i < 4; i++) {
    assert.ok(prompt4.includes(`第${i + 1}格`));
    assert.ok(prompt4.includes(four[i].pose.id));
  }
  const nine = selectCompositions(data, { count: "9", seed: "comparison" });
  assert.match(gridPrompt(data, nine, { name: "demo.png" }), /第9格/);
  assert.match(gridPrompt(catalogs("en"), nine, null), /Panel 9/);
  assert.match(gridPrompt(catalogs("ja"), nine, null), /9コマ目/);
  // README's example must show nine distinct poses AND outfits, not only nine
  // different poses with one repeatedly fixed outfit.
  const readmeNine = selectCompositions(data, { count: "9",
    "pose-category": "站姿", "outfit-category": "spring", seed: "readme-nine-random-v3" });
  assert.equal(new Set(readmeNine.map((p) => p.pose.pose_key)).size, 9);
  assert.equal(new Set(readmeNine.map((p) => p.outfit.id)).size, 9);
});

test("grid CLI rejects unsupported sizes, ambiguous counts, and overwrite attempts", () => {
  const invalid = command("grid", "--size", "5");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /--size 4 or --size 9/);
  const count = command("grid", "--size", "4", "--count", "2");
  assert.notEqual(count.status, 0);
  assert.match(count.stderr, /--count is only for separate PNGs/);
  const composeSize = command("compose", "--size", "4");
  assert.notEqual(composeSize.status, 0);
  assert.match(composeSize.stderr, /--size is for the grid command/);
});

test("skill exports a real four-panel grid and does not overwrite existing outputs",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    seedCache(selectCompositions(catalogs(), { count: "4", "pose-category": "站姿",
      "outfit-category": "spring", seed: "compare-4" }));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-four-grid-"));
    try {
      const png = path.join(dest, "four.png");
      const args = ["grid", "--size", "4", "--pose-category", "站姿",
        "--outfit-category", "spring", "--seed", "compare-4", "--person",
        path.join(root, "img/pose/solo-expressive/original/full_sexy_P001_front.png"),
        "--out", png];
      const output = command(...args);
      assert.equal(output.status, 0, output.stderr || output.stdout);
      const summary = JSON.parse(output.stdout);
      assert.equal(summary.grid.columns, 2);
      assert.equal(summary.grid.rows, 2);
      assert.equal(summary.panels.length, 4);
      assert.equal(new Set(summary.panels.map((p) => p.pose.id)).size, 4);
      assert.equal(new Set(summary.panels.map((p) => p.outfit.id)).size, 4);
      assert.deepEqual(summary.panels.map((p) => [p.row, p.column]),
        [[1,1],[1,2],[2,1],[2,2]]);
      const image = fs.readFileSync(png);
      assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(image.readUInt32BE(16), summary.image.width);
      assert.equal(image.readUInt32BE(20), summary.image.height);
      assert.ok(image.length > 150000);
      assert.match(fs.readFileSync(path.join(dest, "four.txt"), "utf8"), /第4格/);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dest, "four.json"), "utf8")).grid.size, 4);
      const retry = command(...args);
      assert.notEqual(retry.status, 0);
      assert.match(retry.stderr, /Output already exists/);
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

test("skill exports a real nine-panel grid with fixed outfit and nine distinct pose groups",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    seedCache(selectCompositions(catalogs(), { count: "9", "pose-category": "站姿",
      "outfit-id": "SPR-0001", seed: "compare-9" }));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-nine-grid-"));
    try {
      const png = path.join(dest, "nine.png");
      const result = command("grid", "--size", "9", "--pose-category", "站姿",
        "--outfit-id", "SPR-0001", "--seed", "compare-9", "--out", png);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const meta = JSON.parse(result.stdout);
      assert.equal(meta.grid.size, 9);
      assert.equal(meta.grid.columns, 3);
      assert.equal(meta.panels.length, 9);
      assert.ok(meta.panels.every((panel) => panel.outfit.id === "SPR-0001"));
      assert.equal(new Set(meta.panels.map((panel) => panel.pose.id)).size, 9);
      assert.deepEqual([meta.panels[8].row, meta.panels[8].column], [3, 3]);
      const image = fs.readFileSync(png);
      assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(image.readUInt32BE(16), meta.image.width);
      assert.equal(image.readUInt32BE(20), meta.image.height);
      assert.ok(image.length > 200000);
      assert.match(fs.readFileSync(path.join(dest, "nine.txt"), "utf8"), /第9格/);
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

test("browser export emits a real 3-image PNG, matching prompt and metadata",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    const data = catalogs();
    seedCache([{ pose: data.poses.find((x) => x.id === "full_sexy_P001_front"),
      outfit: data.outfits.find((x) => x.id === "SPR-0001") }]);
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-gallery-test-"));
    try {
      const png = path.join(dest, "three.png");
      const args = ["compose", "--pose-id", "full_sexy_P001_front",
        "--outfit-id", "SPR-0001", "--person",
        path.join(root, "img/pose/solo-expressive/original/full_sexy_P001_front.png"),
        "--out", png];
      const output = command(...args);
      assert.equal(output.status, 0, output.stderr || output.stdout);
      const summary = JSON.parse(output.stdout);
      assert.equal(summary.count, 1);
      const buffer = fs.readFileSync(png);
      assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.ok(buffer.readUInt32BE(16) > 800);
      assert.ok(buffer.readUInt32BE(20) > 400);
      const prompt = fs.readFileSync(path.join(dest, "three.txt"), "utf8");
      assert.match(prompt, /三图参考板/);
      assert.match(prompt, /左侧/);
      assert.match(prompt, /中间/);
      assert.match(prompt, /右侧/);
      const metadata = JSON.parse(fs.readFileSync(path.join(dest, "three.json"), "utf8"));
      assert.deepEqual(metadata.order, ["pose", "outfit", "person"]);
      assert.equal(metadata.pose.id, "full_sexy_P001_front");
      assert.equal(metadata.outfit.id, "SPR-0001");
      // Reruns should not clobber exported artwork by default.
      const overwrite = command(...args);
      assert.notEqual(overwrite.status, 0);
      assert.match(overwrite.stderr, /already exists/);
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

function runInstalled(args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [opts.cli, ...args], {
      cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("globally installed skill works outside the gallery and fetches ONLY selected images",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-installed-"));
    const work = path.join(temp, "unrelated-workspace");
    const installed = path.join(temp, "skills", "ai-reference-gallery");
    fs.mkdirSync(work, { recursive: true });
    fs.cpSync(path.join(root, ".agents/skills/ai-reference-gallery"), installed, { recursive: true });
    const installedCli = path.join(installed, "scripts", "gallery.cjs");
    const localCache = path.join(temp, "image-cache");
    const records = catalogs();
    const pose = records.poses.find((x) => x.id === "full_sexy_P001_front");
    const outfit = records.outfits.find((x) => x.id === "SPR-0001");
    const allowed = new Set([pose.original, outfit.original]);
    const requests = [];
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, "http://localhost").pathname.slice(1);
      requests.push(pathname);
      if (!allowed.has(pathname)) return res.writeHead(404).end();
      const imageFile = path.join(root, ...pathname.split("/"));
      res.writeHead(200, { "Content-Type": "image/png" });
      fs.createReadStream(imageFile).pipe(res);
    });
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const env = { ...process.env, AI_REFERENCE_CACHE_DIR: localCache,
        AI_REFERENCE_ASSET_BASE: `http://127.0.0.1:${server.address().port}/` };
      const opts = { cli: installedCli, cwd: work, env };
      assert.equal(fs.existsSync(path.join(work, "catalog.js")), false);
      assert.equal(fs.existsSync(path.join(work, "img")), false);
      const search = await runInstalled(["search", "--type", "pose", "--query", "站姿",
        "--limit", "1"], opts);
      assert.equal(search.status, 0, search.stderr);
      assert.equal(JSON.parse(search.stdout).items.length, 1);
      assert.equal(requests.length, 0, "Search must not fetch any image");
      const first = await runInstalled(["compose", "--pose-id", pose.id,
        "--outfit-id", outfit.id, "--out", "reference.png"], opts);
      assert.equal(first.status, 0, first.stderr);
      assert.equal(requests.length, 2, "Only the two selected originals should be requested");
      assert.deepEqual(new Set(requests), allowed);
      assert.equal(fs.readFileSync(path.join(work, "reference.png"))
        .subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(fs.existsSync(path.join(localCache, ...pose.original.split("/"))), true);
      assert.equal(fs.existsSync(path.join(localCache, ...outfit.original.split("/"))), true);
      // Close the source server: the second export must work entirely from cache.
      await new Promise((resolve) => server.close(resolve));
      const next = await runInstalled(["grid", "--size", "4", "--pose-id", pose.id,
        "--outfit-id", outfit.id, "--out", "four-from-cache.png"], opts);
      assert.equal(next.status, 0, next.stderr);
      assert.equal(JSON.parse(next.stdout).grid.size, 4);
      assert.equal(requests.length, 2);
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
