"use strict";

// Build an incremental Cloudflare Pages release without re-copying the image library.
// Asset URLs include their content hash so browsers never mix new HTML with old CSS/JS.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
assert.ok(fs.existsSync(path.join(dist, "img", "pose")), "Missing dist/img/pose; first prepare the image assets");
assert.ok(fs.existsSync(path.join(dist, "img", "costume")), "Missing dist/img/costume; first prepare the image assets");

// Only stage newly added or changed images. Existing images are not recopied,
// and Cloudflare Pages reuses assets whose content hashes are unchanged.
let imageAdded = 0, imageUpdated = 0, imageCount = 0;
function syncImages(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const item of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, item.name);
    const target = path.join(targetDir, item.name);
    if (item.isDirectory()) { syncImages(source, target); continue; }
    assert.ok(item.isFile(), `Unsupported asset type: ${source}`);
    imageCount += 1;
    const stat = fs.statSync(source);
    assert.ok(stat.size <= 25 * 1024 * 1024, `Image exceeds Cloudflare Pages 25 MiB limit: ${source}`);
    if (!fs.existsSync(target)) {
      try { fs.linkSync(source, target); }
      catch (err) { if (err.code === "EXDEV") fs.copyFileSync(source, target); else throw err; }
      imageAdded += 1;
    } else {
      const previous = fs.statSync(target);
      if (stat.size !== previous.size || (stat.dev !== previous.dev || stat.ino !== previous.ino) && Math.abs(stat.mtimeMs - previous.mtimeMs) > 1) {
        fs.copyFileSync(source, target);
        imageUpdated += 1;
      }
    }
  }
}
syncImages(path.join(root, "img"), path.join(dist, "img"));
assert.ok(imageCount < 20000, `Cloudflare Pages asset count limit at risk: ${imageCount}`);

const original = fs.readFileSync(path.join(root, "index.html"), "utf8");
let copied = 0;
const html = original.replace(/(\b(?:src|href)=")([^"?#]+?\.(?:js|css))(")/g, (full, prefix, file, suffix) => {
  const source = path.resolve(root, file);
  assert.ok(source.startsWith(root + path.sep), `Unexpected asset path: ${file}`);
  assert.ok(fs.existsSync(source), `Missing referenced asset: ${file}`);
  const content = fs.readFileSync(source);
  const version = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  const target = path.resolve(dist, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  copied += 1;
  return `${prefix}${file}?v=${version}${suffix}`;
});
assert.ok(copied >= 8, `Only found ${copied} JS/CSS references in index.html`);
fs.writeFileSync(path.join(dist, "index.html"), html);
console.log(`Release prepared: index.html and ${copied} CSS/JS files; ${imageCount} images (${imageAdded} new, ${imageUpdated} updated)`);
