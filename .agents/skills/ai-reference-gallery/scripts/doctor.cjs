"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { browserExecutable } = require("./render.cjs");
const { cacheDir } = require("./asset-store.cjs");

function diagnostics(skillRoot) {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "node", ok: nodeMajor >= 22, value: process.version,
    hint: nodeMajor >= 22 ? undefined : "Install Node.js 22 or later" });
  const browser = browserExecutable();
  checks.push({ name: "browser", ok: !!browser, value: browser || null,
    hint: browser ? undefined : "Install Chrome/Edge or set CHROME_PATH" });
  const bundled = path.join(skillRoot, "data", "runtime.json.gz");
  try {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(bundled)).toString("utf8"));
    const ok = ["catalog.js", "costume-catalog.js", "i18n.js", "composition.js"]
      .every((filename) => typeof data[filename] === "string" && data[filename].length > 0);
    checks.push({ name: "bundle", ok, value: path.basename(bundled),
      hint: ok ? undefined : "Reinstall the complete skill including data/runtime.json.gz" });
  } catch (err) {
    checks.push({ name: "bundle", ok: false, value: err.code || err.message,
      hint: "Reinstall the complete skill including data/runtime.json.gz" });
  }
  const directory = cacheDir();
  try {
    fs.mkdirSync(directory, { recursive: true });
    const candidate = path.join(directory, `.doctor-${process.pid}`);
    fs.writeFileSync(candidate, "ok", { flag: "wx" });
    fs.rmSync(candidate, { force: true });
    checks.push({ name: "cache-write", ok: true, value: directory });
  } catch (err) {
    checks.push({ name: "cache-write", ok: false, value: directory, hint: err.message });
  }
  const output = process.cwd();
  try {
    fs.accessSync(output, fs.constants.W_OK);
    checks.push({ name: "output-directory", ok: true, value: output });
  } catch (err) {
    checks.push({ name: "output-directory", ok: false, value: output, hint: err.message });
  }
  return { ok: checks.every((check) => check.ok), platform: os.platform(), checks,
    note: "Offline checks only; image source network availability is not verified." };
}

module.exports = { diagnostics };
