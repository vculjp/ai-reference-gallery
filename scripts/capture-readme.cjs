"use strict";

// Regenerate README screenshots with the local gallery and an installed Chrome/Edge.
// Node.js 22+ is required only to run this documentation utility.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");
const port = 18878;
const url = `http://127.0.0.1:${port}/`;
const browser = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find((file) => file && fs.existsSync(file));
if (!browser) throw new Error("Chrome or Edge is needed to capture real screenshots.");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reference-gallery-docs-"));
const server = spawn(process.execPath, [path.join(__dirname, "serve-local.cjs"), String(port)], {
  cwd: root, stdio: "ignore"
});
let chrome;
let ws;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) break; }
    catch (_) { /* Server not ready. */ }
    if (i === 79) throw new Error("Static server did not start.");
    await sleep(100);
  }

  chrome = spawn(browser, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-gpu", "--no-sandbox",
    "--hide-scrollbars", "--force-device-scale-factor=1",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--window-size=1440,1120", url
  ], { stdio: "ignore" });

  let debugPort;
  for (let i = 0; i < 100; i++) {
    const file = path.join(profile, "DevToolsActivePort");
    if (fs.existsSync(file)) {
      debugPort = +fs.readFileSync(file, "utf8").split("\n")[0];
      break;
    }
    if (chrome.exitCode !== null) throw new Error("Browser exited before enabling DevTools.");
    await sleep(100);
  }
  if (!debugPort) throw new Error("Chrome DevTools port was not created.");
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("Could not find browser page.");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  const pending = new Map();
  let serial = 0;
  ws.onmessage = ({ data }) => {
    const response = JSON.parse(data);
    if (!pending.has(response.id)) return;
    const [resolve, reject] = pending.get(response.id);
    pending.delete(response.id);
    if (response.error) reject(new Error(response.error.message));
    else resolve(response.result);
  };
  const cmd = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, [resolve, reject]);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await cmd("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const resize = (width, height, mobile = false) => cmd("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile
  });
  async function prepare(scrollY = 0) {
    await evaluate(`window.scrollTo(0, ${scrollY})`);
    // Offscreen lazy-loaded images may never request data while the page stays at the top.
    await evaluate(`Promise.race([
      Promise.all([...document.querySelectorAll('.card img, .compose-slot img, .compose-grid-tiles img, .compose-grid-person-preview img')].filter(img => {
        const bounds=img.getBoundingClientRect();
        return bounds.top < innerHeight && bounds.bottom > 0;
      }).map(img => img.complete ? true : new Promise(r => {
        img.addEventListener('load', r, {once:true});
        img.addEventListener('error', r, {once:true});
      }))),
      new Promise(r => setTimeout(r, 2500))
    ])`);
    await evaluate("document.fonts.ready");
    await sleep(450);
  }
  async function shot(name, scrollY = 0) {
    await prepare(scrollY);
    const data = await cmd("Page.captureScreenshot", {
      format: "jpeg", quality: 85, fromSurface: true, captureBeyondViewport: false
    });
    fs.mkdirSync(docs, { recursive: true });
    const filename = path.join(docs, name);
    fs.writeFileSync(filename, Buffer.from(data.data, "base64"));
    console.log(`${path.relative(root, filename)}: ${Math.round(fs.statSync(filename).size / 1024)} KiB`);
  }
  for (let i = 0; i < 90; i++) {
    if (await evaluate("document.querySelectorAll('.card').length") === 60) break;
    await sleep(100);
  }
  if (await evaluate("document.querySelectorAll('.card').length") !== 60) {
    throw new Error("Gallery cards did not load.");
  }
  await resize(1440, 1024);
  await evaluate(`document.querySelector('#lang-zh').click();
    [...document.querySelectorAll('#series button')].find(x=>/标准/.test(x.textContent))?.click();`);
  await shot("preview.jpg");

  await evaluate(`document.querySelector('#type-costume').click();
    document.querySelector('#category').value='spring';
    document.querySelector('#category').dispatchEvent(new Event('change',{bubbles:true}));`);
  await shot("costumes.jpg");

  await evaluate("document.querySelector('#type-portrait').click()");
  if (await evaluate("document.querySelectorAll('.card').length") === 0) {
    throw new Error("Portrait gallery did not render any cards.");
  }
  await shot("portrait.jpg");

  // Capture a genuine, newly randomized 2×2 grid from the website, rather
  // than placing a static sample or manually duplicating source images.
  await resize(1440, 1130);
  await evaluate(`document.querySelector('#type-compose').click();
    document.querySelector('#compose-mode-four').click();
    document.querySelector('#compose-grid-shuffle').click();`);
  const selections = await evaluate(`(() => {
    const tiles = [...document.querySelectorAll('#compose-grid-tiles .compose-grid-tile')];
    const poses = tiles.map(tile => tile.querySelector('.compose-grid-pose img')?.alt);
    const outfits = tiles.map(tile => tile.querySelector('.compose-grid-outfit img')?.alt);
    return { count: tiles.length, poses, outfits };
  })()`);
  if (selections.count !== 4 ||
      new Set(selections.poses).size !== 4 ||
      new Set(selections.outfits).size !== 4 ||
      [...selections.poses, ...selections.outfits].some((id) => !id)) {
    throw new Error("Random four-grid must contain 4 distinct pose and outfit images.");
  }
  const gridScrollY = await evaluate(`(() => {
    const panel = document.querySelector('#compose-grid-panel');
    return Math.max(0, Math.floor(scrollY + panel.getBoundingClientRect().top - 20));
  })()`);
  await shot("four-grid.jpg", gridScrollY);
  const imagesLoaded = await evaluate(`[...document.querySelectorAll('#compose-grid-tiles img')]
    .every(img => img.complete && img.naturalWidth > 0)`);
  if (!imagesLoaded) throw new Error("Four-grid screenshots would contain missing thumbnails.");
  console.log("Four-grid random references: " + JSON.stringify(selections));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  if (server.exitCode === null) server.kill();
  await sleep(200);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); }
  catch (_) { /* Temporary user profile will be removed by the OS. */ }
});
