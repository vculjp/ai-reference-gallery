"use strict";

// Fetch only requested catalog originals; preserve them in a user-level cache.
// No gallery clone and no photo uploads. The selected images are downloaded
// from the project repository, never from untrusted URLs in AI prompt text.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");

const sources = [
  "https://gallery.zsj.pp.ua/",
  "https://raw.githubusercontent.com/vculjp/ai-reference-gallery/main/"
];
const imagePath = /^img\/(?:pose|costume)\/[a-z0-9_-]+\/original\/[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp)$|^img\/portrait\/original\/[a-z0-9]{11}\.png$/;
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
        "--connect-timeout", "8", "--max-time", "30", "--max-redirs", "3",
        "--proto-redir", "=https", "--max-filesize", "36700160",
        "--output", target, url]);
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
    const final = new URL(response.url);
    if (final.protocol !== "https:" && !(final.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(final.hostname))) {
      throw new Error("Download redirected to an insecure URL");
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 35 * 1024 * 1024) throw new Error("Image exceeds 35 MB");
    let total = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > 35 * 1024 * 1024) {
        await response.body.cancel().catch(() => {});
        throw new Error("Image exceeds 35 MB");
      }
      chunks.push(Buffer.from(chunk));
    }
    fs.writeFileSync(target, Buffer.concat(chunks));
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

function checksum(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function validCache(target, ext) {
  if (!fs.existsSync(target)) return false;
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile() || !stat.size || stat.size > 35 * 1024 * 1024) return false;
    const bytes = fs.readFileSync(target);
    if (!signatureOK(bytes, ext)) return false;
    const digest = checksum(bytes);
    const record = target + ".sha256";
    if (fs.existsSync(record)) return fs.readFileSync(record, "utf8").trim() === digest;
    // An existing pre-upgrade cache entry has no digest yet.
    fs.writeFileSync(record, digest + "\n");
    return true;
  } catch {
    return false;
  }
}

async function download(relative) {
  const target = cachePath(relative);
  const ext = path.extname(target).toLowerCase();
  if (validCache(target, ext)) return target;
  fs.rmSync(target, { force: true });
  fs.rmSync(target + ".sha256", { force: true });
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  let lastError;
  // Prefer the project's own image hosts for every collection. Portraits
  // retain their licensed origin as a fallback until our site is redeployed.
  const isPortrait = relative.startsWith("img/portrait/original/");
  for (const location of (isPortrait && !process.env.AI_REFERENCE_ASSET_BASE
    ? [...bases(), "https://ai-portrait-gallery.pages.dev/"] : bases())) {
    const baseURL = new URL(location);
    if (baseURL.protocol !== "https:" && !(baseURL.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(baseURL.hostname))) {
      throw new Error("AI_REFERENCE_ASSET_BASE must be HTTPS or a loopback test server");
    }
    const isPortraitOrigin = isPortrait &&
      baseURL.hostname === "ai-portrait-gallery.pages.dev";
    const url = new URL(isPortraitOrigin
      ? `img/full/${path.posix.basename(relative)}` : encoded, baseURL);
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
        const digest = checksum(fs.readFileSync(temporary));
        fs.renameSync(temporary, target);
        fs.writeFileSync(target + ".sha256", digest + "\n");
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
  for (const { pose, outfit, person } of pairs) {
    if (pose) names.add(pose.original);
    if (outfit) names.add(outfit.original);
    if (person?.original) names.add(person.original);
  }
  const files = {};
  // Keep concurrency modest to avoid saturating public GitHub or Windows I/O.
  const items = [...names];
  const cached = items.filter((name) => validCache(cachePath(name),
    path.extname(name).toLowerCase())).length;
  if (cached !== items.length) {
    console.error(`Fetching ${items.length - cached} selected image(s); ${cached} already cached. Existing downloads are preserved if a later image fails.`);
  }
  for (let i = 0; i < items.length; i += 4) {
    const batch = items.slice(i, i + 4);
    const local = await Promise.all(batch.map(download));
    batch.forEach((name, j) => { files[name] = local[j]; });
    if (cached !== items.length) console.error(`Prepared ${Math.min(i + batch.length, items.length)}/${items.length} image(s)`);
  }
  return files;
}

module.exports = { cachePath, cacheDir, download, prepareAssets };
