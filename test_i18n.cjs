"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = __dirname;
const storage = new Map();
const sandbox = {
  window: {},
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  }
};
vm.runInNewContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), sandbox);
const i18n = sandbox.window.ReferenceGalleryI18n;

// The published catalog is a normal script so file:// mode works without a server.
const catalogContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "catalog.js"), "utf8"), catalogContext);
const records = catalogContext.window.POSE_GALLERY_CATALOG;
vm.runInNewContext(fs.readFileSync(path.join(root, "costume-catalog.js"), "utf8"), catalogContext);
const costumes = catalogContext.window.COSTUME_GALLERY_CATALOG;
vm.runInNewContext(fs.readFileSync(path.join(root, "portrait-catalog.js"), "utf8"), catalogContext);
const portraits = catalogContext.window.PORTRAIT_GALLERY_CATALOG;

test("1,499 licensed portrait references have distinct IDs and local thumbnail assets", () => {
  assert.equal(portraits.length, 1499);
  assert.equal(portraits.filter((x) => x.section === "face").length, 893);
  assert.equal(portraits.filter((x) => x.section === "styling").length, 606);
  assert.equal(new Set(portraits.map((x) => x.id)).size, 1499);
  for (const item of portraits) {
    assert.match(item.original, /^img\/portrait\/original\/[a-z0-9]{11}\.png$/);
    assert.match(item.thumbnail, /^img\/portrait\/thumb\/[a-z0-9]{11}\.webp$/);
    assert.ok(fs.statSync(path.join(root, item.thumbnail)).size > 100);
    const original = path.join(root, item.original);
    assert.ok(fs.statSync(original).size > 100, `Missing portrait original ${item.id}`);
  }
});

test("project root contains no empty files accidentally created by shell commands", () => {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const filename = path.join(root, entry.name);
    assert.ok(fs.statSync(filename).size > 0,
      `Unexpected empty file in project root: ${entry.name}`);
  }
});

test("offline catalog loads without fetch and all local image files are present", () => {
  assert.equal(records.length, 1439);
  assert.equal(new Set(records.map((item) => item.pose_key)).size, 288);
  assert.ok(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('src="catalog.js"'));
  assert.ok(!fs.readFileSync(path.join(root, "app.js"), "utf8").includes("fetch("));
  for (const record of records) {
    for (const key of ["thumbnail", "original"]) {
      assert.ok(fs.existsSync(path.join(root, record[key])), `${record.id}: ${key}`);
      assert.match(record[key], /^img\/pose\/[a-z-]+\/(thumbs|original)\/[^/]+$/);
    }
  }
});

test("all 1,407 outfits have unique IDs and complete local assets", () => {
  assert.equal(costumes.length, 1407);
  assert.equal(new Set(costumes.map((item) => item.id)).size, costumes.length);
  assert.equal(new Set([...records.map((item) => item.id), ...costumes.map((item) => item.id)]).size,
    records.length + costumes.length);
  const counts = { spring: 215, summer: 254, autumn: 244, winter: 253,
    lingerie: 199, party: 48, swimwear: 54, sexy: 140 };
  for (const [category, expected] of Object.entries(counts)) {
    assert.equal(costumes.filter((c) => c.category === category).length, expected);
  }
  for (const item of costumes) {
    for (const key of ["thumbnail", "preview", "original"]) {
      const file = path.join(root, item[key]);
      assert.ok(fs.existsSync(file), `${item.id} missing ${key}`);
      assert.ok(fs.statSync(file).size > 100, `${item.id} empty ${key}`);
      assert.match(item[key], new RegExp(`^img/costume/${item.category}/(thumbs|preview|original)/[^/]+$`));
    }
  }
});

test("all images belong under the single img folder with no legacy asset directories", () => {
  for (const old of ["thumbs", "costumes"]) {
    assert.equal(fs.existsSync(path.join(root, old)), false, `${old} is not cleaned up`);
  }
  const paths = [
    ...records.flatMap((x) => [x.thumbnail, x.original]),
    ...costumes.flatMap((x) => [x.thumbnail, x.preview, x.original])
  ];
  assert.equal(paths.length, 7099);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.every((p) => p.startsWith("img/")));
});

test("both catalogs load offline and the gallery has type switching and pagination", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.ok(html.includes('src="costume-catalog.js"'));
  assert.ok(html.includes('id="type-costume"'));
  assert.ok(html.includes('id="type-pose"'));
  assert.ok(html.includes('id="load-more"'));
  assert.ok(app.includes('state.visibleCount'));
  assert.ok(!app.includes("fetch("));
});

