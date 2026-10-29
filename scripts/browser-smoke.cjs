"use strict";

// Optional end-to-end smoke test. Uses an installed Chrome/Edge and Node.js 22+;
// never needed by the website itself.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
];
const browser = candidates.find((file) => file && fs.existsSync(file));
if (!browser) throw new Error("Chrome or Edge is required for this optional test");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reference-gallery-smoke-"));
const galleryUrl = process.env.GALLERY_TEST_URL || pathToFileURL(path.join(__dirname, "..", "index.html")).href;
const chrome = spawn(browser, [
  "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-gpu", "--no-sandbox", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  galleryUrl
], { stdio: "ignore" });

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function main() {
  let port;
  for (let i = 0; i < 60; i++) {
    const file = path.join(profile, "DevToolsActivePort");
    if (fs.existsSync(file)) {
      try {
        port = +fs.readFileSync(file, "utf8").split("\n")[0];
        if (port) break;
      } catch (error) {
        if (!["EBUSY", "EACCES", "ENOENT"].includes(error.code)) throw error;
      }
    }
    if (chrome.exitCode !== null) throw new Error(`Browser exited: ${chrome.exitCode}`);
    await sleep(100);
  }
  if (!port) throw new Error("Browser did not enable debugging");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((p) => p.type === "page");
  assert.ok(page, "Missing browser tab");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const pending = new Map();
  let serial = 0;
  ws.onmessage = (message) => {
    const response = JSON.parse(message.data);
    if (!pending.has(response.id)) return;
    const [resolve, reject] = pending.get(response.id);
    pending.delete(response.id);
    if (response.error) reject(new Error(response.error.message));
    else resolve(response.result);
  };
  function command(method, params) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      pending.set(id, [resolve, reject]);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evalJs(expression) {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text);
    }
    return result.result.value;
  }
  for (let i = 0; i < 80 && await evalJs("document.querySelectorAll('.card').length") !== 60; i++) await sleep(100);
  assert.equal(await evalJs("document.querySelectorAll('.card').length"), 60);
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });
  assert.match(await evalJs("document.querySelector('#counts').textContent"), /2846/);
  assert.equal(await evalJs("getComputedStyle(document.body).backgroundColor"), "rgb(245, 245, 247)");
  assert.equal(await evalJs("document.querySelector('#tagline').textContent"), "灵感，从这里开始。");
  // Random drawing must work directly on an empty composition, without visiting either gallery.
  await evalJs("document.querySelector('#type-compose').click()");
  assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-open-preview').disabled"), true);
  const compactActions = await evalJs(`(()=>{
    const copy=document.querySelector('#compose-copy-image').getBoundingClientRect();
    const download=document.querySelector('#compose-download').getBoundingClientRect();
    const preview=document.querySelector('#compose-open-preview').getBoundingClientRect();
    return {copyBottom:copy.bottom,downloadBottom:download.bottom,
      previewBottom:preview.bottom,visibleHeight:innerHeight};
  })()`);
  assert.ok(compactActions.previewBottom < compactActions.visibleHeight,
    "The preview trigger should be accessible on a 1440×900 desktop viewport");
  await evalJs("document.querySelector('#compose-random-pair').click()");
  const desktopLayout = await evalJs(`(()=>{
    const pos=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
    return {workbench:pos('.compose-workbench'),
      first:pos('.compose-selection .compose-slot:first-child'),
      second:pos('.compose-selection .compose-slot:nth-of-type(2)'),
      editor:pos('.compose-editor'),cover:pos('#compose-pose-preview'),
      personInside:document.querySelector('.compose-editor').contains(document.querySelector('.compose-person-slot')),
      overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  assert.equal(desktopLayout.overflow, false);
  assert.ok(desktopLayout.first.w > desktopLayout.workbench.w * .29 &&
    desktopLayout.first.w < desktopLayout.workbench.w * .34,
    "Pose, outfit and composition settings should each occupy one third of the workbench");
  assert.ok(Math.abs(desktopLayout.first.w - desktopLayout.second.w) < 2 &&
    Math.abs(desktopLayout.first.w - desktopLayout.editor.w) < 2,
    "All three cards must be equal width");
  assert.ok(Math.abs(desktopLayout.first.h - desktopLayout.second.h) < 2 &&
    Math.abs(desktopLayout.first.h - desktopLayout.editor.h) < 2,
    "All three cards must be equal height");
  assert.ok(desktopLayout.second.x >= desktopLayout.first.right - 1 &&
    desktopLayout.editor.x >= desktopLayout.second.right - 1,
    "Cards should appear side by side in pose / outfit / settings order");
  assert.ok(Math.abs(desktopLayout.editor.y - desktopLayout.first.y) < 2 &&
    Math.abs(desktopLayout.second.y - desktopLayout.first.y) < 2,
    "The three cards must share a top edge");
  assert.equal(desktopLayout.personInside, true, "Person reference belongs inside composition settings");
  assert.ok(desktopLayout.cover.h >= 240, "Pose preview should use most of its card instead of wasting space");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 900, height: 800, deviceScaleFactor: 1, mobile: false
  });
  const compactLayout = await evalJs(`(()=>{
    const bounds=selector=>document.querySelector(selector).getBoundingClientRect();
    const pose=bounds('.compose-selection .compose-slot:first-child');
    const outfit=bounds('.compose-selection .compose-slot:nth-of-type(2)');
    const settings=bounds('.compose-editor');
    return {sideBySide:outfit.left>=pose.right-1,
      settingsBelow:settings.top>=Math.max(pose.bottom,outfit.bottom)-1,
      fullWidth:Math.abs(settings.width-(outfit.right-pose.left))<2,
      noOverflow:document.documentElement.scrollWidth<=innerWidth};
  })()`);
  assert.equal(compactLayout.sideBySide, true);
  assert.equal(compactLayout.settingsBelow, true);
  assert.equal(compactLayout.fullWidth, true);
  assert.equal(compactLayout.noOverflow, true);
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });
  assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-canvas').width"), 1200);
  await evalJs("document.querySelector('#compose-open-preview').click()");
  assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), false);
  await evalJs("new Promise(r=>setTimeout(r,600))");
  assert.equal(await evalJs("document.querySelector('#compose-placeholder').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-preview-dialog').contains(document.activeElement)"), true);
  const popupLayout = await evalJs(`(()=>{
    const modal=document.querySelector('#compose-preview-dialog').getBoundingClientRect();
    const artwork=document.querySelector('#compose-canvas').getBoundingClientRect();
    const stage=document.querySelector('.compose-preview-stage').getBoundingClientRect();
    return [modal.width,artwork.width,artwork.height,stage.width,
      artwork.width / Math.max(1,stage.width),modal.right<=innerWidth,modal.height<=innerHeight,
      artwork.height/stage.height];
  })()`);
  assert.ok(popupLayout[4] > .85, "Large preview should closely fit artwork without wide side gutters");
  assert.ok(popupLayout[7] > .9, "Preview stage should fit vertically as well");
  assert.equal(popupLayout[5], true);
  assert.equal(popupLayout[6], true);
  assert.equal(await evalJs("document.querySelector('#compose-preview-copy').disabled"), false);
  assert.equal(await evalJs("document.querySelector('#compose-preview-download').disabled"), false);
  await evalJs("document.querySelector('#compose-preview-close').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}))");
  assert.equal(await evalJs("document.activeElement.id"), "compose-preview-copy");
  await evalJs("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), true);
  assert.equal(await evalJs("document.activeElement.id"), "compose-open-preview");
  const adaptiveCanvas = await evalJs(`(async()=>{
    const urls=[];
    try {
      for (const color of ['#e43b3b','#306fff']) {
        const image=document.createElement('canvas');
        image.width=90; image.height=180;
        const ctx=image.getContext('2d'); ctx.fillStyle=color;ctx.fillRect(0,0,90,180);
        const blob=await new Promise(resolve=>image.toBlob(resolve,'image/png'));
        urls.push(URL.createObjectURL(blob));
      }
      const options={
        pose:{id:'TEST-POSE',uploadUrl:urls[0]},
        second:{id:'TEST-OUTFIT',uploadUrl:urls[1]},
        background:'white',labels:false
      };
      const preview=document.createElement('canvas');
      await ReferenceComposition.draw(preview,options);
      const full=await ReferenceComposition.exportPNG(options);
      const image=await createImageBitmap(full);
      const ctx=preview.getContext('2d');
      const colorAt=x=>Array.from(ctx.getImageData(Math.floor(x*preview.width),
        Math.floor(preview.height/2),1,1).data).slice(0,3);
      return [preview.width,preview.height,image.width,image.height,colorAt(.25),colorAt(.75)];
    } finally { for(const url of urls) URL.revokeObjectURL(url); }
  })()`);
  assert.ok(adaptiveCanvas[0] / adaptiveCanvas[1] < 1.2,
    "Two tall reference images should not be placed on a fixed 3:2 canvas");
  assert.equal(adaptiveCanvas[2],adaptiveCanvas[0]*2);
  assert.equal(adaptiveCanvas[3],adaptiveCanvas[1]*2);
  assert.ok(adaptiveCanvas[4][0] > adaptiveCanvas[4][2]);
  assert.ok(adaptiveCanvas[5][2] > adaptiveCanvas[5][0]);
  // Four / nine grid: real UI switching, unique selections and per-cell reroll.
  await evalJs("document.querySelector('#compose-mode-four').click()");
  assert.equal(await evalJs("document.querySelector('#compose-workbench').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-grid-panel').hidden"), false);
  assert.equal(await evalJs("state.composition.gridItems.length"), 4);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"), 4);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.outfit.id)).size"), 4);
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile').length"), 4);
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile img').length"), 8);
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile-code').length"), 8);
  assert.equal(await evalJs("document.querySelector('#compose-grid-preview').disabled"), false);
  const firstGrid = await evalJs("state.composition.gridItems.map(x=>[x.pose.pose_key,x.outfit.id])");
  await evalJs("document.querySelector('.compose-grid-tile').click()");
  assert.notDeepEqual(await evalJs("[state.composition.gridItems[0].pose.pose_key,state.composition.gridItems[0].outfit.id]"), firstGrid[0]);
  assert.notEqual(await evalJs("state.composition.gridItems[0].pose.pose_key"), firstGrid[0][0]);
  assert.notEqual(await evalJs("state.composition.gridItems[0].outfit.id"), firstGrid[0][1]);
  assert.deepEqual(await evalJs("state.composition.gridItems.slice(1).map(x=>[x.pose.pose_key,x.outfit.id])"), firstGrid.slice(1));
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"), 4);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.outfit.id)).size"), 4);
  await evalJs("document.querySelector('#compose-grid-shuffle').click()");
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"), 4);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.outfit.id)).size"), 4);
  await evalJs("document.querySelector('#compose-mode-nine').click()");
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile').length"), 9);
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile img').length"), 18);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"), 9);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.outfit.id)).size"), 9);
  const priorNine = await evalJs("state.composition.gridItems.map(x=>[x.pose.pose_key,x.outfit.id])");
  await evalJs("document.querySelector('#compose-grid-shuffle').click()");
  assert.equal(await evalJs(`state.composition.gridItems.every(x=>
    !${JSON.stringify(priorNine)}.some(previous=>previous[0]===x.pose.pose_key || previous[1]===x.outfit.id))`),true,
    "A full reroll should avoid prior pose groups and outfits when enough alternatives exist");
  await evalJs("document.querySelector('#compose-random-outfit-filter').value='spring';document.querySelector('#compose-random-outfit-filter').dispatchEvent(new Event('change'))");
  assert.equal(await evalJs("state.composition.gridItems.every(x=>x.outfit.category==='spring')"),true);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"),9);
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.outfit.id)).size"),9);
  await evalJs("document.querySelector('#compose-random-outfit-filter').value='';document.querySelector('#compose-random-outfit-filter').dispatchEvent(new Event('change'))");
  assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"), 9);
  assert.equal(await evalJs("state.composition.gridItems.every(x=>x.pose.series!=='2人絡み')"), true);
  const scarceCategory = await evalJs(`(()=>{
    const categories=[...document.querySelector('#compose-random-pose-filter').options].map(x=>x.value).filter(Boolean);
    return categories.find(category=>{
      const keys=new Set(state.poseImages.filter(x=>x.category===category&&x.series!=='2人絡み').map(x=>x.pose_key));
      return keys.size>0&&keys.size<9;
    }) || null;
  })()`);
  if(scarceCategory){
    await evalJs(`document.querySelector('#compose-random-pose-filter').value=${JSON.stringify(scarceCategory)};
      document.querySelector('#compose-random-pose-filter').dispatchEvent(new Event('change'))`);
    assert.equal(await evalJs("state.composition.gridItems.length"),0);
    assert.equal(await evalJs("document.querySelector('#compose-grid-download').disabled"),true);
    assert.match(await evalJs("document.querySelector('#compose-grid-status').textContent"),/各至少 9/);
    await evalJs("document.querySelector('#compose-random-pose-filter').value='';document.querySelector('#compose-random-pose-filter').dispatchEvent(new Event('change'))");
    assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"),9);
  }
  await evalJs("document.querySelector('#compose-grid-labels').click()");
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile-code').length"), 0);
  await evalJs("document.querySelector('#compose-grid-labels').click()");
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile-code').length"), 18);
  await evalJs("document.querySelector('#compose-grid-preview').click()");
  for (let i = 0; i < 25 && !(await evalJs("document.querySelector('#compose-placeholder').hidden")); i++) await sleep(150);
  assert.equal(await evalJs("document.querySelector('#compose-canvas').width"), 1080);
  assert.equal(await evalJs("document.querySelector('#compose-canvas').height"), 1080);
  assert.equal(await evalJs("document.querySelector('#compose-preview-size').textContent"), "3072 × 3072 PNG");
  await evalJs("document.querySelector('#compose-preview-close').click()");
  assert.equal(await evalJs("document.activeElement.id"), "compose-grid-preview");
  const gridPixels = await evalJs(`(async()=>{
    const colors=['#ed3131','#33bb44','#315cf0','#eeaf11','#ad44bd','#13b9b9',
      '#444444','#ee77a9','#805533','#ee6500','#26aa99','#9b11f0',
      '#fa2555','#157bdd','#aecc33','#007744','#f07700','#6644a8'];
    const urls=[];
    try {
      for(const color of colors){
        const image=document.createElement('canvas');image.width=100;image.height=150;
        const ctx=image.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,100,150);
        const blob=await new Promise(resolve=>image.toBlob(resolve,'image/png'));
        urls.push(URL.createObjectURL(blob));
      }
      const entries=urls.map((uploadUrl,i)=>({id:'GRID-'+i,uploadUrl}));
      const pairs=Array.from({length:9},(_,i)=>({pose:entries[i*2],outfit:entries[i*2+1]}));
      const four=document.createElement('canvas');
      await ReferenceComposition.draw(four,{mode:'four',items:pairs.slice(0,4),background:'white',labels:false});
      const originalText=CanvasRenderingContext2D.prototype.fillText;
      const paintedCodes=[];
      CanvasRenderingContext2D.prototype.fillText=function(code,...args){
        paintedCodes.push(String(code));
        return originalText.call(this,code,...args);
      };
      try {
        const catalogPairs=pairs.slice(0,4).map(({pose,outfit})=>({
          pose:{id:pose.id,original:pose.uploadUrl},
          outfit:{id:outfit.id,original:outfit.uploadUrl}
        }));
        await ReferenceComposition.draw(document.createElement('canvas'),
          {mode:'four',items:catalogPairs,background:'white',labels:true});
      } finally { CanvasRenderingContext2D.prototype.fillText=originalText; }
      const nine=document.createElement('canvas');
      await ReferenceComposition.draw(nine,{mode:'nine',items:pairs,background:'soft',labels:false});
      const fourBlob=await ReferenceComposition.exportPNG({mode:'four',items:pairs.slice(0,4),background:'white',labels:false});
      const fourBitmap=await createImageBitmap(fourBlob);
      const exported=await ReferenceComposition.exportPNG({mode:'nine',items:pairs,background:'soft',labels:false});
      const actual=await createImageBitmap(exported);
      const ctx=nine.getContext('2d');
      const pixels=[];
      for(let i=0;i<9;i++){
        const y=Math.floor((Math.floor(i/3)+.5)*nine.height/3);
        for(const side of [.25,.75]){
          const x=Math.floor((i%3+side)*nine.width/3);
          pixels.push(Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3));
        }
      }
      const expected=colors.map(code=>[1,3,5].map(j=>parseInt(code.slice(j,j+2),16)));
      const result=[four.width,four.height,nine.width,nine.height,actual.width,actual.height,
        exported.size,pixels,fourBitmap.width,fourBitmap.height,expected,paintedCodes];
      actual.close();
      fourBitmap.close();
      return result;
    } finally {urls.forEach(url=>URL.revokeObjectURL(url));}
  })()`);
  assert.deepEqual(gridPixels.slice(0,6), [720,720,1080,1080,3072,3072]);
  assert.deepEqual(gridPixels.slice(8,10),[2048,2048]);
  assert.ok(gridPixels[6]>10000);
  assert.deepEqual(gridPixels[7],gridPixels[10],
    "Each cell must show its specific pose on the left and outfit on the right");
  assert.deepEqual(gridPixels[11],Array.from({length:8},(_,i)=>'GRID-'+i),
    "Each paired grid cell must render both image IDs in pose/outfit order");
  await evalJs("document.querySelector('#compose-mode-reference').click()");
  assert.equal(await evalJs("document.querySelector('#compose-grid-panel').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-workbench').hidden"), false);
  // Optional person reference: validate fixed left-to-right role order,
  // prompt positions, removal and double-image fallback.
  const threeImages = await evalJs(`(async()=>{
    const colors=['#e52c36','#276eff','#18bb55'];
    const urls=[];
    try {
      for(const color of colors){
        const image=document.createElement('canvas'); image.width=90;image.height=180;
        const context=image.getContext('2d');context.fillStyle=color;context.fillRect(0,0,90,180);
        const blob=await new Promise(r=>image.toBlob(r,'image/png'));
        urls.push(URL.createObjectURL(blob));
      }
      const photo=await (await fetch(urls[2])).blob();
      await composeUI.uploadPersonImage(new File([photo],'person.png',{type:'image/png'}));
      const selected=state.composition.person?.id;
      const prompt=$('compose-prompt-text').value;
      const view=$('compose-person-preview').querySelector('img')?.src;
      const options={pose:{id:'POSE',uploadUrl:urls[0]},
        second:{id:'OUTFIT',uploadUrl:urls[1]},
        person:{id:'PERSON',uploadUrl:urls[2]},
        background:'white',labels:true};
      const drawText=CanvasRenderingContext2D.prototype.fillText;
      const drawnLabels=[];
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){
        drawnLabels.push(String(text));
        return drawText.call(this,text,...args);
      };
      const horizontal=document.createElement('canvas');
      let exported;
      try {
        await ReferenceComposition.draw(horizontal,options);
        exported=await ReferenceComposition.exportPNG(options);
      } finally { CanvasRenderingContext2D.prototype.fillText=drawText; }
      const bitmap=await createImageBitmap(exported);
      const ctx=horizontal.getContext('2d');
      const at=(x,y)=>Array.from(ctx.getImageData(Math.floor(x*horizontal.width),
        Math.floor(y*horizontal.height),1,1).data).slice(0,3);
      $('compose-bg').value='soft';
      $('compose-bg').dispatchEvent(new Event('change'));
      const unchangedPrompt=$('compose-prompt-text').value;
      const invalid=new File(['invalid'],'broken.txt',{type:'text/plain'});
      await composeUI.uploadPersonImage(invalid);
      const kept=state.composition.person?.id;
      composeUI.removePersonImage();
      const cleared=state.composition.person;
      const backToTwo=$('compose-prompt-text').value;
      $('compose-bg').value='white';
      $('compose-bg').dispatchEvent(new Event('change'));
      return {selected,hasPreview:!!view,prompt,unchangedPrompt,kept,cleared,
        backToTwo,threeWidth:horizontal.width,threeHeight:horizontal.height,
        exportWidth:bitmap.width,exportHeight:bitmap.height,
        exportSize:exported.size,drawnLabels,
        horizontalColors:[at(.17,.5),at(.5,.5),at(.83,.5)],
        removedButton:$('compose-remove-person').hidden};
    } finally { urls.forEach(url=>URL.revokeObjectURL(url)); }
  })()`);
  assert.equal(threeImages.selected, "person.png");
  assert.equal(threeImages.hasPreview, true);
  assert.match(threeImages.prompt, /人物参考：画面右侧/);
  assert.match(threeImages.prompt, /姿势参考：画面左侧/);
  assert.match(threeImages.prompt, /服装参考：画面中间/);
  assert.equal(threeImages.unchangedPrompt, threeImages.prompt);
  assert.equal(threeImages.kept, "person.png", "Invalid upload must preserve selected portrait");
  assert.deepEqual(threeImages.drawnLabels, [],
    "Even with labels enabled, three uploaded references must not print fake gallery IDs");
  assert.equal(threeImages.cleared, null);
  assert.equal(threeImages.removedButton, true);
  assert.equal(threeImages.backToTwo.includes("人物参考："), false);
  assert.equal(threeImages.exportWidth, threeImages.threeWidth * 2);
  assert.equal(threeImages.exportHeight, threeImages.threeHeight * 2);
  assert.ok(threeImages.exportSize > 1000);
  for (const [index, sample] of threeImages.horizontalColors.entries()) {
    assert.ok(sample[index === 0 ? 0 : index === 1 ? 2 : 1] > 160,
      `Three-image horizontal panel ${index} has incorrect source color: ${sample}`);
  }
  const initialRandom = await evalJs(`[
    state.composition.pose.pose_key,
    state.composition.second.id,
    state.poseImages.some(x=>x.id===state.composition.pose.id),
    state.costumeImages.some(x=>x.id===state.composition.second.id),
    document.querySelector('#compose-download').disabled,
    document.querySelector('#compose-placeholder').hidden
  ]`);
  assert.equal(initialRandom[2], true);
  assert.equal(initialRandom[3], true);
  assert.equal(initialRandom[4], false);
  assert.equal(initialRandom[5], true);
  await evalJs("document.querySelector('#compose-random-pose').click()");
  assert.notEqual(await evalJs("state.composition.pose.pose_key"), initialRandom[0]);
  assert.equal(await evalJs("state.composition.second.id"), initialRandom[1]);
  const prevPoseGroup = await evalJs("state.composition.pose.pose_key");
  await evalJs("document.querySelector('#compose-random-costume').click()");
  assert.notEqual(await evalJs("state.composition.second.id"), initialRandom[1]);
  assert.equal(await evalJs("state.composition.pose.pose_key"), prevPoseGroup);
  const prevCostumeId = await evalJs("state.composition.second.id");
  await evalJs("document.querySelector('#compose-random-pair').click()");
  assert.notEqual(await evalJs("state.composition.pose.pose_key"), prevPoseGroup);
  assert.notEqual(await evalJs("state.composition.second.id"), prevCostumeId);
  assert.equal(await evalJs("document.querySelector('#compose-pose-id').textContent === state.composition.pose.id"), true);
  assert.equal(await evalJs("document.querySelector('#compose-costume-id').textContent === state.composition.second.id"), true);
  assert.equal(await evalJs("state.composition.pose.series !== '2人絡み'"), true);
  assert.match(await evalJs("document.querySelector('#compose-random-pool-size').textContent"), /组姿势/);
  await evalJs("document.querySelector('#compose-random-outfit-filter').value='spring';document.querySelector('#compose-random-outfit-filter').dispatchEvent(new Event('change'))");
  await evalJs("document.querySelector('#compose-random-pose-filter').value='立ち';document.querySelector('#compose-random-pose-filter').dispatchEvent(new Event('change'))");
  assert.match(await evalJs("document.querySelector('#compose-random-pool-size').textContent"), /215 套服装/);
  for (let i = 0; i < 6; i++) {
    await evalJs("document.querySelector('#compose-random-pair').click()");
    assert.equal(await evalJs("state.composition.second.category"), "spring");
    assert.equal(await evalJs("state.composition.pose.category"), "立ち");
    assert.equal(await evalJs("state.composition.pose.series !== '2人絡み'"), true);
  }
  const filteredOutfit = await evalJs("state.composition.second.id");
  await evalJs("document.querySelector('#compose-random-include-duo').click()");
  assert.equal(await evalJs("document.querySelector('#compose-random-pose-filter').value"), "立ち");
  assert.equal(await evalJs("document.querySelector('#compose-random-include-duo').checked"), true);
  await evalJs("document.querySelector('#compose-random-pose-filter').value='顔寄せ系';document.querySelector('#compose-random-pose-filter').dispatchEvent(new Event('change'))");
  await evalJs("document.querySelector('#compose-random-pose').click()");
  assert.equal(await evalJs("state.composition.pose.series"), "2人絡み");
  assert.equal(await evalJs("state.composition.second.id"), filteredOutfit);
  await evalJs("document.querySelector('#compose-random-include-duo').click()");
  assert.equal(await evalJs("document.querySelector('#compose-random-pose-filter').value"), "");
  await evalJs("document.querySelector('#compose-random-outfit-filter').value='';document.querySelector('#compose-random-outfit-filter').dispatchEvent(new Event('change'))");
  await evalJs("document.querySelector('#compose-random-pair').click()");
  const originalPrompt = await evalJs("document.querySelector('#compose-prompt-text').value");
  assert.match(originalPrompt, /左侧/);
  assert.match(originalPrompt, /右侧/);
  await evalJs("document.querySelector('#compose-prompt-box').open=true");
  assert.equal(await evalJs("document.querySelector('#compose-copy-prompt').disabled"), false);
  await evalJs("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__clipboardText=value}}})");
  await evalJs("document.querySelector('#compose-copy-prompt').onclick()");
  assert.equal(await evalJs("window.__clipboardText"), originalPrompt);
  assert.equal(await evalJs("document.querySelector('#compose-layout')===null && document.querySelector('#compose-swap')===null"), true);
  await evalJs("document.querySelector('#compose-labels').click()");
  assert.equal(await evalJs("document.querySelector('#compose-prompt-text').value"), originalPrompt);
  await evalJs("document.querySelector('#compose-open-preview').click()");
  await evalJs("new Promise(r=>setTimeout(r,600))");
  const portraitLayout = await evalJs(`(()=>{
    const r=document.querySelector('#compose-preview-dialog').getBoundingClientRect();
    const stage=document.querySelector('.compose-preview-stage').getBoundingClientRect();
    return [r.width,r.height,stage.width/stage.height,r.width/innerWidth];
  })()`);
  assert.ok(portraitLayout[2] > 0 && portraitLayout[2] < 2.5,
    "The fixed composition should fit the source ratios without distortion");
  assert.ok(portraitLayout[3] < 1, "The preview dialog should remain within the viewport");
  await evalJs("document.querySelector('#compose-preview-close').click()");
  await evalJs("document.querySelector('#compose-labels').click()");
  await evalJs("document.querySelector('#type-pose').click()");
  assert.equal(await evalJs("document.querySelector('#footer-note').textContent"),
    "ai-reference-gallery · 图片与原始数据版权归原作者ギア所有 · 该版本由 vculjp 整理维护");
  assert.equal(await evalJs("document.querySelector('#github-link').href"), "https://github.com/vculjp/ai-reference-gallery");
  assert.equal(await evalJs("document.querySelector('#x-link').href"), "https://x.com/vculjp");
  // A stale stylesheet makes these links blue, underlined and vertically misaligned online.
  assert.match(await evalJs("getComputedStyle(document.querySelector('#github-link')).display"), /^(?:flex|inline-flex)$/);
  assert.equal(await evalJs("getComputedStyle(document.querySelector('#github-link')).textDecorationLine"), "none");
  assert.equal(await evalJs("Math.abs(document.querySelector('#github-link').getBoundingClientRect().y - document.querySelector('.language-switch').getBoundingClientRect().y) < 20"), true);
  assert.equal(await evalJs("document.querySelectorAll('#footer-social-nav a').length"), 2);
  const headerHeight = await evalJs("document.querySelector('.site-header').getBoundingClientRect().height");
  assert.ok(headerHeight < 310, `Hero should be compact, got ${headerHeight}px`);

  await evalJs("document.querySelector('#type-costume').click()");
  assert.equal(await evalJs("document.querySelectorAll('.card').length"), 60);
  assert.match(await evalJs("document.querySelector('.cover img').getAttribute('src')"), /^img\/costume\/[a-z-]+\/thumbs\//);
  assert.equal(await evalJs("new Promise(resolve=>{const img=document.querySelector('.cover img');if(img.complete)resolve(img.naturalWidth>0);else{img.onload=()=>resolve(true);img.onerror=()=>resolve(false)}})"), true);
  assert.equal(await evalJs("document.querySelector('#angle-filter').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#view-filter').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#series').hidden"), true);

  await evalJs("document.querySelector('#category').value='summer';document.querySelector('#category').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.match(await evalJs("document.querySelector('#result').textContent"), /254/);
  await evalJs("document.querySelector('#load-more').click()");
  assert.equal(await evalJs("document.querySelectorAll('.card').length"), 120);
  await evalJs("document.querySelector('#reset').click()");
  assert.equal(await evalJs("document.querySelector('#category').value"), "");

  await evalJs("document.querySelector('#query').value='SPR-0001';document.querySelector('#query').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evalJs("document.querySelectorAll('.card').length"), 1);
  await evalJs("document.querySelector('.card').click()");
  assert.equal(await evalJs("document.querySelector('#overlay').hidden"), false);
  assert.match(await evalJs("document.querySelector('#largeImage').getAttribute('src')"), /^img\/costume\/[a-z-]+\/preview\//);
  assert.equal(await evalJs("new Promise(resolve=>{const img=document.querySelector('#largeImage');if(img.complete)resolve(img.naturalWidth>0);else{img.onload=()=>resolve(true);img.onerror=()=>resolve(false)}})"), true);
  assert.match(await evalJs("document.querySelector('#download').getAttribute('href')"), /^img\/costume\/[a-z-]+\/original\//);
  await evalJs("document.querySelector('#close').click();document.querySelector('#lang-en').click()");
  assert.equal(await evalJs("document.querySelector('#type-costume').textContent"), "Costumes");
  assert.equal(await evalJs("document.querySelector('#collection-title').textContent"), "Explore outfits");
  await evalJs("document.querySelector('#type-pose').click()");
  assert.equal(await evalJs("document.querySelectorAll('.card').length"), 60);
  assert.equal(await evalJs("document.querySelector('#collection-title').textContent"), "Explore poses");
  assert.equal(await evalJs("document.querySelector('#angle-filter').hidden"), false);
  assert.match(await evalJs("document.querySelector('.cover img').getAttribute('src')"), /^img\/pose\/[a-z-]+\/thumbs\//);
  assert.equal(await evalJs("new Promise(resolve=>{const img=document.querySelector('.cover img');if(img.complete)resolve(img.naturalWidth>0);else{img.onload=()=>resolve(true);img.onerror=()=>resolve(false)}})"), true);
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true
  });
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.equal(await evalJs("['github-link','x-link'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0 && r.right<=window.innerWidth})"), true);
  assert.equal(await evalJs("getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.trim().split(/\\s+/).length"), 2);
  await evalJs("document.querySelector('#type-pose').click();document.querySelector('.card').click();document.querySelector('#add-to-compose').click()");
  assert.equal(await evalJs("document.querySelector('#type-costume').getAttribute('aria-pressed')"), "true");
  await evalJs("document.querySelector('.card').click();document.querySelector('#add-to-compose').click()");
  assert.equal(await evalJs("document.querySelector('#compose-panel').hidden"), false);
  assert.equal(await evalJs("document.querySelector('.compose-editor').contains(document.querySelector('.compose-person-slot'))"), true);
  assert.equal(await evalJs("(()=>{const b=document.querySelector('#compose-download').getBoundingClientRect(),c=document.querySelector('#compose-copy-image').getBoundingClientRect(),p=document.querySelector('#compose-open-preview').getBoundingClientRect();return b.right<=innerWidth&&c.left>=0&&p.right<=innerWidth})()"), true);
  assert.equal(await evalJs("(()=>{const e=document.querySelector('.compose-editor').getBoundingClientRect(),one=document.querySelector('.compose-selection .compose-slot:first-child').getBoundingClientRect(),two=document.querySelector('.compose-selection .compose-slot:nth-of-type(2)').getBoundingClientRect();return e.top>=Math.max(one.bottom,two.bottom)-2&&two.left>=one.right})()"), true);
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.equal(await evalJs("['compose-random-outfit-filter','compose-random-pose-filter','compose-copy-prompt'].every(id=>document.getElementById(id).getBoundingClientRect().width>0)"), true);
  assert.equal(await evalJs("['compose-random-pair','compose-random-pose','compose-random-costume'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.right<=window.innerWidth})"), true);
  assert.equal(await evalJs("document.querySelector('#compose-local-notice').hidden"),
    /^https?:/.test(galleryUrl));
  assert.match(await evalJs("document.querySelector('#compose-local-step').textContent"), /img.*pose.*costume/);
  assert.equal(await evalJs("document.querySelector('#browser-panel').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-download').disabled"), false);
  const closedCanvasSize = await evalJs("[document.querySelector('#compose-canvas').width,document.querySelector('#compose-canvas').height]");
  await evalJs("document.querySelector('#compose-bg').value='soft';document.querySelector('#compose-bg').dispatchEvent(new Event('change'))");
  assert.deepEqual(await evalJs("[document.querySelector('#compose-canvas').width,document.querySelector('#compose-canvas').height]"), closedCanvasSize,
    "Changing background while the preview is hidden should not redraw the canvas");
  await evalJs("document.querySelector('#compose-labels').click()");
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await evalJs("document.querySelector('#type-costume').click()");
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.equal(await evalJs("getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.trim().split(/\\s+/).length"), 2);
  await evalJs("document.querySelector('.card').click()");
  assert.equal(await evalJs("document.querySelector('#dialog').getBoundingClientRect().width <= window.innerWidth"), true);
  await evalJs("document.querySelector('#close').click();document.querySelector('#lang-ja').click()");
  assert.equal(await evalJs("document.querySelector('#social-nav').getAttribute('aria-label')"), "プロジェクトとSNS");
  assert.equal(await evalJs("document.querySelector('#collection-title').textContent"), "衣装を探す");
  assert.equal(await evalJs("document.querySelector('#dialog').getAttribute('aria-label')"), "衣装画像プレビュー");
  assert.equal(await evalJs("['姿势','图库','服装','搜索','筛选','预览','下载','重置','关闭'].filter(x=>document.body.innerText.includes(x)).join(',')"), "");
  assert.match(await evalJs("getComputedStyle(document.body).fontFamily"), /Yu Gothic|Meiryo/);
  await evalJs("document.querySelector('#type-pose').click()");
  assert.equal(await evalJs("['姿势','图库','服装','搜索','筛选','预览','下载','重置','关闭'].filter(x=>document.body.innerText.includes(x)).join(',')"), "");
  await evalJs("document.querySelector('#type-costume').click()");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 320, height: 700, deviceScaleFactor: 1, mobile: true
  });
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.equal(await evalJs("getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.trim().split(/\\s+/).length"), 2);
  await evalJs("document.querySelector('#type-pose').click();document.querySelector('.card').click();document.querySelector('#add-to-compose').click()");
  assert.equal(await evalJs("document.querySelector('#type-costume').getAttribute('aria-pressed')"), "true");
  await evalJs("document.querySelector('.card').click();document.querySelector('#add-to-compose').click()");
  assert.equal(await evalJs("document.querySelector('#compose-panel').hidden"), false);
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await evalJs("document.querySelector('#compose-mode-four').click()");
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"),true);
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile').length"),4);
  await evalJs("document.querySelector('#compose-mode-nine').click()");
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"),true);
  assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile').length"),9);
  await evalJs("document.querySelector('#compose-mode-reference').click()");
  assert.equal(await evalJs("document.querySelector('#compose-download').disabled"), false);
  assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-open-preview').disabled"), false);
  assert.equal(await evalJs("['compose-random-pair','compose-random-pose','compose-random-costume'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.right<=window.innerWidth})"), true);
  assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), true);
  assert.equal(await evalJs("document.querySelector('#compose-size').textContent"),
    await evalJs("ReferenceGalleryI18n.t('composeAdaptiveSize')"));
  await evalJs("document.querySelector('#compose-open-preview').click()");
  await evalJs("new Promise(r=>setTimeout(r,500))");
  assert.equal(await evalJs("document.querySelector('#compose-placeholder').hidden"), true);
  assert.equal(await evalJs("(()=>{const modal=document.querySelector('#compose-preview-dialog').getBoundingClientRect(),stage=document.querySelector('.compose-preview-stage').getBoundingClientRect();return modal.left>=0&&modal.right<=innerWidth&&modal.top>=0&&modal.bottom<=innerHeight&&stage.height>80})()"), true,
    "The portrait preview should fit within a 320×700 viewport");
  await evalJs("document.querySelector('#compose-preview-close').click()");
  if (/^https?:/.test(galleryUrl)) {
    assert.equal(await evalJs("ReferenceComposition.needsFolder()"), false);
    assert.equal(await evalJs("document.querySelector('#compose-local-notice').hidden"), true);
    await evalJs("document.querySelector('#compose-random-pair').click()");
    assert.equal(await evalJs("document.querySelector('#compose-download').disabled"), false);
    await evalJs("document.querySelector('#compose-open-preview').click()");
    assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), false);
    await evalJs("new Promise(r=>setTimeout(r,600))");
    assert.equal(await evalJs("document.querySelector('#compose-placeholder').hidden"), true);
    const copiedImage = await evalJs(`(async()=>{
      let imageBlob;
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        write:async items=>{imageBlob=await items[0].getType('image/png')},
        writeText:async()=>{}
      }});
      await document.querySelector('#compose-preview-copy').onclick();
      return [imageBlob?.type,imageBlob?.size,
        document.querySelector('#compose-copy-status').textContent,
        document.querySelector('#compose-preview-action-status').textContent];
    })()`);
    assert.equal(copiedImage[0], "image/png");
    assert.ok(copiedImage[1] > 10000);
    assert.equal(copiedImage[2], await evalJs("ReferenceGalleryI18n.t('composeCopiedImage')"));
    assert.equal(copiedImage[3], copiedImage[2]);
    await command("Page.setDownloadBehavior", { behavior: "allow", downloadPath: profile });
    await evalJs("document.querySelector('#compose-preview-download').click()");
    let pngFile;
    for (let i = 0; i < 100; i++) {
      pngFile = fs.readdirSync(profile).find((name) => name.endsWith(".png"));
      if (pngFile) break;
      await sleep(150);
    }
    assert.ok(pngFile, "Online composition must download PNG without a folder prompt");
    const contents = fs.readFileSync(path.join(profile, pngFile));
    assert.ok(contents.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")));
    assert.ok(contents.readUInt32BE(16) <= 2400);
    assert.ok(contents.readUInt32BE(20) <= 1600);
    assert.ok(contents.readUInt32BE(16) >= 300);
    assert.ok(contents.readUInt32BE(20) >= 800);
    assert.ok(contents.length > 10000);
    assert.equal(await evalJs("document.querySelector('#compose-status').textContent"),
      await evalJs("ReferenceGalleryI18n.t('composeSaved')"));
    assert.equal(await evalJs("document.querySelector('#compose-preview-action-status').textContent"),
      await evalJs("ReferenceGalleryI18n.t('composeSaved')"));
    await evalJs("document.querySelector('#compose-preview-close').click()");
    assert.equal(await evalJs("document.querySelector('#compose-preview-overlay').hidden"), true);
    await evalJs("document.querySelector('#compose-mode-nine').click()");
    assert.equal(await evalJs("state.composition.gridItems.length"), 9);
    assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.pose.pose_key)).size"), 9);
    assert.equal(await evalJs("new Set(state.composition.gridItems.map(x=>x.outfit.id)).size"), 9);
    assert.equal(await evalJs("document.querySelectorAll('.compose-grid-tile img').length"), 18);
    assert.equal(await evalJs("document.querySelector('#compose-grid-download').disabled"), false);
    const gridClipboard = await evalJs(`(async()=>{
      let blob;
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        write:async items=>{blob=await items[0].getType('image/png')},
        writeText:async()=>{}
      }});
      await document.querySelector('#compose-grid-copy').onclick();
      const image=await createImageBitmap(blob);
      const dimensions=[image.width,image.height,blob.size];
      image.close();
      return dimensions;
    })()`);
    assert.deepEqual(gridClipboard.slice(0,2),[3072,3072]);
    assert.ok(gridClipboard[2]>10000);
    await evalJs("document.querySelector('#compose-grid-download').click()");
    let gridFile;
    for (let i=0;i<120;i++){
      gridFile=fs.readdirSync(profile).find(name=>name.startsWith('9grid_')&&name.endsWith('.png'));
      if(gridFile)break;
      await sleep(150);
    }
    assert.ok(gridFile,"Nine pose+outfit grid must download a PNG with no folder authorization online");
    const gridBytes=fs.readFileSync(path.join(profile,gridFile));
    assert.equal(gridBytes.readUInt32BE(16),3072);
    assert.equal(gridBytes.readUInt32BE(20),3072);
    console.log("PASS: HTTP reference + nine-grid copy/download PNG, no folder authorization");
    ws.close();
    return;
  }
  const exportCheck = await evalJs(`(async()=>{
    const paths=[state.composition.pose.original,state.composition.second.original];
    const fake=[];
    for(let k=0;k<2;k++){
      const c=document.createElement('canvas');c.width=80;c.height=100;
      const ctx=c.getContext('2d');ctx.fillStyle=k?'#0044ff':'#ff3300';ctx.fillRect(0,0,80,100);
      const blob=await new Promise(r=>c.toBlob(r,'image/png'));
      const f=new File([blob],paths[k].split('/').at(-1),{type:'image/png'});
      Object.defineProperty(f,'webkitRelativePath',{value:'project/'+paths[k]});
      fake.push(f);
    }
    const count=ReferenceComposition.setFiles(fake);
    const output=await ReferenceComposition.exportPNG({...state.composition,labels:false});
    const image=await createImageBitmap(output);
    const test=document.createElement('canvas');test.width=image.width;test.height=image.height;
    const tc=test.getContext('2d');tc.drawImage(image,0,0);
    const a=Array.from(tc.getImageData(Math.floor(image.width*.25),Math.floor(image.height/2),1,1).data).slice(0,3);
    const b=Array.from(tc.getImageData(Math.floor(image.width*.75),Math.floor(image.height/2),1,1).data).slice(0,3);
    const realPoseId=state.composition.pose.id;
    const realOutfitId=state.composition.second.id;
    const originalFillText=CanvasRenderingContext2D.prototype.fillText;
    const calls=[];
    CanvasRenderingContext2D.prototype.fillText=function(value,...args){
      calls.push({value:String(value),font:this.font});
      return originalFillText.call(this,value,...args);
    };
    let enabled,disabled,uploadCodes,uploaded,uploadedPNG,labelPixels,unlabeledPixels;
    async function countDarkPixels(blob){
      const bitmap=await createImageBitmap(blob);
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let count=0;
      for(let k=0;k<pixels.length;k+=4) {
        if(pixels[k]<135&&pixels[k+1]<135&&pixels[k+2]<135&&pixels[k+3]>0)count++;
      }
      return count;
    }
    try {
      const labeled=await ReferenceComposition.exportPNG({...state.composition,labels:true});
      enabled=calls.splice(0);
      const clean=await ReferenceComposition.exportPNG({...state.composition,labels:false});
      disabled=calls.splice(0);
      labelPixels=await countDarkPixels(labeled);
      unlabeledPixels=await countDarkPixels(clean);
      await composeUI.uploadSecondImage(fake[1]);
      uploaded=state.composition.second.uploadUrl.startsWith('blob:');
      uploadedPNG=await ReferenceComposition.exportPNG({...state.composition,labels:true});
      uploadCodes=calls.splice(0);
    } finally { CanvasRenderingContext2D.prototype.fillText=originalFillText; }
    return [count,output.type,output.size,image.width,image.height,a.join(','),b.join(','),
      uploaded,uploadedPNG.size,realPoseId,realOutfitId,enabled,disabled,uploadCodes,
      labelPixels,unlabeledPixels];
  })()`);
  assert.equal(exportCheck[0], 2);
  assert.equal(exportCheck[1], "image/png");
  assert.ok(exportCheck[2] > 1000, "Composed PNG should contain image data");
  assert.ok(exportCheck[3] <= 2400 && exportCheck[3] >= 300);
  assert.ok(exportCheck[4] <= 1600 && exportCheck[4] >= 500);
  assert.notEqual(exportCheck[5], exportCheck[6], "Both source images must appear in the output");
  assert.equal(exportCheck[7], true, "Custom uploaded image should be selected");
  assert.ok(exportCheck[8] > 1000, "Custom upload should be exportable offline");
  assert.deepEqual(exportCheck[11].map(item=>item.value), [exportCheck[9],exportCheck[10]],
    "Enabling picture IDs must draw the real pose and outfit codes in order");
  assert.ok(exportCheck[11].every(item=>item.font.includes("35px")),
    "Number labels must use larger, legible text");
  assert.equal(exportCheck[12].length, 0, "Disabling labels must remove all canvas text");
  assert.deepEqual(exportCheck[13].map(item=>item.value), [exportCheck[9]],
    "An uploaded image has no gallery ID and must not be assigned a fake one");
  assert.ok(exportCheck[14] > 100, "Catalog IDs must be visible as dark glyph pixels in the PNG");
  assert.ok(exportCheck[14] > exportCheck[15] + 100,
    "Turning off image IDs must remove the visible glyph pixels");
  await evalJs("document.querySelector('#compose-random-costume').click()");
  assert.equal(await evalJs("!state.composition.second.uploadUrl && state.costumeImages.some(x=>x.id===state.composition.second.id)"), true,
    "Random outfit should replace an uploaded file with a catalog outfit");
  assert.equal(await evalJs("composeUI.updateComposition();document.querySelector('#compose-local-notice').hidden"), true);
  const wrongFolderCheck = await evalJs(`(async()=>{
    const f=new File(['wrong'],'other.png',{type:'image/png'});
    Object.defineProperty(f,'webkitRelativePath',{value:'img/not-the-selected-original/other.png'});
    ReferenceComposition.setFiles([f]);
    let error;
    try { await ReferenceComposition.checkLocalAccess([state.composition.pose, state.composition.second]); }
    catch(e) { error=e.message; }
    ReferenceComposition.clearFiles();
    return [error,ReferenceComposition.needsFolder()];
  })()`);
  assert.ok(["LOCAL_ACCESS_REQUIRED", "LOCAL_IMAGE_NOT_FOUND"].includes(wrongFolderCheck[0]));
  assert.equal(wrongFolderCheck[1], true, "An invalid selection must allow re-authorizing the folder");
  assert.equal(await evalJs("composeUI.updateComposition();document.querySelector('#compose-local-notice').hidden"), false);
  assert.equal(await evalJs("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await evalJs("document.querySelector('#lang-ja').click()");
  assert.equal(await evalJs("document.querySelector('#type-compose').textContent"), "組み合わせ");
  assert.equal(await evalJs("document.querySelector('#compose-random-pair-label').textContent"), "両方ランダム");
  assert.equal(await evalJs("document.querySelector('#compose-random-pose').textContent"), "ポーズを抽選");
  assert.equal(await evalJs("document.querySelector('#compose-random-outfit-filter-label').textContent"), "衣装カテゴリー");
  assert.equal(await evalJs("document.querySelector('#compose-prompt-title').textContent"), "AI制作プロンプト");
  assert.match(await evalJs("document.querySelector('#compose-prompt-text').value"), /参考画像/);
  assert.equal(await evalJs("document.querySelector('#compose-download').textContent"), "PNGをダウンロード");
  await evalJs("document.querySelector('#lang-en').click()");
  assert.equal(await evalJs("document.querySelector('#type-compose').textContent"), "Compose");
  assert.equal(await evalJs("document.querySelector('#compose-random-costume').textContent"), "Random outfit");
  assert.equal(await evalJs("document.querySelector('#compose-random-pose-filter-label').textContent"), "Pose category");
  assert.match(await evalJs("document.querySelector('#compose-prompt-text').value"), /Create a finished character image/);
  console.log("PASS: composition selection, fixed order and offline PNG export via user-selected files");
  console.log("PASS: desktop/mobile style, 60/120-card pagination, category filters, costume search, preview, download, i18n and pose switch");
  ws.close();
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  chrome.kill();
  // Leave the temporary profile to the OS if Chrome is still shutting down.
});
