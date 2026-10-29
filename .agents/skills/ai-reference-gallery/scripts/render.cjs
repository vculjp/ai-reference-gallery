"use strict";

// Execute the BUNDLED browser compositor in a temporary local Chrome/Edge tab.
// Only explicitly downloaded source images are exposed via the loopback server.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

const mime = { ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deadline(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function browserExecutable() {
  const home = os.homedir();
  const guesses = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    path.join(home, "AppData/Local/Google/Chrome/Application/chrome.exe"),
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ];
  return guesses.find((name) => name && fs.existsSync(name));
}

function serve(compositor, uploads, assets) {
  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
    let file = null;
    let contentType = "text/html; charset=utf-8";
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/") {
      res.writeHead(200, { "Content-Type": contentType,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return res.end("<!doctype html><meta charset='utf-8'><script src='/composition.js'></script>");
    }
    if (pathname === "/composition.js") {
      const js = Buffer.from(compositor, "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8",
        "Content-Length": js.length, "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff" });
      return res.end(js);
    } else if (pathname.startsWith("/__upload/")) {
      const key = pathname.slice("/__upload/".length);
      if (Object.hasOwn(uploads, key)) {
        file = uploads[key];
        contentType = mime[path.extname(file).toLowerCase()];
      }
    } else if (pathname.startsWith("/img/") &&
      Object.hasOwn(assets, pathname.slice(1))) {
      file = assets[pathname.slice(1)];
      contentType = mime[path.extname(file).toLowerCase()];
    }
    if (!file || !contentType) return res.writeHead(404).end();
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": contentType, "Content-Length": stat.size,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file).pipe(res);
    });
  });
}

