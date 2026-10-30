"use strict";
// Browser smoke test for Depth tab, pose switching, composition and grid.
// No npm dependencies: Node 22+ WebSocket and locally installed Chrome/Edge.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { browserExecutable } = require("../.agents/skills/ai-reference-gallery/scripts/render.cjs");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function choosePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function main() {
  const chromePath = browserExecutable();
  if (!chromePath) throw new Error("Chrome or Edge is required");
  const port = await choosePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reference-depth-smoke-"));
  const base = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ["scripts/serve-local.cjs", String(port)],
    { cwd: path.resolve(__dirname, ".."), stdio: "ignore" });
  let chrome, ws;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break; } }
      catch (_) {}
      await sleep(100);
    }
    if (!ready) throw new Error("Local preview server did not start");
    chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-sandbox",
      "--no-first-run", "--disable-extensions", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, base], { stdio: "ignore" });
    const activePort = path.join(profile, "DevToolsActivePort");
    let chromePort = 0;
    for (let i = 0; i < 150; i++) {
      if (fs.existsSync(activePort)) {
        chromePort = Number(fs.readFileSync(activePort, "utf8").split(/\r?\n/)[0]);
        break;
      }
      if (chrome.exitCode !== null) throw new Error("Browser exited early");
      await sleep(100);
    }
    if (!chromePort) throw new Error("Browser debugging endpoint unavailable");
    const targets = await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();
    const page = targets.find((target) => target.type === "page");
    assert.ok(page, "No browser page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
    };
    async function evaluate(expression) {
      const requestId = ++id;
      const result = await Promise.race([
        new Promise((resolve, reject) => {
          pending.set(requestId, { resolve, reject });
          ws.send(JSON.stringify({ id: requestId, method: "Runtime.evaluate",
            params: { expression, awaitPromise: true, returnByValue: true } }));
        }),
        sleep(25000).then(() => { throw new Error("Browser test timeout"); })
      ]);
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      }
      return result.result.value;
    }
    let loaded = false;
    for (let i = 0; i < 70; i++) {
      loaded = await evaluate("document.readyState === 'complete' && !!document.querySelector('#grid .card')");
      if (loaded) break;
      await sleep(100);
    }
    assert.ok(loaded, "Gallery did not initialize");
    const details = await evaluate(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const get = (id) => document.getElementById(id);
      get("type-depth").click();
      if (get("type-depth").getAttribute("aria-pressed") !== "true") throw Error("Depth tab inactive");
      const first = document.querySelector("#grid .card");
      if (!first || !first.querySelector("img").src.includes("/img/depth/thumbs/")) throw Error("Depth thumbnails absent");
      first.click();
      await get("largeImage").decode();
      const depthID = get("imageId").textContent.split(" · ")[0];
      if (!get("largeImage").src.includes("/img/depth/original/")) throw Error("Depth original absent");
      get("toggle-pose-depth").click();
      if (get("type-pose").getAttribute("aria-pressed") !== "true") throw Error("Pose switch failed");
      if (get("imageId").textContent.split(" · ")[0] !== depthID) throw Error("Pose ID mismatch");
      get("toggle-pose-depth").click();
      if (get("imageId").textContent.split(" · ")[0] !== depthID) throw Error("Depth ID mismatch");
      const toggleStyle = getComputedStyle(get("toggle-pose-depth"));
      if (toggleStyle.borderRadius === "0px" || toggleStyle.backgroundColor === "rgba(0, 0, 0, 0)")
        throw Error("Gallery toggle has no button style");
      get("add-to-compose").click();
      if (!get("compose-reference-depth").checked) throw Error("Depth mode not selected");
      if (get("compose-reference-picker")) throw Error("Standalone Depth toolbar still occupies a row");
      if (!get("compose-reference-depth").closest(".compose-editor")) throw Error("Reference switch must be inside composition settings");
      if (!get("compose-reference-depth-label").textContent.includes("Depth") ||
          !get("compose-reference-depth-label").textContent.includes("代替姿势图"))
        throw Error("Reference switch does not explain that Depth replaces the pose");
      if (get("compose-reference-depth").getClientRects().length === 0 ||
          get("compose-reference-depth-label").getClientRects().length === 0)
        throw Error("Depth control is not visible in reference mode");
      if (get("compose-pose-id").textContent !== depthID) throw Error("Depth not shown in shared slot");
      if (!get("compose-pose-preview").querySelector("img").src.includes("/img/depth/thumbs/")) throw Error("Depth thumbnail absent");
      if (document.querySelectorAll("#compose-workbench .compose-slot").length !== 2) throw Error("Pose and Depth not unified");
      get("compose-reference-depth").click();
      if (!get("compose-pose-preview").querySelector("img").src.includes("/img/pose/")) throw Error("Pose mode did not update reference");
      get("compose-reference-depth").click();
      if (!get("compose-pose-preview").querySelector("img").src.includes("/img/depth/thumbs/")) throw Error("Returning to Depth failed");
      if (getComputedStyle(get("compose-reference-depth")).accentColor === "auto")
        throw Error("Reference switch missing checkbox style");
      get("type-costume").click();
      document.querySelector("#grid .card").click();
      get("add-to-compose").click();
      if (get("compose-open-preview").disabled) throw Error("Composition incomplete");
      get("compose-open-preview").click();
      let previewOK = false;
      for (let n=0;n<40;n++){ if(get("compose-placeholder").hidden){previewOK=true;break;} await wait(200); }
      if (!previewOK) throw Error("Preview was not generated: " + get("compose-placeholder").textContent);
      const width = get("compose-canvas").width;
      get("compose-preview-close").click();
      get("compose-mode-four").click();
      if (get("compose-grid-use-depth").closest(".compose-grid-sidebar") === null)
        throw Error("Grid switch not inside the settings sidebar");
      if (!get("compose-grid-use-depth").checked) throw Error("Grid switch lost shared mode");
      const cell = document.querySelector("#compose-grid-tiles .compose-grid-tile");
      if (!cell || !cell.querySelector("img").src.includes("/img/depth/thumbs/")) throw Error("Depth grid not active");
      get("compose-mode-nine").click();
      if (document.querySelectorAll("#compose-grid-tiles .compose-grid-tile").length !== 9)
        throw Error("Nine-grid missing cells");
      if (!document.querySelector("#compose-grid-tiles .compose-grid-tile img").src.includes("/img/depth/thumbs/"))
        throw Error("Nine-grid depth not shared");
      get("compose-grid-use-depth").click();
      if (!document.querySelector("#compose-grid-tiles .compose-grid-tile img").src.includes("/img/pose/"))
        throw Error("Nine-grid did not update after shared toggle");
      get("compose-mode-reference").click();
      if (get("compose-reference-depth").checked) throw Error("Reference toggle did not sync from grid");
      if (get("compose-pose-preview").querySelector("img").src.includes("/img/depth/"))
        throw Error("Reference mode not preserved after switching back");
      get("compose-reference-depth").click();
      if (!get("compose-pose-preview").querySelector("img").src.includes("/img/depth/"))
        throw Error("Reference depth not restored");
      // Uploaded Depth occupies the SAME first slot, not an additional card.
      const sample = document.createElement("canvas");
      sample.width = sample.height = 24;
      sample.getContext("2d").fillRect(0,0,24,24);
      const sampleBlob = await new Promise((resolve) => sample.toBlob(resolve,"image/png"));
      const upload = new File([sampleBlob], "uploaded-depth.png", {type:"image/png"});
      const transfer = new DataTransfer();
      transfer.items.add(upload);
      get("compose-depth-input").files = transfer.files;
      get("compose-depth-input").dispatchEvent(new Event("change", {bubbles:true}));
      let customReady = false;
      for (let n=0;n<30;n++){
        if(get("compose-pose-id").textContent === "uploaded-depth.png"){customReady=true;break;}
        await wait(100);
      }
      if (!customReady) throw Error("Uploaded depth did not replace the first reference");
      if (!get("compose-pose-preview").querySelector("img").src.startsWith("blob:"))
        throw Error("Uploaded depth image was not displayed");
      if (document.querySelectorAll("#compose-workbench .compose-slot").length !== 2)
        throw Error("Uploading depth created an extra reference slot");
      get("compose-remove-depth").click();
      if (!get("compose-pose-preview").querySelector("img").src.includes("/img/depth/"))
        throw Error("Removing uploaded depth did not restore matched depth");
      const raw = await ReferenceComposition.exportDepthOriginal({id:depthID,
        original:"img/depth/original/"+depthID+".png"});
      if (raw.type !== "image/png") throw Error("Depth original not PNG");
      return {depthID,compositionWidth:width,depthBytes:raw.size,
        count:get("counts").textContent,gridItems:9};
    })()`);
    assert.equal(details.gridItems, 9);
    assert.ok(details.compositionWidth > 0);
    assert.ok(details.depthBytes > 1000);
    assert.ok(details.count.includes("5784") || details.count.includes("5,784"));
    console.log("Depth browser smoke passed:", details);
  } finally {
    ws?.close();
    chrome?.kill();
    server.kill();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); }
    catch (_) {}
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
