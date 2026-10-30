#!/usr/bin/env node
"use strict";
// Import POSE-DB-02 assets only when the operator has permission to download
// and redistribute them. The upstream public terms alone do not grant this.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { setTimeout: delay } = require("node:timers/promises");

const base = "https://ai-pose-depth-gallery.pages.dev/";
const root = path.resolve(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--"))
  .map((arg) => { const [name, ...parts] = arg.slice(2).split("="); return [name, parts.join("=") || "true"]; }));
const mode = args.mode || "thumbs";
const limit = Number(args.limit || 0);
const concurrency = Math.min(10, Math.max(1, Number(args.concurrency || 5)));
if (!["thumbs", "originals", "all", "verify"].includes(mode)) throw new Error("Invalid mode");
if (!Number.isInteger(limit) || limit < 0) throw new Error("Invalid limit");

async function upstreamIndex() {
  const response = await fetch(base);
  if (!response.ok) throw new Error(`Failed to fetch source index: ${response.status}`);
  const html = await response.text();
  const match = html.match(/const D=(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Upstream format changed: no data array");
  const records = JSON.parse(match[1]);
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, "catalog.js"), "utf8"), context);
  const poses = context.window.POSE_GALLERY_CATALOG;
  const ids = new Set(poses.map((item) => item.id));
  if (records.length !== poses.length || new Set(records.map((item) => item.id)).size !== records.length ||
      records.some((item) => !ids.has(item.id) || !/^[\w-]+$/.test(item.id))) {
    throw new Error("Depth and pose catalogs are not an exact ID match; refusing import");
  }
  return records;
}

async function fetchAsset(record, kind) {
  const isThumb = kind === "thumbs";
  const ext = isThumb ? "jpg" : "png";
  const target = path.join(root, "img", "depth", isThumb ? "thumbs" : "original", `${record.id}.${ext}`);
  if (fs.existsSync(target)) {
    const stat = fs.statSync(target);
    if (stat.size > 100) return "skipped";
  }
  const route = isThumb ? record["サムネ"] : record["原寸"];
  if (route !== (isThumb ? `thumbs/${record.id}.jpg` : `img/${record.id}.png`)) {
    throw new Error(`Unexpected source path for ${record.id}`);
  }
  fs.mkdirSync(path.dirname(target), {recursive: true});
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(new URL(route, base), {signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`${response.status}: ${route}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith(isThumb ? "image/jpeg" : "image/png")) {
        throw new Error(`Invalid content-type ${contentType}: ${route}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const valid = isThumb
        ? bytes[0] === 0xff && bytes[1] === 0xd8
        : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!valid || bytes.length < 100 || bytes.length > 40 * 1024 * 1024) {
        throw new Error(`Invalid image bytes: ${route}`);
      }
      const temp = target + ".part";
      fs.writeFileSync(temp, bytes);
      fs.renameSync(temp, target);
      return "downloaded";
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(500 * (attempt + 1));
    }
  }
}

async function main() {
  const records = await upstreamIndex();
  const subset = limit ? records.slice(0, limit) : records;
  if (mode === "verify") {
    let invalid = 0;
    for (const kind of ["thumbs", "originals"]) {
      const dir = path.join(root, "img/depth", kind === "thumbs" ? "thumbs" : "original");
      const ext = kind === "thumbs" ? "jpg" : "png";
      const bad = records.filter(({id}) => {
        const filename = path.join(dir, `${id}.${ext}`);
        if (!fs.existsSync(filename)) return true;
        const bytes = fs.readFileSync(filename);
        return bytes.length < 100 || !(kind === "thumbs"
          ? bytes[0] === 0xff && bytes[1] === 0xd8
          : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
      });
      console.log(`${kind}: ${records.length - bad.length}/${records.length}; missing or invalid ${bad.length}`);
      invalid += bad.length;
    }
    if (invalid) process.exitCode = 1;
    return;
  }
  const kinds = mode === "all" ? ["thumbs", "originals"] : [mode];
  const queue = kinds.flatMap((kind) => subset.map((record) => ({record, kind})));
  let next = 0, downloaded = 0, skipped = 0;
  const errors = [];
  async function worker() {
    while (next < queue.length) {
      const {record, kind} = queue[next++];
      try {
        const status = await fetchAsset(record, kind);
        if (status === "downloaded") downloaded++;
        else skipped++;
      } catch (error) {
        errors.push(`${record.id} ${kind}: ${error.message}`);
      }
      const completed = downloaded + skipped + errors.length;
      if (completed % 100 === 0 || completed === queue.length) {
        console.log(`${completed}/${queue.length} downloaded=${downloaded} skipped=${skipped} failed=${errors.length}`);
      }
    }
  }
  await Promise.all(Array.from({length: concurrency}, () => worker()));
  if (errors.length) {
    for (const error of errors.slice(0, 20)) console.error(error);
    process.exitCode = 1;
  }
}
main().catch((error) => {console.error(error); process.exitCode = 1;});
