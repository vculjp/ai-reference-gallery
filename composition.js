"use strict";
// Offline-capable reference and pose/outfit grid compositor. No external dependencies.
window.ReferenceComposition = (() => {
  let directory = null;
  let pickedFiles = null;
  // Fixed order: pose, outfit and optional person. Canvas adapts to source
  // ratios rather than forcing portrait references into a 3:2 rectangle.
  const previewSize = [1200, 800];

  function setFiles(files) {
    const selected = new Map();
    for (const file of files) {
      const relative = (file.webkitRelativePath || file.name).replaceAll("\\", "/");
      const offset = relative.indexOf("img/");
      if (offset >= 0) selected.set(relative.slice(offset), file);
      else if (/^(pose|costume)\//.test(relative)) selected.set("img/" + relative, file);
    }
    pickedFiles = selected;
    directory = null;
    return selected.size;
  }

  function clearFiles() {
    directory = null;
    pickedFiles = null;
  }

  async function requestFolder() {
    if (typeof window.showDirectoryPicker !== "function") return false;
    // Called only from a direct button click (required by File System Access).
    directory = await window.showDirectoryPicker({ id: "reference-gallery-images", mode: "read" });
    pickedFiles = null;
    return true;
  }

  async function fileFor(path) {
    if (pickedFiles?.has(path)) return pickedFiles.get(path);
    if (!directory) throw new Error("LOCAL_ACCESS_REQUIRED");
    const segments = path.split("/");
    if (segments[0] !== "img" || segments.length < 3 || segments.some((s) => !s || s === "..")) {
      throw new Error("INVALID_IMAGE_PATH");
    }
    // Both the img/ directory itself and the project root are accepted.
    async function traverse(start, parts) {
      let current = start;
      for (const segment of parts.slice(0, -1)) current = await current.getDirectoryHandle(segment);
      return (await current.getFileHandle(parts.at(-1))).getFile();
    }
    try { return await traverse(directory, segments.slice(1)); }
    catch (_) {
      try { return await traverse(directory, segments); }
      catch (_) { throw new Error("LOCAL_IMAGE_NOT_FOUND"); }
    }
  }

  // Validate the user's chosen folder against the actual selected assets.
  // An unrelated folder must not be remembered as a successful authorization.
  async function checkLocalAccess(entries) {
    if (location.protocol !== "file:") return true;
    for (const entry of entries) {
      if (entry && !entry.uploadUrl) await fileFor(entry.original);
    }
    return true;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Same-origin static assets work without configuration; external asset
      // hosts must allow CORS for Canvas to export a non-tainted PNG.
      if (/^https?:$/.test(location.protocol) && !src.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
      img.src = src;
    });
  }

  function sourceFor(entry, original) {
    if (entry.uploadUrl) return entry.uploadUrl;
    return original ? entry.original : (entry.preview || entry.thumbnail || entry.original);
  }

  async function loadSource(entry, original) {
    // Render original-resolution images for the on-demand large preview when
    // available. In file:// mode, keep preview possible without authorization.
    const highResolution = original || location.protocol !== "file:" || !needsFolder();
    const path = sourceFor(entry, highResolution);
    if (!highResolution || entry.uploadUrl || location.protocol !== "file:") {
      return { image: await loadImage(path) };
    }
    const blob = await fileFor(path);
    const url = URL.createObjectURL(blob);
    try { return { image: await loadImage(url), url }; }
    catch (err) { URL.revokeObjectURL(url); throw err; }
  }

  function contain(ctx, image, x, y, w, h) {
    const iw = image.naturalWidth, ih = image.naturalHeight;
    const ratio = Math.min(w / iw, h / ih);
    const dw = iw * ratio, dh = ih * ratio;
    ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function paint(canvas, options, images, original) {
    const entries = [options.pose, options.second];
    if (options.person) entries.push(options.person);
    const loaded = images;
    const padding = 14, margin = 24, gap = 26;
    // Only catalog assets have image IDs. Uploaded filenames and the former
    // hard-coded PERSON text are not catalog numbers and must not be printed.
    const codes = entries.map((entry) =>
      options.labels && !entry.uploadUrl && entry.id ? String(entry.id) : "");
    const labelHeights = codes.map((code) => code ? 64 : 0);
    const unit = 1000;
    const ratios = loaded.map((image) => image.naturalWidth / image.naturalHeight);
    const boxWidths = ratios.map((ratio) => unit * ratio + 2 * padding);
    const boxHeights = labelHeights.map((height) => unit + 2 * padding + height);
    const rawW = boxWidths.reduce((sum, width) => sum + width, 0) +
      gap * (loaded.length - 1) + 2 * margin;
    const rawH = Math.max(...boxHeights) + 2 * margin;
    const [maxW, maxH] = previewSize;
    const scale = Math.min(maxW / rawW, maxH / rawH);
    // Render at exactly twice the preview resolution for matching image ratios.
    // Preview and export are generated from the same layout geometry.
    const multiplier = original ? 2 : 1;
    const w = Math.round(rawW * scale) * multiplier;
    const h = Math.round(rawH * scale) * multiplier;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = options.background === "soft" ? "#f2f3f6" : "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.scale(scale * multiplier, scale * multiplier);
    let offset = 0;
    for (let i = 0; i < loaded.length; i++) {
      const pw = boxWidths[i], ph = boxHeights[i];
      const x = margin + offset;
      const y = margin;
      ctx.fillStyle = options.background === "soft" ? "#ffffff" : "#f7f8fa";
      ctx.fillRect(x, y, pw, ph);
      contain(ctx, loaded[i], x + padding, y + padding, pw - padding * 2,
        ph - padding * 2 - labelHeights[i]);
      if (codes[i]) {
        ctx.fillStyle = "#333d4e";
        // Larger than the previous 19 virtual pixels: readable in both
        // half-size popup previews and full-resolution PNG exports.
        ctx.font = "650 35px system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(codes[i].slice(0, 40), x + padding,
          y + ph - labelHeights[i] / 2, pw - padding * 2);
      }
      offset += pw + gap;
    }
    return [w, h];
  }

  function paintGrid(canvas, options, images, original) {
    const count = options.mode === "nine" ? 9 : 4;
    const columns = count === 9 ? 3 : 2;
    if (images.length !== count) throw new Error("COMPOSITION_INCOMPLETE");
    const edge = columns * (original ? 1024 : 360);
    canvas.width = canvas.height = edge;
    const ctx = canvas.getContext("2d");
    const margin = Math.round(edge * .016);
    const gap = Math.round(edge * .009);
    const cell = (edge - margin * 2 - gap * (columns - 1)) / columns;
    const innerPad = Math.max(5, Math.round(edge * .005));
    const pairGap = Math.max(3, Math.round(cell * .012));
    const panelWidth = (cell - innerPad * 2 - pairGap) / 2;
    const labelH = options.labels ? Math.round(cell * .075) : 0;
    ctx.fillStyle = options.background === "soft" ? "#f2f3f6" : "#ffffff";
    ctx.fillRect(0, 0, edge, edge);
    images.forEach(({pose, outfit}, index) => {
      const x = margin + (index % columns) * (cell + gap);
      const y = margin + Math.floor(index / columns) * (cell + gap);
      ctx.fillStyle = options.background === "soft" ? "#fff" : "#f7f8fa";
      ctx.fillRect(x, y, cell, cell);
      const pair = options.items[index];
      [[pose, pair.pose], [outfit, pair.outfit]].forEach(([image, entry], side) => {
        const px = x + innerPad + side * (panelWidth + pairGap);
        ctx.fillStyle = "#fff";
        ctx.fillRect(px, y + innerPad, panelWidth, cell - innerPad * 2);
        contain(ctx, image, px + 2, y + innerPad + 2,
          panelWidth - 4, cell - innerPad * 2 - labelH - 4);
        if (options.labels && entry.id && !entry.uploadUrl) {
          ctx.fillStyle = "#333d4e";
          ctx.font = `650 ${Math.max(12, Math.round(panelWidth * .075))}px system-ui, sans-serif`;
          ctx.textBaseline = "middle";
          ctx.fillText(String(entry.id).slice(0, 40), px + 5,
            y + cell - innerPad - labelH / 2, panelWidth - 10);
        }
      });
    });
    return [edge, edge];
  }

  // Load a few originals at once: 9-grid needs 18 images, but loading them
  // strictly one by one is slow. Always revoke acquired blob URLs on failure.
  async function withImages(entries, original, render) {
    const sources = [];
    try {
      for (let index = 0; index < entries.length; index += 4) {
        const batch = await Promise.allSettled(
          entries.slice(index, index + 4).map((entry) => loadSource(entry, original))
        );
        sources.push(...batch.filter((item) => item.status === "fulfilled")
          .map((item) => item.value));
        const failure = batch.find((item) => item.status === "rejected");
        if (failure) throw failure.reason;
      }
      return render(sources.map((source) => source.image));
    } finally {
      for (const source of sources) if (source.url) URL.revokeObjectURL(source.url);
    }
  }

  async function draw(canvas, options, original = false) {
    if (options.mode === "four" || options.mode === "nine") {
      const count = options.mode === "nine" ? 9 : 4;
      if (options.items?.length !== count ||
          options.items.some((entry) => !entry?.pose || !entry?.outfit)) {
        throw new Error("COMPOSITION_INCOMPLETE");
      }
      const entries = options.items.flatMap(({pose, outfit}) => [pose, outfit]);
      return withImages(entries, original, (images) => {
        const pairs = options.items.map((_, i) => ({
          pose: images[2 * i], outfit: images[2 * i + 1]
        }));
        return paintGrid(canvas, options, pairs, original);
      });
    }
    if (!options.pose || !options.second) throw new Error("COMPOSITION_INCOMPLETE");
    const entries = [options.pose, options.second];
    if (options.person) entries.push(options.person);
    return withImages(entries, original, (images) => paint(canvas, options, images, original));
  }

  async function exportPNG(options) {
    const canvas = document.createElement("canvas");
    await draw(canvas, options, true);
    return new Promise((resolve, reject) => {
      try { canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("EXPORT_FAILED")), "image/png"); }
      catch (err) { reject(err); }
    });
  }

  function needsFolder() {
    return location.protocol === "file:" && !directory && !pickedFiles;
  }

  return { draw, exportPNG, setFiles, clearFiles, requestFolder, checkLocalAccess, needsFolder };
})();