test("header and footer contain the correct GitHub and X profile links", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const url of [
    "https://github.com/vculjp/ai-reference-gallery",
    "https://x.com/vculjp"
  ]) {
    const links = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0])
      .filter((tag) => tag.includes(`href="${url}"`));
    assert.equal(links.length, 2, `${url} should appear in header and footer`);
    for (const tag of links) {
      assert.match(tag, /target="_blank"/);
      assert.match(tag, /rel="noopener noreferrer"/);
    }
  }
});

test("composition provides controlled random draws and copying without new dependencies", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const controller = fs.readFileSync(path.join(root, "composition-ui.js"), "utf8");
  for (const id of ["compose-random-pair", "compose-random-pose", "compose-random-costume"]) {
    assert.ok(html.includes(`id="${id}"`));
    assert.ok(controller.includes(`$("${id}").onclick`));
  }
  for (const id of [
    "compose-random-outfit-filter", "compose-random-pose-filter", "compose-random-include-duo",
    "compose-prompt-text", "compose-copy-prompt", "compose-copy-image"
  ]) assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  assert.ok(controller.includes("state.poseImages"));
  assert.ok(controller.includes("state.costumeImages"));
  assert.ok(controller.includes("getPoseGroups()"));
  assert.ok(controller.includes("composition.exportPNG(compositionOptions())"));
});

test("composition uses fixed order and only actual gallery IDs", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const composer = fs.readFileSync(path.join(root, "composition.js"), "utf8");
  const controller = fs.readFileSync(path.join(root, "composition-ui.js"), "utf8");
  for (const obsolete of ["compose-layout", "compose-horizontal", "compose-vertical", "compose-swap"]) {
    assert.ok(!html.includes(`id="${obsolete}"`), `Obsolete control: ${obsolete}`);
    assert.ok(!controller.includes(`$("${obsolete}")`), `Obsolete handler: ${obsolete}`);
  }
  assert.ok(!app.includes('layout: "horizontal"'));
  assert.ok(!app.includes("swapped:"));
  assert.ok(!composer.includes("options.swapped"));
  assert.ok(!composer.includes("options.layout"));
  assert.match(composer, /options\.labels && !entry\.uploadUrl && entry\.id/);
  assert.ok(!composer.includes('"PERSON"'), "Uploads must not be printed as fake gallery IDs");
  assert.ok(!composer.includes('"UPLOAD"'));
});

