"use strict";

// Maintainer-only: rebuild the tiny bundled runtime from the website source.
// This bundle deliberately contains NO original photographs or other images.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../../..");
const bundlePath = path.resolve(__dirname, "../data/runtime.json.gz");
const files = ["catalog.js", "costume-catalog.js", "i18n.js", "composition.js"];
const source = Object.fromEntries(files.map((file) => [file,
  process.argv.includes("--committed") ?
    execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8" }) :
    fs.readFileSync(path.join(root, file), "utf8")
]));
const archive = zlib.gzipSync(Buffer.from(JSON.stringify(source)), { level: 9 });
fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
fs.writeFileSync(bundlePath, archive);
console.log(`Bundled ${files.join(", ")}: ${archive.length} bytes, no image files`);
