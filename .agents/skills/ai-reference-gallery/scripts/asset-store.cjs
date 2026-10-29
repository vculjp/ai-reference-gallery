"use strict";

// Fetch only requested catalog originals; preserve them in a user-level cache.
// No gallery clone and no photo uploads. The selected images are downloaded
// from the project repository, never from untrusted URLs in AI prompt text.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const sources = [
  "https://gallery.zsj.pp.ua/",
  "https://raw.githubusercontent.com/vculjp/ai-reference-gallery/main/"
];
const imagePath = /^img\/(?:pose|costume)\/[a-z0-9_-]+\/original\/[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/;
const cacheDir = () => path.resolve(process.env.AI_REFERENCE_CACHE_DIR ||
  path.join(os.homedir(), ".cache", "ai-reference-gallery"));
const bases = () => process.env.AI_REFERENCE_ASSET_BASE ?
  [process.env.AI_REFERENCE_ASSET_BASE] : sources;

async function downloadFile(url, target) {
  const bin = process.platform === "win32" ? "curl.exe" : "curl";
  // On some Windows connections curl works while undici fetch times out.
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(bin, ["--fail", "--location", "--silent", "--show-error",
        "--connect-timeout", "8", "--max-time", "30", "--output", target, url]);
      let error = "";
      child.stderr.on("data", (data) => { error += data.toString().slice(0, 500); });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() :
        reject(new Error(error.trim() || `curl exit code ${code}`)));
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // Fallback on platforms where curl isn't installed.
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 35 * 1024 * 1024) throw new Error("Image exceeds 35 MB");
    fs.writeFileSync(target, new Uint8Array(await response.arrayBuffer()));
  }
}

function signatureOK(buffer, ext) {
  if (ext === ".png") return buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (ext === ".jpg" || ext === ".jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8;
  return buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
}

function cachePath(relative) {
  if (!imagePath.test(relative) || relative.includes("..")) {
    throw new Error(`Invalid catalog image path: ${relative}`);
  }
  return path.join(cacheDir(), ...relative.split("/"));
}

async function download(relative) {
  const target = cachePath(relative);
  const ext = path.extname(target).toLowerCase();
  if (fs.existsSync(target)) {
    const data = fs.readFileSync(target);
    if (signatureOK(data, ext)) return target;
    fs.rmSync(target, { force: true });
  }
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  let lastError;
  for (const location of bases()) {
    const baseURL = new URL(location);
    if (baseURL.protocol !== "https:" && !(baseURL.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(baseURL.hostname))) {
      throw new Error("AI_REFERENCE_ASSET_BASE must be HTTPS or a loopback test server");
    }
    const url = new URL(encoded, baseURL);
    for (let attempt = 0; attempt < 2; attempt++) {
      const temporary = `${target}.${process.pid}.${attempt}.part`;
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        await downloadFile(url.href, temporary);
        const stat = fs.statSync(temporary);
        if (!stat.size || stat.size > 35 * 1024 * 1024 ||
          !signatureOK(fs.readFileSync(temporary), ext)) {
          throw new Error(`Invalid image returned for ${relative}`);
        }
        fs.renameSync(temporary, target);
        return target;
      } catch (err) {
        lastError = err;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
  }
  throw new Error(`Could not download ${relative}: ${lastError.message}. Check connectivity or set AI_REFERENCE_ASSET_BASE.`);
}

async function prepareAssets(pairs) {
  const names = new Set();
  for (const { pose, outfit } of pairs) {
    if (pose) names.add(pose.original);
    if (outfit) names.add(outfit.original);
  }
  const files = {};
  // Keep concurrency modest to avoid saturating public GitHub or Windows I/O.
  const items = [...names];
  for (let i = 0; i < items.length; i += 4) {
    const batch = items.slice(i, i + 4);
    const local = await Promise.all(batch.map(download));
    batch.forEach((name, j) => { files[name] = local[j]; });
  }
  return files;
}

module.exports = { cachePath, cacheDir, download, prepareAssets };