test("four-grid and nine-grid use unique catalog references and fixed square layouts", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const core = fs.readFileSync(path.join(root, "composition.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "composition-ui.js"), "utf8");
  for (const id of [
    "compose-mode-reference", "compose-mode-four", "compose-mode-nine",
    "compose-grid-shuffle", "compose-grid-tiles",
    "compose-grid-preview", "compose-grid-copy", "compose-grid-download"
  ]) assert.ok(html.includes(`id="${id}"`), `Missing grid control ${id}`);
  assert.ok(!html.includes('id="compose-grid-source"'), "Grid must combine pose and outfit, not use a single-source selector");
  assert.match(core, /function paintGrid\(/);
  assert.ok(core.includes("original ? 1024 : 360"));
  assert.ok(ui.includes("usedPoses"));
  assert.ok(ui.includes("usedOutfits"));
  assert.ok(ui.includes("pose: randomAngle"));
  assert.ok(ui.includes("outfit:"));
  assert.match(core, /items\.flatMap\(\(\{pose, outfit\}\) => \[pose, outfit\]\)/,
    "Grid loading must include both pose and outfit for every cell");
  assert.match(core, /function withImages\(/, "Originals should share the bounded image loader");
  assert.ok(ui.includes('setGridStatus("composeGridInsufficient"'));
});

test("one-click random selection includes an actual face and shared grid face controls", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const controller = fs.readFileSync(path.join(root, "composition-ui.js"), "utf8");
  for (const id of ["compose-random-person", "compose-grid-random-person",
    "compose-random-portrait-section", "compose-random-portrait-hair",
    "compose-grid-person-preview"]) {
    assert.ok(html.includes(`id="${id}"`), `Missing random face control ${id}`);
  }
  assert.match(controller, /function drawRandomPerson\(/);
  assert.match(controller, /which === "both" \|\| which === "person"/);
  assert.match(controller, /shuffleGrid\(true\)/);
  assert.match(controller, /function eligiblePortraits\(/);
  assert.ok(i18n.t("composeRandomPerson"));
});

test("grid uses the validated person uploader and preserves custom photos across shuffle", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(root, "composition-ui.js"), "utf8");
  assert.match(html, /id="compose-grid-upload-person"/);
  assert.match(html, /id="compose-grid-person-input"[^>]+accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(ui, /uploadPersonImage\(event\.target\.files\[0\], "grid"\)/);
  assert.match(ui, /async function uploadPersonImage\(file, target = "reference"\)/);
  assert.match(ui, /state\.composition\.gridUsePerson = target === "grid"/);
  assert.match(ui, /!state\.composition\.person\?\.uploadUrl && drawRandomPerson\(\)/);
});

test("four/nine grid prompts follow actual selections and have accessible copy and translation controls", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(root, "composition-ui.js"), "utf8");
  for (const id of ["compose-grid-prompt-box", "compose-grid-prompt-text",
    "compose-grid-prompt-title", "compose-grid-prompt-help", "compose-grid-copy-prompt",
    "compose-grid-prompt-status"]) {
    assert.ok(html.includes(`id="${id}"`), `Missing grid prompt control ${id}`);
  }
  const rightCard = html.slice(html.indexOf('class="compose-grid-sidebar"'),
    html.indexOf('</section>', html.indexOf('class="compose-grid-sidebar"')));
  assert.ok(rightCard.includes('id="compose-grid-prompt-box"'),
    "AI prompt must stay inside the right-hand settings card, not beneath the grids");
  assert.equal((html.match(/id="compose-grid-prompt-box"/g)||[]).length, 1);
  assert.match(ui, /function updateGridPrompt\(/);
  assert.match(ui, /gridItems\.map\(\(\{pose, outfit\}, index\)/);
  assert.match(ui, /person\.uploadUrl \? t\("composeGridPromptPersonUpload"\)/);
  assert.match(ui, /updateGridPrompt\(\);/);
  assert.match(ui, /\$\("compose-grid-copy-prompt"\)\.onclick = \(\) => copyPrompt\(true\)/);
  for (const locale of ["zh-CN", "en", "ja"]) {
    i18n.setLocale(locale);
    for (const key of ["composeGridPromptTitle", "composeGridPromptHelp",
      "composeGridPromptEmpty", "composeGridPromptPersonUpload", "composeGridPromptNoPerson"]) {
      assert.ok(i18n.t(key), `Missing ${key} in ${locale}`);
    }
    assert.match(i18n.t("composeGridPromptPair", 1, 1, 1, "POSE-X", "Stand",
      "OUTFIT-Y", "Spring"), /POSE-X/);
  }
  i18n.setLocale("zh-CN");
});

test("footer credits the original creator and maintainer in all three languages", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="footer-note">ai-reference-gallery · 姿势／服装素材来源：ギア；脸部素材来源：あぎ · vculjp 整理维护/);
  assert.ok(!html.includes('id="source-link"'));
  for (const locale of ["zh-CN", "en", "ja"]) {
    i18n.setLocale(locale);
    const notice = i18n.t("footer");
    for (const token of ["ai-reference-gallery", "ギア", "あぎ", "vculjp"]) {
      assert.ok(notice.includes(token), `${locale} footer missing ${token}`);
    }
  }
});

test("runtime modules load once, in dependency order, with composition CSS isolated", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    "catalog.js", "depth-catalog.js", "costume-catalog.js", "portrait-catalog.js", "i18n.js",
    "composition.js", "grid-export.js", "composition-ui.js", "app.js"
  ]);
  const galleryCSS = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const composeCSS = fs.readFileSync(path.join(root, "composition.css"), "utf8");
  assert.ok(!galleryCSS.includes(".compose-panel"), "composition styles should not be duplicated");
  assert.ok(composeCSS.includes(".compose-panel"));
  assert.ok(html.includes('href="composition.css"'));
  const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(htmlIds.length, new Set(htmlIds).size, "HTML contains duplicate IDs");
  const callers = [
    fs.readFileSync(path.join(root, "app.js"), "utf8"),
    fs.readFileSync(path.join(root, "composition-ui.js"), "utf8")
  ];
  const usedIds = callers.flatMap((source) => [...source.matchAll(/\$\("([^"]+)"\)/g)]
    .map((match) => match[1]));
  for (const id of usedIds) assert.ok(htmlIds.includes(id), `Missing HTML control #${id}`);
});

