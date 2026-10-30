"use strict";

// Run with: node --test scripts/test-skill.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { catalogs, findAssets, selectCompositions, selectSingles, promptFor, gridPrompt } =
  require("../.agents/skills/ai-reference-gallery/scripts/gallery.cjs");
const { interpret } = require("../.agents/skills/ai-reference-gallery/scripts/smart-select.cjs");
const { browserExecutable } =
  require("../.agents/skills/ai-reference-gallery/scripts/render.cjs");
const root = path.resolve(__dirname, "..");
const cli = path.join(root, ".agents/skills/ai-reference-gallery/scripts/gallery.cjs");
const testCache = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-cache-test-"));
process.on("exit", () => fs.rmSync(testCache, { recursive: true, force: true }));

function seedCache(pairs) {
  for (const pair of pairs) {
    for (const entry of [pair.pose, pair.outfit, pair.person]) {
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
  assert.equal(data.portraits.length, 1499);
  assert.ok(findAssets(data, "pose", { query: "站姿" }).length > 0);
  assert.ok(findAssets(data, "outfit", { category: "春季", query: "white" }).length > 0);
  assert.ok(findAssets(data, "portrait", { category: "short" }).length > 0);
  assert.ok(findAssets(data, "pose", { query: "impossible-keyword-123" }).length === 0);
  const japanese = catalogs("ja");
  assert.ok(findAssets(japanese, "pose", { query: "立ち" }).length > 0);
  const portraits = command("search", "--type", "portrait", "--category", "short", "--limit", "3");
  assert.equal(portraits.status, 0, portraits.stderr);
  assert.equal(JSON.parse(portraits.stdout).items.length, 3);
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

test("natural-language selection respects season, pose category and style exclusions", () => {
  const text = "日系春季穿搭，动作自然站姿，不要性感风格";
  const intent = interpret(text);
  assert.ok(intent.outfitCategories.includes("spring"));
  assert.ok(intent.poseCategories.includes("站姿"));
  assert.ok(intent.unsupported.includes("日系"));
  const data = catalogs();
  const flags = { describe: text, seed: "natural-selection", count: "9" };
  const pairs = selectCompositions(data, flags);
  assert.equal(pairs.length, 9);
  assert.ok(pairs.every((pair) => pair.pose.category_zh === "站姿"));
  assert.ok(pairs.every((pair) => pair.outfit.category === "spring"));
  assert.ok(pairs.every((pair) => !/full_sexy|upper80/.test(pair.pose.id)));
  assert.equal(new Set(pairs.map((pair) => pair.pose.pose_key)).size, 9);
  assert.equal(new Set(pairs.map((pair) => pair.outfit.id)).size, 9);
  assert.deepEqual(pairs.map((pair) => pair.pose.id),
    selectCompositions(data, flags).map((pair) => pair.pose.id));
  const search = command("search", "--type", "outfit", "--describe", text, "--limit", "3");
  assert.equal(search.status, 0, search.stderr);
  assert.equal(JSON.parse(search.stdout).selection.unsupported[0], "日系");
  const unsupported = command("compose", "--describe", "赛博风机器人火星奇观");
  assert.notEqual(unsupported.status, 0);
  assert.match(unsupported.stderr, /No supported/);
});

test("doctor diagnoses bundled runtime, Chrome and writable cache without network", () => {
  const status = command("doctor");
  assert.equal(status.status, 0, status.stderr);
  const value = JSON.parse(status.stdout);
  assert.equal(value.ok, true);
  assert.ok(value.checks.some((check) => check.name === "bundle" && check.ok));
  assert.ok(value.checks.some((check) => check.name === "browser" && check.ok));
});

test("single-image grid rejects incompatible parameters and insufficient unique matches", () => {
  const result = command("grid", "--size", "4", "--grid-mode", "single",
    "--grid-source", "outfit", "--person", "test.png");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /do not accept --person/);
  const invalid = command("grid", "--size", "4", "--grid-mode", "single",
    "--aspect", "wide");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /--aspect must be/);
  const pairs = command("grid", "--size", "4", "--grid-mode", "pairs",
    "--grid-source", "pose");
  assert.notEqual(pairs.status, 0);
  assert.match(pairs.stderr, /--grid-source and --aspect require/);
});

test("uploaded person photo and catalog portrait cannot silently override each other", () => {
  const person = path.join(root, "img/pose/solo-expressive/original/full_sexy_P001_front.png");
  for (const cmd of ["compose", "grid"]) {
    const args = cmd === "grid" ? ["grid", "--size", "4"] : ["compose"];
    const result = command(...args, "--person", person,
      "--portrait-id", "f71f980dde3");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Use either --person FILE or portrait catalog selection/);
  }
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

test("standalone Skill exports a portrait four-grid of four distinct outfit images",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    const data = catalogs();
    const selected = selectSingles(data, {
      "grid-source": "outfit", "outfit-category": "spring", seed: "one-image-4"
    }, 4);
    seedCache(selected.map((outfit) => ({ pose: null, outfit })));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-single-grid-"));
    try {
      const filename = path.join(dest, "single-4.png");
      const result = command("grid", "--size", "4", "--grid-mode", "single",
        "--grid-source", "outfit", "--outfit-category", "spring", "--aspect", "portrait",
        "--seed", "one-image-4", "--out", filename);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.grid.mode, "single");
      assert.equal(report.grid.source, "outfit");
      assert.deepEqual(report.image, { width: 2400, height: 3200 });
      assert.equal(new Set(report.panels.map((item) => item.id)).size, 4);
      const png = fs.readFileSync(filename);
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.ok(png.length > 100000);
      assert.match(fs.readFileSync(path.join(dest, "single-4.txt"), "utf8"), /第4格/);
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
  });

test("single-image grids write prompts in the selected language",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    const selected = selectSingles(catalogs(), {
      "grid-source": "pose", "pose-category": "站姿", seed: "localized-grid"
    }, 4);
    seedCache(selected.map((pose) => ({ pose })));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-grid-locales-"));
    try {
      for (const [language, expected] of [["en", /Panel 4:/],
        ["ja", /4コマ目：/]]) {
        const filename = path.join(dest, `single-${language}.png`);
        const result = command("grid", "--size", "4", "--grid-mode", "single",
          "--grid-source", "pose", "--pose-category", "站姿",
          "--seed", "localized-grid", "--lang", language, "--out", filename);
        assert.equal(result.status, 0, result.stderr);
        const prompt = fs.readFileSync(filename.replace(/\.png$/, ".txt"), "utf8");
        assert.match(prompt, expected);
        assert.doesNotMatch(prompt, /第4格/);
      }
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

test("portrait catalog selection produces a real three-image board and matching metadata",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    const data = catalogs();
    const pose = data.poses.find((item) => item.id === "full_sexy_P001_front");
    const outfit = data.outfits.find((item) => item.id === "SPR-0001");
    const portrait = data.portraits.find((item) => item.id === "f71f980dde3");
    assert.ok(portrait);
    seedCache([{ pose, outfit, person: portrait }]);
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-portrait-export-"));
    try {
      const filename = path.join(dest, "with-face.png");
      const result = command("compose", "--pose-id", pose.id, "--outfit-id", outfit.id,
        "--portrait-id", portrait.id, "--out", filename);
      assert.equal(result.status, 0, result.stderr);
      const info = JSON.parse(result.stdout);
      assert.equal(info.files[0].person.id, portrait.id);
      assert.deepEqual(info.files[0].order, ["pose", "outfit", "person"]);
      assert.equal(fs.readFileSync(filename).subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a");
      assert.match(fs.readFileSync(filename.replace(/\.png$/, ".txt"), "utf8"), /三图参考板/);
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

test("catalog portrait is shared across every paired grid cell and recorded in PNG metadata",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    const data = catalogs();
    const pose = data.poses.find((item) => item.id === "full_sexy_P001_front");
    const outfit = data.outfits.find((item) => item.id === "SPR-0001");
    const portrait = data.portraits.find((item) => item.id === "f71f980dde3");
    seedCache([{ pose, outfit, person: portrait }]);
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-shared-portrait-"));
    try {
      const filename = path.join(dest, "face-grid.png");
      const result = command("grid", "--size", "4", "--pose-id", pose.id,
        "--outfit-id", outfit.id, "--portrait-id", portrait.id, "--out", filename);
      assert.equal(result.status, 0, result.stderr);
      const grid = JSON.parse(result.stdout);
      assert.equal(grid.panels.length, 4);
      assert.ok(grid.panels.every((panel) => panel.person?.id === portrait.id));
      assert.deepEqual(grid.order, ["pose", "outfit", "person"]);
      assert.equal(fs.readFileSync(filename).subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a");
      assert.match(fs.readFileSync(filename.replace(/\.png$/, ".txt"), "utf8"), /人物照片/);
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

test("standalone Skill exports a nine-grid with nine different pose images",
  { skip: !browserExecutable() ? "Chrome/Edge is not installed" : false }, () => {
    const selected = selectSingles(catalogs(), {
      "grid-source": "pose", "pose-category": "站姿", seed: "one-image-9"
    }, 9);
    seedCache(selected.map((pose) => ({ pose, outfit: null })));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-nine-single-"));
    try {
      const filename = path.join(dest, "single-9.png");
      const result = command("grid", "--size", "9", "--grid-mode", "single",
        "--grid-source", "pose", "--pose-category", "站姿",
        "--seed", "one-image-9", "--out", filename);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.grid.mode, "single");
      assert.equal(report.panels.length, 9);
      assert.equal(new Set(report.panels.map((item) => item.id)).size, 9);
      assert.deepEqual(report.image, { width: 2400, height: 2400 });
      assert.equal(fs.readFileSync(filename).subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a");
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
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
    const portrait = records.portraits.find((x) => x.id === "f71f980dde3");
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
      // A face from the newly added collection must be fetched on demand from
      // the same installed skill, without downloading the remaining 1,498.
      allowed.add(portrait.original);
      const withPortrait = await runInstalled(["compose", "--pose-id", pose.id,
        "--outfit-id", outfit.id, "--portrait-id", portrait.id,
        "--out", "portrait-reference.png"], opts);
      assert.equal(withPortrait.status, 0, withPortrait.stderr);
      assert.equal(requests.length, 3, "Only the selected portrait should be fetched");
      assert.equal(requests[2], portrait.original);
      assert.equal(fs.existsSync(path.join(localCache, ...portrait.original.split("/"))), true);
      const saved = path.join(localCache, ...pose.original.split("/"));
      const corrupted = fs.readFileSync(saved);
      corrupted[corrupted.length - 20] ^= 1; // PNG signature remains valid
      fs.writeFileSync(saved, corrupted);
      const repaired = await runInstalled(["compose", "--pose-id", pose.id,
        "--outfit-id", outfit.id, "--out", "repaired.png"], opts);
      assert.equal(repaired.status, 0, repaired.stderr);
      assert.equal(requests.length, 4, "SHA-256 mismatch must redownload the damaged asset");
      // Close the source server: the second export must work entirely from cache.
      await new Promise((resolve) => server.close(resolve));
      const next = await runInstalled(["grid", "--size", "4", "--pose-id", pose.id,
        "--outfit-id", outfit.id, "--out", "four-from-cache.png"], opts);
      assert.equal(next.status, 0, next.stderr);
      assert.equal(JSON.parse(next.stdout).grid.size, 4);
      assert.equal(requests.length, 4);
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