async function connectChrome(profile, chrome) {
  const file = path.join(profile, "DevToolsActivePort");
  let port;
  for (let i = 0; i < 180; i++) {
    if (fs.existsSync(file)) {
      const first = fs.readFileSync(file, "utf8").split(/\r?\n/)[0];
      if (/^\d+$/.test(first)) { port = Number(first); break; }
    }
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`);
    await sleep(100);
  }
  if (!port) throw new Error("Chrome/Edge did not start its debugging endpoint");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("Chrome/Edge opened without a page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await deadline(new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("Cannot connect to headless browser"));
  }), 5000, "Browser connection timed out");
  const pending = new Map();
  let serial = 0;
  ws.onmessage = (event) => {
    const response = JSON.parse(event.data);
    if (!pending.has(response.id)) return;
    const { resolve, reject } = pending.get(response.id);
    pending.delete(response.id);
    if (response.error) reject(new Error(response.error.message));
    else resolve(response.result);
  };
  ws.onclose = () => {
    for (const { reject } of pending.values()) reject(new Error("Browser closed during render"));
    pending.clear();
  };
  async function evaluate(expression) {
    const result = await deadline(new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true } }));
    }), 120000, "PNG rendering timed out");
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text);
    }
    if (result.result.type === "undefined") throw new Error("Renderer returned no data");
    return result.result.value;
  }
  return { ws, evaluate };
}

async function render(compositor, uploads, work, assets = {}) {
  const binary = browserExecutable();
  if (!binary) throw new Error("Install Chrome/Edge or set CHROME_PATH to your browser executable");
  if (!compositor || !compositor.includes("ReferenceComposition")) {
    throw new Error("Bundled Canvas compositor missing");
  }
  const server = serve(compositor, uploads, assets);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ai-reference-gallery-skill-"));
  const chrome = spawn(binary, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-gpu", "--no-sandbox",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    `http://127.0.0.1:${port}/`
  ], { stdio: "ignore" });
  let session;
  try {
    session = await connectChrome(profile, chrome);
    for (let i = 0; i < 100; i++) {
      if (await session.evaluate("typeof ReferenceComposition === 'object'")) break;
      if (i === 99) throw new Error("Browser compositor was not initialized");
      await sleep(80);
    }
    const draw = async (options) => {
      const expression = `(async () => {
        const options = ${JSON.stringify(options)};
        const blob = await ReferenceComposition.exportPNG(options);
        const bitmap = await createImageBitmap(blob);
        const dims = {width:bitmap.width,height:bitmap.height};
        bitmap.close();
        const base64 = await new Promise((resolve,reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error('PNG_ENCODING_FAILED'));
          reader.readAsDataURL(blob);
        });
        return {...dims,base64};
      })()`;
      return session.evaluate(expression);
    };
    const drawGrid = async (entries) => {
      if (![4, 9].includes(entries.length)) throw new Error("Grid requires 4 or 9 panels");
      // Each tile is a real two/three-image reference exported by the existing
      // compositor. The new grid layout lives ONLY in this Skill, not the site.
      const expression = `(async () => {
        const entries = ${JSON.stringify(entries)};
        const columns = Math.sqrt(entries.length);
        const cellW = 1000, cellH = 720, gap = 22, outer = 32;
        const width = outer*2 + cellW*columns + gap*(columns-1);
        const height = outer*2 + cellH*columns + gap*(columns-1);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#edf0f4';
        ctx.fillRect(0, 0, width, height);
        for (let i=0; i<entries.length; i++) {
          const options = entries[i];
          const x = outer + (i % columns) * (cellW + gap);
          const y = outer + Math.floor(i / columns) * (cellH + gap);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(x, y, cellW, cellH, 17);
          ctx.fill();
          ctx.strokeStyle = '#dce2e9';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#26354a';
          ctx.font = '600 24px system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          const pose = options.pose?.id || '';
          const outfit = options.second?.uploadUrl ? 'UPLOAD' : (options.second?.id || '');
          let text = String(i+1).padStart(2, '0') + '   ' + pose + '  /  ' + outfit +
            (options.person ? '  /  PERSON' : '');
          while (ctx.measureText(text).width > cellW - 48 && text.length > 8) {
            text = text.slice(0, -2);
          }
          ctx.fillText(text, x+24, y+37);
          ctx.fillStyle = '#f7f8fa';
          ctx.fillRect(x+20, y+72, cellW-40, cellH-92);
          const blob = await ReferenceComposition.exportPNG(options);
          const image = await createImageBitmap(blob);
          try {
            const maxW = cellW-48, maxH = cellH-100;
            const scale = Math.min(maxW/image.width, maxH/image.height);
            const w = image.width*scale, h = image.height*scale;
            ctx.drawImage(image, x+(cellW-w)/2, y+72+(cellH-92-h)/2, w, h);
          } finally { image.close(); }
        }
        const result = await new Promise((resolve,reject) =>
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('GRID_ENCODING_FAILED')), 'image/png'));
        const base64 = await new Promise((resolve,reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error('GRID_ENCODING_FAILED'));
          reader.readAsDataURL(result);
        });
        return {width,height,base64};
      })()`;
      return session.evaluate(expression);
    };
    const drawSingle = async (entries, settings) => {
      if (![4, 9].includes(entries.length)) throw new Error("Single grid requires 4 or 9 assets");
      // Keep every source image intact; no cover cropping. The only fetches
      // possible here are the exact originals supplied to the loopback server.
      for (const item of entries) {
        if (!Object.hasOwn(assets, item.path)) throw new Error(`Missing prepared asset: ${item.path}`);
      }
      const expression = `(async () => {
        const entries = ${JSON.stringify(entries)};
        const settings = ${JSON.stringify(settings)};
        const cols = Math.sqrt(entries.length);
        const width = 2400;
        const height = settings.aspect === 'portrait' ? 3200 : 2400;
        const margin = 42, gap = 18;
        const tileW = (width - 2*margin - gap*(cols-1))/cols;
        const tileH = (height - 2*margin - gap*(cols-1))/cols;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = settings.background === 'soft' ? '#eef1f5' : '#ffffff';
        ctx.fillRect(0,0,width,height);
        for (let i=0;i<entries.length;i++) {
          const item = entries[i];
          const x = margin + (i % cols)*(tileW+gap);
          const y = margin + Math.floor(i/cols)*(tileH+gap);
          const labelH = settings.labels ? 62 : 0;
          ctx.fillStyle = '#f8f9fb';
          ctx.fillRect(x,y,tileW,tileH);
          const response = await fetch('/'+item.path);
          if (!response.ok) throw new Error('Image fetch failed: '+item.id);
          const image = await createImageBitmap(await response.blob());
          try {
            const pad = 12;
            const maxW = tileW-pad*2, maxH = tileH-pad*2-labelH;
            const scale = Math.min(maxW/image.width,maxH/image.height);
            const w = image.width*scale, h = image.height*scale;
            ctx.drawImage(image,x+(tileW-w)/2,y+pad+(maxH-h)/2,w,h);
          } finally { image.close(); }
          if (settings.labels) {
            ctx.fillStyle = '#344054';
            ctx.font = '600 24px system-ui,sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i+1).padStart(2,'0')+'  '+item.id,
              x+20,y+tileH-labelH/2,tileW-40);
          }
        }
        const blob = await new Promise((resolve,reject)=>canvas.toBlob(
          b=>b?resolve(b):reject(new Error('PNG_ENCODE_FAILED')),'image/png'));
        const base64 = await new Promise((resolve,reject)=>{
          const reader = new FileReader();
          reader.onload=()=>resolve(reader.result.split(',')[1]);
          reader.onerror=()=>reject(new Error('PNG_ENCODE_FAILED'));
          reader.readAsDataURL(blob);
        });
        return {width,height,base64};
      })()`;
      return session.evaluate(expression);
    };
    return await work(draw, drawGrid, drawSingle);
  } finally {
    session?.ws.close();
    const exited = chrome.exitCode !== null || chrome.signalCode !== null;
    if (!exited) {
      chrome.kill();
      // On Windows the Chrome profile remains locked until the process exits.
      await Promise.race([once(chrome, "exit").catch(() => {}), sleep(5000)]);
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    // A failed temporary-profile cleanup must not hide a successful export.
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); }
    catch (error) { console.error(`Warning: could not delete temporary browser profile: ${error.message}`); }
  }
}

module.exports = { render, browserExecutable };