test("composition UI owns its translations and obsolete inline preview keys are removed", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const composer = fs.readFileSync(path.join(root, "composition-ui.js"), "utf8");
  const source = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
  assert.match(app, /composeUI\.refreshLabels\(\)/);
  assert.match(composer, /function refreshLabels\(/);
  assert.ok(!app.includes('"compose-pose-label":'), "Composition labels should live in composition-ui.js");
  for (const key of ["composeEyebrow", "composePlaceholder"]) {
    assert.ok(!source.includes(`${key}:`), `Obsolete translation key ${key} is still defined`);
  }
  assert.ok(!source.includes("composePreview:"), "Old always-visible preview label should be gone");
});

test("translations have no duplicate keys and all three languages cover the same keys", () => {
  const source = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
  const markers = ['"zh-CN": {', "en: {", "ja: {"];
  const starts = markers.map((marker) => source.indexOf(marker));
  assert.ok(starts.every((n) => n >= 0));
  const end = source.indexOf("\n  };", starts[2]);
  assert.ok(end > starts[2]);
  const dictionaries = starts.map((start, index) => {
    const section = source.slice(start, index === 2 ? end : starts[index + 1]);
    // Several short keys share a line; inspect both line starts and comma-separated keys.
    const keys = [...section.matchAll(/(?:^ {6}|,\s+)([A-Za-z][\w]*):/gm)].map((m) => m[1]);
    assert.equal(keys.length, new Set(keys).size, `duplicate i18n key in ${markers[index]}`);
    return keys.sort();
  });
  assert.ok(dictionaries[0].length >= 50);
  assert.deepEqual(dictionaries[1], dictionaries[0], "English keys differ from Chinese keys");
  assert.deepEqual(dictionaries[2], dictionaries[0], "Japanese keys differ from Chinese keys");
});

test("costume labels and keyword searches work in all three languages", () => {
  const sample = costumes.find((item) => item.id === "SPR-0001");
  assert.ok(sample);
  for (const locale of ["zh-CN", "en", "ja"]) {
    i18n.setLocale(locale);
    assert.ok(i18n.t("typeCostume"));
    assert.ok(i18n.t("costumeName", i18n.label(sample, "category"), sample.id).includes(sample.id));
    assert.ok(i18n.searchable(sample).includes(sample.keywords));
    assert.ok(i18n.searchable(sample).includes("春季"));
    assert.ok(i18n.searchable(sample).includes("Spring"));
    assert.ok(i18n.searchable(sample).includes("春"));
  }
});

test("language choice is switchable and persisted", () => {
  i18n.setLocale("en");
  assert.equal(i18n.locale, "en");
  assert.equal(storage.get("ai-reference-gallery-language"), "en");
  assert.equal(i18n.t("reset"), "Reset filters");
  i18n.setLocale("zh-CN");
  assert.equal(i18n.t("reset"), "重置筛选");
  i18n.setLocale("ja");
  assert.equal(i18n.locale, "ja");
  assert.equal(storage.get("ai-reference-gallery-language"), "ja");
  assert.equal(i18n.t("reset"), "絞り込みをリセット");

  const reloaded = { window: {}, localStorage: sandbox.localStorage };
  vm.runInNewContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), reloaded);
  assert.equal(reloaded.window.ReferenceGalleryI18n.locale, "ja");
});

test("previous project language preference remains compatible", () => {
  const legacy = { window: {}, localStorage: {
    getItem: (key) => key === "ai-pose-gallery-language" ? "en" : null,
    setItem: () => {}
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), legacy);
  assert.equal(legacy.window.ReferenceGalleryI18n.locale, "en");
});

