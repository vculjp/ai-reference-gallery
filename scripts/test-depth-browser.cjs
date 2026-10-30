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
        sleep(120000).then(() => { throw new Error("Browser test timeout"); })
      ]);
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      }
      return result.result.value;
    }
    async function chromeCommand(method, params) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(requestId, {resolve, reject});
        ws.send(JSON.stringify({id: requestId, method, params}));
      });
    }
    let loaded = false;
    for (let i = 0; i < 70; i++) {
      loaded = await evaluate("document.readyState === 'complete' && !!document.querySelector('#grid .card')");
      if (loaded) break;
      await sleep(100);
    }
    assert.ok(loaded, "Gallery did not initialize");
    // Regression: the undo toolbar must span a separate row, not an image column.
    for (const width of [1440, 960, 390]) {
      await chromeCommand("Emulation.setDeviceMetricsOverride",
        {width, height:900, deviceScaleFactor:1, mobile:false});
      const boxes = await evaluate(`(() => {
        document.getElementById("type-compose").click();
        const rect = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return {x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height};
        };
        return {
          toolbar:rect(".compose-reference-toolbar"),
          panel:rect(".compose-workbench"),
          pose:rect(".compose-selection .compose-slot:first-child"),
          outfit:rect(".compose-selection .compose-slot:last-child"),
          editor:rect(".compose-editor"),
          poseImage:rect("#compose-pose-preview"),
          poseActions:rect(".compose-selection .compose-slot:first-child .compose-slot-actions"),
          docWidth:document.documentElement.scrollWidth
        };
      })()`);
      const {toolbar, panel, pose, outfit, editor, poseImage, poseActions, docWidth} = boxes;
      assert.ok(toolbar.bottom <= pose.y + 2 && toolbar.bottom <= outfit.y + 2 &&
        toolbar.bottom <= editor.y + 2, `Toolbar overlaps cards at ${width}: ${JSON.stringify(boxes)}`);
      assert.ok(pose.width > 190 && outfit.width > 190 && editor.width > 190 &&
        pose.x >= panel.x - 2 && pose.right <= panel.right + 2 &&
        outfit.right <= panel.right + 2 && editor.right <= panel.right + 2 &&
        docWidth <= width + 4, `Card overflow at ${width}: ${JSON.stringify(boxes)}`);
      assert.ok(poseImage.height <= 425 && poseActions.y >= poseImage.bottom &&
        poseActions.bottom <= pose.bottom + 2,
        `Preview stretched and displaced its controls at ${width}: ${JSON.stringify(boxes)}`);
      if (width > 1020) {
        assert.ok(pose.y === outfit.y && pose.y === editor.y &&
          pose.right < outfit.x && outfit.right < editor.x,
          `Desktop cards should align in three columns: ${JSON.stringify(boxes)}`);
      } else if (width > 560) {
        assert.ok(pose.y === outfit.y && pose.right < outfit.x &&
          editor.y >= pose.bottom && editor.y >= outfit.bottom,
          `Tablet cards should appear above editor: ${JSON.stringify(boxes)}`);
      } else {
        assert.ok(outfit.y >= pose.bottom && editor.y >= outfit.bottom,
          `Mobile cards should stack vertically: ${JSON.stringify(boxes)}`);
      }
    }
    await chromeCommand("Emulation.clearDeviceMetricsOverride", {});
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
      if (get("compose-prompt-mode").value !== "normal")
        throw Error("Default reference prompt incorrectly requires professional Depth conditioning");
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
      const refOutfit = get("compose-costume-id").textContent;
      get("compose-lock-pose").click();
      if (get("compose-random-pose").disabled !== true ||
          get("compose-lock-pose").getAttribute("aria-pressed")!=="true")
        throw Error("Reference pose lock did not disable its controls");
      get("compose-random-pair").click();
      if (get("compose-pose-id").textContent!==depthID)
        throw Error("Locked reference pose changed during pair shuffle");
      get("compose-reference-undo").click();
      if (get("compose-costume-id").textContent!==refOutfit)
        throw Error("Reference undo failed to restore outfit");
      get("compose-lock-pose").click();
      const uploadPoseCanvas=document.createElement("canvas");
      uploadPoseCanvas.width=uploadPoseCanvas.height=32;
      uploadPoseCanvas.getContext("2d").fillRect(0,0,32,32);
      const uploadPoseBlob=await new Promise(resolve=>uploadPoseCanvas.toBlob(resolve,"image/png"));
      const poseTransfer=new DataTransfer();
      poseTransfer.items.add(new File([uploadPoseBlob],"reference-personal-pose.png",{type:"image/png"}));
      get("compose-pose-input").files=poseTransfer.files;
      get("compose-pose-input").dispatchEvent(new Event("change",{bubbles:true}));
      for (let n=0;n<50 && get("compose-pose-id").textContent!=="reference-personal-pose.png";n++) await wait(100);
      if (get("compose-pose-id").textContent!=="reference-personal-pose.png" ||
          !get("compose-pose-preview").querySelector("img").src.startsWith("blob:"))
        throw Error("Reference custom pose upload did not update composition");
      if (get("compose-prompt-text").value.includes("ControlNet"))
        throw Error("Uploaded reference pose incorrectly requires depth conditioning");
      get("compose-reference-undo").click();
      if (get("compose-pose-id").textContent!==depthID)
        throw Error("Reference undo did not restore original Depth");
      if (/ControlNet|原始 Depth PNG/.test(get("compose-prompt-text").value))
        throw Error("Default reference prompt incorrectly requires professional Depth conditioning");
      get("compose-prompt-mode").value = "professional";
      get("compose-prompt-mode").dispatchEvent(new Event("change", {bubbles:true}));
      if (!/ControlNet/.test(get("compose-prompt-text").value))
        throw Error("Professional reference prompt does not explain Depth controls");
      get("compose-prompt-mode").value = "normal";
      get("compose-prompt-mode").dispatchEvent(new Event("change", {bubbles:true}));
      get("compose-open-preview").click();
      let previewOK = false;
      for (let n=0;n<40;n++){ if(get("compose-placeholder").hidden){previewOK=true;break;} await wait(200); }
      if (!previewOK) throw Error("Preview was not generated: " + get("compose-placeholder").textContent);
      const width = get("compose-canvas").width;
      get("compose-preview-close").click();
      get("compose-mode-four").click();
      const originalClick = HTMLAnchorElement.prototype.click;
      window.__panelArchives = [];
      window.__singleDownloads = [];
      HTMLAnchorElement.prototype.click = function() {
        if (this.download?.endsWith(".zip")) {
          const name = this.download;
          window.__panelArchives.push({name, ready:fetch(this.href).then(r=>r.blob())});
        } else if (this.download?.endsWith("_reference.png")) {
          window.__singleDownloads.push({name:this.download, ready:fetch(this.href).then(r=>r.blob())});
        } else originalClick.call(this);
      };
      const readZip = async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const view = new DataView(bytes.buffer);
        let offset = 0, entries = [];
        while (view.getUint32(offset, true) === 0x04034b50) {
          const len = view.getUint16(offset + 26, true);
          const extra = view.getUint16(offset + 28, true);
          const size = view.getUint32(offset + 18, true);
          const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + len));
          const start = offset + 30 + len + extra;
          entries.push({name, size, data:bytes.slice(start,start+size)});
          offset = start + size;
        }
        if (view.getUint32(offset, true) !== 0x02014b50)
          throw Error("Invalid ZIP central directory");
        return entries;
      };
      const exportZip = async (expected) => {
        const previous = window.__panelArchives.length;
        get("compose-grid-download-panels").click();
        for (let n = 0; n < 900; n++) {
          if (window.__panelArchives.length > previous) break;
          await wait(100);
        }
        if (window.__panelArchives.length <= previous)
          throw Error("Per-panel ZIP not downloaded: "+get("compose-grid-status").textContent);
        const info = window.__panelArchives.at(-1);
        const entries = await readZip(await info.ready);
        if (entries.length !== expected) throw Error("Wrong ZIP entry count: "+entries.length+" / "+expected);
        for (const entry of entries.filter(x=>x.name.endsWith(".png"))) {
          if (entry.data.slice(0,8).join(",") !== "137,80,78,71,13,10,26,10")
            throw Error("Invalid PNG in ZIP: "+entry.name);
        }
        return {name:info.name,entries};
      };
      if (get("compose-grid-use-depth").closest(".compose-grid-sidebar") === null)
        throw Error("Grid switch not inside the settings sidebar");
      if (!get("compose-grid-use-depth").checked) throw Error("Grid switch lost shared mode");
      if (get("compose-grid-prompt-mode").value !== "normal" ||
          /ControlNet|原始 Depth PNG/.test(get("compose-grid-prompt-text").value))
        throw Error("Default grid prompt requests unavailable professional Depth functionality");
      const standard = await exportZip(5);
      if (!standard.entries.some(x=>x.name==="04_reference.png") ||
          standard.entries.some(x=>x.name.endsWith("_depth.png")))
        throw Error("Standard ZIP should contain four independent reference boards only");
      get("compose-grid-prompt-mode").value = "professional";
      get("compose-grid-prompt-mode").dispatchEvent(new Event("change", {bubbles:true}));
      if (!/ControlNet/.test(get("compose-grid-prompt-text").value))
        throw Error("Professional grid prompt does not explain Depth conditioning");
      const professional = await exportZip(9);
      const originalDepthBytes = new Uint8Array(await
        ReferenceComposition.exportDepthOriginal({
          original:"img/depth/original/"+document.querySelector("#compose-grid-tiles img").alt+".png"
        }).then(x=>x.arrayBuffer()));
      const packedDepth = professional.entries.find(x=>x.name==="01_depth.png");
      if (!packedDepth || packedDepth.data.length !== originalDepthBytes.length ||
          packedDepth.data.some((byte,i)=>byte !== originalDepthBytes[i]))
        throw Error("Professional ZIP does not contain untouched Depth originals");
      if (professional.entries.filter(x=>x.name.endsWith("_depth.png")).length!==4)
        throw Error("Professional ZIP lacks four Depth files");
      const cell = document.querySelector("#compose-grid-tiles .compose-grid-tile");
      if (!cell || !cell.querySelector("img").src.includes("/img/depth/thumbs/")) throw Error("Depth grid not active");
      const tiles = () => [...document.querySelectorAll("#compose-grid-tiles .compose-grid-tile")];
      const images = (index) => [...tiles()[index].querySelectorAll("img")].map(img => img.alt);
      if (tiles().length!==4 || tiles().some(tile =>
        tile.querySelectorAll(".compose-grid-image-column").length!==2 ||
        tile.querySelectorAll(".compose-grid-pill").length!==6 ||
        tile.querySelectorAll(".compose-grid-lock").length!==2 ||
        !tile.querySelector(".compose-grid-detail-link")))
        throw Error("Missing independent pose/outfit controls, locks or single-board tools");
      for (const tile of tiles()) {
        const heading = tile.querySelector(".compose-grid-tile-head");
        const details = heading.querySelector(".compose-grid-detail-link");
        const controls = heading.querySelectorAll(".compose-grid-icon-button");
        if (!details || !details.textContent.includes("单格预览与提示词") ||
            heading.textContent.includes("第 1 格") ||
            tile.querySelector(".compose-grid-tile-foot") ||
            controls.length !== 2 || [...controls].some(button =>
              button.textContent.trim() || !button.querySelector("svg[aria-hidden='true']")) ||
            [...tile.querySelectorAll(".compose-grid-lock")].some(button =>
              button.textContent.trim() || !button.querySelector("svg[aria-hidden='true']")))
          throw Error("Grid header/lock icons did not replace the redundant text and emojis");
        const detailBounds = details.getBoundingClientRect();
        const toolsBounds = heading.querySelector(".compose-grid-tile-tools").getBoundingClientRect();
        if (detailBounds.right > toolsBounds.left + 1)
          throw Error("Grid header preview label overlaps the icon actions");
      }
      tiles()[0].querySelector(".compose-grid-pair-lock").click();
      if (tiles()[0].querySelector(".compose-grid-pair-lock").getAttribute("aria-pressed")!=="true" ||
          !tiles()[0].querySelector(".compose-grid-reroll-pair").disabled ||
          [...tiles()[0].querySelectorAll(".compose-grid-lock")].some(button =>
            button.getAttribute("aria-pressed")!=="true"))
        throw Error("Icon-only whole-pair lock did not lock both image references");
      tiles()[0].querySelector(".compose-grid-pair-lock").click();
      if (tiles()[0].querySelector(".compose-grid-reroll-pair").disabled)
        throw Error("Whole-pair unlock did not restore the reroll icon action");
      const beforeEdit = images(0);
      const untouched = images(1);
      tiles()[0].querySelectorAll(".compose-grid-pill")[1].click();
      if (images(0)[0]===beforeEdit[0] || images(0)[1]!==beforeEdit[1] ||
          images(1).some((x,i)=>x!==untouched[i]))
        throw Error("Individual pose randomization altered another image");
      get("compose-grid-undo").click();
      if (images(0).some((x,i)=>x!==beforeEdit[i]))
        throw Error("Undo did not restore previous pose");
      const locks = tiles()[0].querySelectorAll(".compose-grid-lock");
      locks[0].click();
      const lockedPose = images(0)[0];
      tiles()[0].querySelector(".compose-grid-reroll-pair").click();
      if (images(0)[0]!==lockedPose || images(0)[1]===beforeEdit[1])
        throw Error("Pose lock failed to preserve pose during pair reroll");
      get("compose-grid-undo").click();
      if (images(0)[1]!==beforeEdit[1] ||
          tiles()[0].querySelector(".compose-grid-lock").getAttribute("aria-pressed")!=="true")
        throw Error("Undo of pair reroll failed");
      tiles()[0].querySelector(".compose-grid-lock").click();
      tiles()[0].querySelectorAll(".compose-grid-pill")[0].click();
      if (get("compose-grid-dialog").hidden) throw Error("Catalog chooser did not open");
      get("compose-grid-dialog-search").value="full_single_P020_front";
      get("compose-grid-dialog-search").dispatchEvent(new Event("input",{bubbles:true}));
      const candidate=document.querySelector("#compose-grid-dialog-items .compose-grid-picker-item:not(:disabled)");
      if (!candidate) throw Error("Catalog search has no selectable candidate");
      const selected=candidate.querySelector("span").textContent;
      candidate.click();
      if (images(0)[0]!==selected || images(0)[1]!==beforeEdit[1] ||
          !get("compose-grid-dialog").hidden)
        throw Error("Catalog selection changed unrelated outfit or did not close");
      const canvasUpload=document.createElement("canvas");
      canvasUpload.width=canvasUpload.height=30;
      canvasUpload.getContext("2d").fillRect(0,0,30,30);
      const fileBlob=await new Promise(resolve=>canvasUpload.toBlob(resolve,"image/png"));
      const custom=new File([fileBlob],"personal-outfit.png",{type:"image/png"});
      const uploadButton=tiles()[0].querySelectorAll(".compose-grid-pill")[5];
      uploadButton.click();
      const transferUpload=new DataTransfer();
      transferUpload.items.add(custom);
      get("compose-grid-image-input").files=transferUpload.files;
      get("compose-grid-image-input").dispatchEvent(new Event("change",{bubbles:true}));
      for(let i=0;i<40 && images(0)[1]!=="personal-outfit.png";i++) await wait(100);
      if (images(0)[1]!=="personal-outfit.png" ||
          !get("compose-grid-prompt-text").value.includes("personal-outfit.png"))
        throw Error("Custom outfit upload did not change only this cell and prompt");
      const uploadedZip=await exportZip(9);
      if (!uploadedZip.entries.some(x=>x.name==="01_reference.png"))
        throw Error("Custom upload broke professional grid export");
      tiles()[0].querySelector(".compose-grid-detail-link").click();
      for(let i=0;i<60 && !get("compose-grid-single-canvas").width;i++) await wait(100);
      if (get("compose-grid-single-dialog").hidden ||
          !get("compose-grid-single-prompt").value.includes("personal-outfit.png") ||
          get("compose-grid-single-canvas").width<100)
        throw Error("Independent prompt or preview missing uploaded selection");
      get("compose-grid-single-download").click();
      for(let i=0;i<80 && !window.__singleDownloads.length;i++) await wait(100);
      if (!window.__singleDownloads.length ||
          window.__singleDownloads.at(-1).name!=="01_reference.png" ||
          (await window.__singleDownloads.at(-1).ready).size<1000)
        throw Error("Single-cell HD PNG download failed");
      get("compose-grid-single-close").click();
      if (!get("compose-grid-single-dialog").hidden) throw Error("Single preview did not close");
      get("compose-mode-nine").click();
      if (document.querySelectorAll("#compose-grid-tiles .compose-grid-tile").length !== 9)
        throw Error("Nine-grid missing cells");
      if (tiles().some(tile =>
        tile.querySelectorAll(".compose-grid-pill").length!==6 ||
        tile.querySelectorAll(".compose-grid-lock").length!==2 ||
        !tile.querySelector(".compose-grid-tile-head .compose-grid-detail-link") ||
        tile.querySelectorAll(".compose-grid-tile-head .compose-grid-icon-button").length!==2))
        throw Error("Nine-grid missing independent edit/lock/prompt controls");
      get("compose-grid-prompt-mode").value = "normal";
      get("compose-grid-prompt-mode").dispatchEvent(new Event("change", {bubbles:true}));
      const nineZip = await exportZip(10);
      if (!nineZip.entries.some(x=>x.name==="09_reference.png"))
        throw Error("Nine-grid individual export missing ninth reference");
      if (tiles().length!==9 || tiles().some(tile =>
        tile.querySelectorAll(".compose-grid-pill").length!==6))
        throw Error("Nine-grid is missing per-image controls");
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
    await chromeCommand("Emulation.setDeviceMetricsOverride", {
      width:390, height:850, deviceScaleFactor:1, mobile:false
    });
    const mobileGridHeader = await evaluate(`(() => {
      document.getElementById("compose-mode-nine").click();
      const tile = document.querySelector("#compose-grid-tiles .compose-grid-tile");
      const details = tile.querySelector(".compose-grid-detail-link");
      const actions = tile.querySelector(".compose-grid-tile-tools");
      const box = element => element.getBoundingClientRect();
      return {
        tile:{left:box(tile).left, right:box(tile).right},
        details:{left:box(details).left, right:box(details).right},
        actions:{left:box(actions).left, right:box(actions).right},
        twoRows:box(actions).top >= box(details).bottom - 1
      };
    })()`);
    if (!mobileGridHeader.twoRows ||
        mobileGridHeader.details.right > mobileGridHeader.tile.right + 1 ||
        mobileGridHeader.actions.right > mobileGridHeader.tile.right + 1)
      throw Error("Nine-grid header overflows on mobile: " + JSON.stringify(mobileGridHeader));
    await chromeCommand("Emulation.clearDeviceMetricsOverride", {});
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
