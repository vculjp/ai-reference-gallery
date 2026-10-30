"use strict";

// Catalog Manifest v1: portable, read-only interface shared by the website's
// source indexes, Agent Skill and downstream integrations.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const schemaVersion = 1;
const filename = "catalog-v1.json.gz";
const assetPath = /^img\/(?:pose|costume)\/[a-z0-9_-]+\/(?:original|thumbs|preview)\/[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/;
const portraitPath = /^img\/portrait\/(?:original|thumb)\/[a-z0-9]{11}\.(?:png|webp)$/;
const collections = ["pose", "outfit", "portrait"];

function checkManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== schemaVersion ||
      !manifest.collections || typeof manifest.collections !== "object") {
    throw new Error("Unsupported catalog schema version (expected 1)");
  }
  for (const type of collections) {
    const entries = manifest.collections[type];
    if (!Array.isArray(entries) || !entries.length) throw new Error(`Catalog missing ${type} entries`);
    const ids = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== "string" || !entry.id ||
        ids.has(entry.id) || typeof entry.category !== "string") {
        throw new Error(`Invalid/duplicate ${type} record: ${entry?.id}`);
      }
      ids.add(entry.id);
      for (const field of ["thumbnail", "original"]) {
        if (typeof entry[field] !== "string" ||
          (type === "portrait" ? !portraitPath.test(entry[field]) :
            !assetPath.test(entry[field]) ||
            !entry[field].startsWith(`img/${type === "pose" ? "pose" : "costume"}/`))) {
          throw new Error(`Invalid ${type} ${field}: ${entry.id}`);
        }
      }
      if (entry.preview && !(type === "portrait" ? portraitPath : assetPath).test(entry.preview)) {
        throw new Error(`Invalid preview: ${entry.id}`);
      }
      if (type === "pose" && (!entry.pose_key || !entry.pose_number || !entry.angle)) {
        throw new Error(`Incomplete pose: ${entry.id}`);
      }
    }
    if (manifest.counts?.[type] !== entries.length) {
      throw new Error(`Manifest ${type} count mismatch`);
    }
  }
  return manifest;
}

function loadManifest(file = path.resolve(__dirname, "../data", filename)) {
  return checkManifest(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")));
}

function query(manifest, { type = "pose", id, category, q, limit = 20, offset = 0 } = {}) {
  checkManifest(manifest);
  if (!collections.includes(type)) throw new Error("type must be pose, outfit or portrait");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 ||
      !Number.isInteger(offset) || offset < 0) throw new Error("Invalid limit/offset");
  const normalized = String(q || "").normalize("NFKC").toLowerCase();
  const categoryText = String(category || "").normalize("NFKC").toLowerCase();
  const filtered = manifest.collections[type].filter((entry) =>
    (!id || entry.id === id) &&
    (!categoryText || [entry.category, entry.category_zh, entry.category_en,
      entry.category_ja].some((value) => String(value || "").toLowerCase().includes(categoryText))) &&
    (!normalized || Object.entries(entry).some(([key, value]) =>
      !["original", "preview", "thumbnail"].includes(key) &&
      String(value || "").normalize("NFKC").toLowerCase().includes(normalized))));
  return { schemaVersion, type, total: filtered.length, offset, limit,
    items: filtered.slice(offset, offset + limit) };
}

function imageURL(record, field = "original", base = "https://gallery.zsj.pp.ua/") {
  if (!["thumbnail", "original", "preview"].includes(field) ||
      typeof record?.[field] !== "string" ||
      !(assetPath.test(record[field]) || portraitPath.test(record[field]))) {
    throw new Error("Unsupported catalog image path");
  }
  const url = new URL(base);
  if (url.protocol !== "https:" && !(url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname))) {
    throw new Error("Use HTTPS or a localhost preview for image URLs");
  }
  return new URL(record[field].split("/").map(encodeURIComponent).join("/"), url).href;
}

module.exports = { schemaVersion, filename, checkManifest, loadManifest, query, imageURL };