test("every interface text has a Japanese translation", () => {
  const keys = [
    "eyebrow", "tagline", "description", "searchLabel", "searchPlaceholder",
    "categoryLabel", "angleLabel", "viewLabel", "viewPose", "viewImage",
    "allCategories", "allAngles", "allSeries", "reset", "loadingCounts",
    "counts", "results", "angles", "empty", "loadError", "footer",
    "download", "hint", "close", "previous", "next", "dialog", "costumeDialog",
    "typePose", "typeCostume", "collectionPose", "collectionCostume",
    "collectionEyebrow", "typeNav", "filterNav", "galleryNav", "pageTitle",
    "costumeDescription", "costumeSearchLabel",
    "costumeSearchPlaceholder", "costumeName", "costumeResults", "costumeEmpty",
    "costumeHint", "loadMore",
    "collectionCompose", "typeCompose", "composeDescription", "addPose", "addCostume",
    "composePose", "composeSecond", "composeEmptyPose", "composeEmptySecond",
    "composePerson", "composePersonEmpty", "composePersonHelp", "composeUploadPerson",
    "composeRemovePerson", "composePreviewHintThree",
    "composeRandomTitle", "composeRandomHint", "composeRandomPair",
    "composeRandomPose", "composeRandomCostume",
    "composeOutfitFilter", "composePoseFilter", "composeAllOutfits",
    "composePreviewCopy",
    "composeAdaptiveSize",
    "composeAllPoses", "composeSoloPoses", "composeIncludeDuo",
    "composeRandomRange", "composePromptTitle", "composePromptHelp", "composePromptEmpty",
    "composeCopyPrompt", "composeCopyImage", "composeCopiedPrompt", "composeCopiedImage",
    "composeCopyError", "composeCopyImageError", "composePosLeft", "composePosRight",
    "composePosMiddleHorizontal", "composePoseMeta", "composePrompt", "composePromptThree",
    "choosePose", "chooseCostume", "uploadImage",
    "composeBg", "composeWhite", "composeSoft", "composeLabels", "composeHelp",
    "composeDownload", "composeFolder", "composeSelectFolder",
    "composeFolderReady", "composeExporting", "composeSaved", "composeMissingFile",
    "composeExportError", "composePreviewError", "composeInvalidUpload",
    "composeLocalTitle", "composeLocalStep"
  ];
  for (const locale of ["zh-CN", "en", "ja"]) {
    i18n.setLocale(locale);
    for (const key of keys) {
      const value = i18n.t(key, 2, 3, 4);
      assert.equal(typeof value, "string", `${locale}.${key}`);
      assert.ok(value.trim(), `${locale}.${key}`);
    }
  }
});

test("all three languages distinguish pose, outfit and person reference prompts", () => {
  for (const locale of ["zh-CN", "en", "ja"]) {
    i18n.setLocale(locale);
    const prompt = i18n.t("composePromptThree", "POSE-01",
      i18n.t("composePosLeft"), "OUTFIT-02",
      i18n.t("composePosMiddleHorizontal"), i18n.t("composePosRight"));
    assert.match(prompt, /POSE-01/);
    assert.match(prompt, /OUTFIT-02/);
    assert.ok(prompt.includes(i18n.t("composePosMiddleHorizontal")));
    assert.ok(prompt.includes(i18n.t("composePosRight")));
  }
});

test("Japanese mode uses original Japanese labels without replacing metadata", () => {
  i18n.setLocale("ja");
  for (const item of records) {
    for (const field of ["series", "category", "angle", "pose_name"]) {
      assert.equal(i18n.label(item, field), item[`${field}_ja`] || item[field], `${item.id}.${field}`);
    }
  }
  const originalJapanese = {
    id: "LOCAL-P001", pose_number: "P001",
    series: "全身1人・標準系", category: "立ち",
    angle: "横", pose_name: "腕を上げて立つ"
  };
  for (const field of ["series", "category", "angle", "pose_name"]) {
    assert.equal(i18n.label(originalJapanese, field), originalJapanese[field]);
  }
});

test("full catalog series, category and angle have readable English labels", () => {
  i18n.setLocale("en");
  for (const field of ["series", "category", "angle"]) {
    for (const item of records) {
      const translated = i18n.label(item, field);
      assert.ok(translated, `${item.id}: ${field}`);
      assert.match(translated, /[A-Za-z]/, `${item.id}: ${field} is missing an English label`);
      assert.doesNotMatch(translated, /[\u3040-\u30ff\u3400-\u9fff]/, `${item.id}: ${field} is untranslated`);
    }
  }
});

test("English names are never silently presented as translated Japanese", () => {
  i18n.setLocale("en");
  for (const item of records) {
    const name = i18n.label(item, "pose_name");
    assert.ok(name);
    if (!item.pose_name_en) {
      assert.ok(name.includes(item.pose_number), item.id);
      assert.notEqual(name, item.pose_name, item.id);
    }
  }
});

test("search can match English and Chinese terms regardless of selected UI", () => {
  const sample = records[0];
  i18n.setLocale("en");
  const englishCategory = i18n.label(sample, "category");
  assert.ok(i18n.searchable(sample).includes(englishCategory));
  if (sample.category_zh) assert.ok(i18n.searchable(sample).includes(sample.category_zh));
  i18n.setLocale("zh-CN");
  assert.ok(i18n.searchable(sample).includes(englishCategory));
  i18n.setLocale("ja");
  assert.ok(i18n.searchable(sample).includes(englishCategory));
  if (sample.category_ja) assert.ok(i18n.searchable(sample).includes(sample.category_ja));
  i18n.setLocale("en");
  if (sample.category_ja) assert.ok(i18n.searchable(sample).includes(sample.category_ja));
});
