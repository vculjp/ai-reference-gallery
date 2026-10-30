"use strict";
const $ = (id) => document.getElementById(id);
const i18n = window.ReferenceGalleryI18n;
const t = (key, ...args) => i18n.t(key, ...args);
const label = (item, field) => i18n.label(item, field);
const state = {
  type: "pose", poseImages: [], depthImages: [], costumeImages: [], portraitImages: [], images: [], records: [], cards: [],
  series: "", category: "", angle: "", search: "", view: "pose",
  portraitSection: "", portraitTarget: "reference",
  visibleCount: 60, current: -1, selected: null,
  composition: {
    pose: null, depth: null, referenceType: "pose", promptMode: "normal", second: null, person: null, background: "white", labels: true,
    mode: "reference", gridItems: [],
    gridBackground: "white", gridLabels: true, gridUsePerson: false
  }
};
function uniq(arr) { return [...new Set(arr)]; }
function element(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = String(text);
  return e;
}
const composeUI = window.ReferenceCompositionUI({
  state, t, label, $, element,
  composition: window.ReferenceComposition,
  choosePose: () => switchType("pose"),
  chooseDepth: () => switchType("depth"),
  chooseCostume: () => switchType("costume"),
  choosePortrait: (target) => {
    state.portraitTarget = target;
    switchType("portrait");
  },
  openComposition: () => switchType("compose")
});
function groupImages(records) {
  const result = new Map();
  for (const img of records) {
    if (!result.has(img.pose_key)) result.set(img.pose_key, { images: [] });
    result.get(img.pose_key).images.push(img);
  }
  return [...result.values()];
}
function preferred(card) {
  return card.images.find((x) => x.angle === state.angle) ||
    card.images[0];
}
function updateSeries() {
  $("series").hidden = !["pose", "depth", "portrait"].includes(state.type);
  if (state.type === "portrait") {
    $("series").replaceChildren(...["", "face", "styling"].map((section) => {
      const button = element("button", state.portraitSection === section ? "active" : "",
        t(section ? section === "face" ? "portraitFace" : "portraitStyling" : "portraitAll"));
      button.type = "button";
      button.onclick = () => { state.portraitSection = section; render(); };
      return button;
    }));
    return;
  }
  if (!["pose", "depth"].includes(state.type)) return;
  const names = ["", ...uniq(state.images.map((d) => d.series))];
  $("series").replaceChildren(...names.map((name) => {
    const localized = state.images.find((d) => d.series === name);
    const b = element("button", state.series === name ? "active" : "", name ? label(localized, "series") : t("allSeries"));
    b.type = "button";
    b.onclick = () => { state.series = name; state.category = ""; updateCategories(); render(); };
    return b;
  }));
}
function updateCategories() {
  const selector = $("category");
  const values = uniq(state.images.filter((x) => !state.series || x.series === state.series).map((x) => x.category))
    .sort((a, b) => {
      const az = label(state.images.find((x) => x.category === a), "category");
      const bz = label(state.images.find((x) => x.category === b), "category");
      return az.localeCompare(bz, i18n.locale);
    });
  selector.replaceChildren(new Option(t("allCategories"), ""),
    ...values.map((x) => new Option(label(state.images.find((d) => d.category === x), "category"), x)));
  selector.value = state.category;
}
function updateAngles() {
  $("angle-filter").hidden = !["pose", "depth"].includes(state.type);
  $("view-filter").hidden = !["pose", "depth"].includes(state.type);
  if (!["pose", "depth"].includes(state.type)) return;
  const selector = $("angle");
  selector.replaceChildren(new Option(t("allAngles"), ""), ...uniq(state.images.map((d) => d.angle)).map((angle) =>
    new Option(label(state.images.find((d) => d.angle === angle), "angle"), angle)));
  selector.value = state.angle;
}
function matches(d) {
  if (state.type === "portrait" && state.portraitSection && d.section !== state.portraitSection) return false;
  if (state.series && d.series !== state.series) return false;
  if (state.category && d.category !== state.category) return false;
  if (state.angle && d.angle !== state.angle) return false;
  const q = state.search.toLocaleLowerCase();
  if (!q) return true;
  return [d.id, d.pose_number, d.style, d.category_ja, d.category_zh, d.category_en, ...i18n.searchable(d)]
    .some((v) => String(v).toLocaleLowerCase().includes(q));
}
function createCard(card, index) {
  const active = preferred(card);
  const costume = state.type === "costume";
  const portrait = state.type === "portrait";
  const root = element("article", "card");
  root.tabIndex = 0;
  root.setAttribute("role", "button");
  const cover = element("div", "cover");
  const image = element("img");
  image.loading = "lazy"; image.decoding = "async";
  image.src = window.ReferenceComposition.imageUrl(active.thumbnail);
  image.alt = portrait ? t("portraitName", t(active.section === "face" ? "portraitFace" : "portraitStyling"), label(active, "category"))
    : costume ? t("costumeName", label(active, "category"), active.id)
    : label(active, "pose_name") + " / " + label(active, "angle");
  cover.append(image);
  root.append(cover);
  const info = element("div", "card-info");
  info.append(element("div", "code", costume || portrait ? active.id : active.pose_number + " / " + active.id));
  info.append(element("div", "name", costume
    ? t("costumeName", label(active, "category"), active.id)
    : portrait ? t("portraitName", t(active.section === "face" ? "portraitFace" : "portraitStyling"), label(active, "category"))
    : label(active, "pose_name")));
  const pills = element("div", "pills");
  (portrait ? [t(active.section === "face" ? "portraitFace" : "portraitStyling"), label(active, "category")] :
    costume ? [label(active, "category")] :
    [label(active, "series"), label(active, "category"), t("angles", card.images.length)])
    .forEach((value) => pills.append(element("span", "", value)));
  info.append(pills);
  if (costume || portrait && active.style) info.append(element("p", "costume-keywords", portrait ? active.style : active.keywords));
  if (!costume && !portrait && card.images.length > 1) {
    const strip = element("div", "strip");
    for (const img of card.images.slice(0, 5)) {
      const small = element("img"); small.loading = "lazy"; small.src = window.ReferenceComposition.imageUrl(img.thumbnail);
      small.title = label(img, "angle"); small.alt = label(img, "angle"); strip.append(small);
    }
    info.append(strip);
  }
  root.append(info);
  root.onclick = () => openImage(index, active);
  root.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openImage(index, active); } };
  return root;
}
function render() {
  if (state.type === "compose") return;
  updateSeries();
  state.records = state.images.filter(matches);
  if (["pose", "depth"].includes(state.type) && state.view === "pose") {
    const keys = new Set(state.records.map((x) => x.pose_key));
    state.cards = groupImages(state.images.filter((x) => keys.has(x.pose_key)));
  } else {
    state.cards = state.records.map((d) => ({ images: [d] }));
  }
  const frag = document.createDocumentFragment();
  state.cards.slice(0, state.visibleCount).forEach((card, index) => frag.append(createCard(card, index)));
  $("grid").replaceChildren(frag);
  $("result").textContent = state.type === "portrait"
    ? t("portraitResults", state.records.length, Math.min(state.visibleCount, state.cards.length))
    : state.type === "costume"
    ? (state.records.length ? t("costumeResults", state.records.length, Math.min(state.visibleCount, state.cards.length)) : t("costumeEmpty"))
    : state.records.length
    ? t("results", state.records.length, uniq(state.records.map((x) => x.pose_key)).length, state.cards.length)
    : t("empty");
  $("load-more").hidden = state.cards.length <= state.visibleCount;
}
function openImage(index, image) {
  state.current = index; state.selected = image;
  $("overlay").hidden = false; document.body.style.overflow = "hidden";
  drawImage();
}
function drawImage() {
  const card = state.cards[state.current];
  if (!card) return;
  const costume = state.type === "costume";
  const portrait = state.type === "portrait";
  const image = card.images.find((x) => x.id === state.selected?.id) || preferred(card);
  state.selected = image;
  $("imageId").textContent = costume || portrait ? image.id : image.id + " · " + image.pose_number;
  $("poseTitle").textContent = portrait
    ? t("portraitName", t(image.section === "face" ? "portraitFace" : "portraitStyling"), label(image, "category"))
    : costume
    ? t("costumeName", label(image, "category"), image.id) : label(image, "pose_name");
  $("imageMeta").textContent = portrait ? image.style || label(image, "category") : costume ? image.keywords
    : ["series", "category", "angle"].map((field) => label(image, field)).join(" / ");
  $("largeImage").src = window.ReferenceComposition.imageUrl(costume ? image.preview : image.original);
  $("largeImage").alt = $("poseTitle").textContent;
  $("download").href = window.ReferenceComposition.imageUrl(image.original);
  $("download").download = image.id + (image.original.toLowerCase().endsWith(".svg") ? ".svg" : ".png");
  $("add-to-compose").textContent = t(portrait ? "addPortrait" : state.type === "depth" ? "addDepth" : state.type === "pose" ? "addPose" : "addCostume");
  $("toggle-pose-depth").hidden = !["pose", "depth"].includes(state.type);
  $("toggle-pose-depth").textContent = t(state.type === "pose" ? "viewMatchingDepth" : "viewMatchingPose");
  $("position").textContent = (state.current + 1) + " / " + state.cards.length;
  $("angles").hidden = costume || portrait;
  $("angles").replaceChildren(...(costume || portrait ? [] : card.images.map((item) => {
      const button = element("button", item.id === image.id ? "active" : "", label(item, "angle"));
      button.type = "button";
      button.onclick = () => { state.selected = item; drawImage(); };
      return button;
    })));
}
function shiftPose(n) {
  if (state.current < 0) return;
  state.current = (state.current + n + state.cards.length) % state.cards.length;
  state.selected = preferred(state.cards[state.current]); drawImage();
}
function shiftAngle(n) {
  if (!["pose", "depth"].includes(state.type)) return shiftPose(n);
  const card = state.cards[state.current];
  if (!card) return;
  const images = card.images;
  const i = images.findIndex((x) => x.id === state.selected.id);
  state.selected = images[(i + n + images.length) % images.length]; drawImage();
}
function closeImage() {
  $("overlay").hidden = true; state.current = -1; document.body.style.overflow = "";
}
function refreshStaticText() {
  document.documentElement.lang = i18n.locale;
  for (const [id, key] of Object.entries({
    eyebrow: "eyebrow", tagline: "tagline", description: "description",
    "search-label": "searchLabel", "category-label": "categoryLabel", "angle-label": "angleLabel",
    "view-label": "viewLabel", "view-pose": "viewPose", "view-image": "viewImage",
    reset: "reset", "footer-note": "footer",
    download: "download", "keyboard-hint": "hint"
  })) $(id).textContent = t(key);
  document.title = t("pageTitle");
  $("collection-eyebrow").textContent = t("collectionEyebrow");
  $("collection-title").textContent = t(state.type === "compose" ? "collectionCompose" :
    state.type === "depth" ? "collectionDepth" : state.type === "portrait" ? "collectionPortrait" : state.type === "costume" ? "collectionCostume" : "collectionPose");
  $("type-tabs").setAttribute("aria-label", t("typeNav"));
  $("social-nav").setAttribute("aria-label", t("socialNav"));
  $("footer-social-nav").setAttribute("aria-label", t("socialNav"));
  document.querySelector(".filters").setAttribute("aria-label", t("filterNav"));
  $("grid").setAttribute("aria-label", t("galleryNav"));
  $("type-pose").textContent = t("typePose");
  $("type-costume").textContent = t("typeCostume");
  $("type-portrait").textContent = t("typePortrait");
  $("type-depth").textContent = t("typeDepth");
  $("type-compose").textContent = t("typeCompose");
  $("type-pose").classList.toggle("active", state.type === "pose");
  $("type-costume").classList.toggle("active", state.type === "costume");
  $("type-portrait").classList.toggle("active", state.type === "portrait");
  $("type-depth").classList.toggle("active", state.type === "depth");
  $("type-compose").classList.toggle("active", state.type === "compose");
  $("type-pose").setAttribute("aria-pressed", String(state.type === "pose"));
  $("type-costume").setAttribute("aria-pressed", String(state.type === "costume"));
  $("type-portrait").setAttribute("aria-pressed", String(state.type === "portrait"));
  $("type-depth").setAttribute("aria-pressed", String(state.type === "depth"));
  $("type-compose").setAttribute("aria-pressed", String(state.type === "compose"));
  if (state.type === "depth") {
    $("description").textContent = t("depthDescription");
    $("search-label").textContent = t("searchLabel");
    $("keyboard-hint").textContent = t("hint");
  } else if (state.type === "costume") {
    $("description").textContent = t("costumeDescription");
    $("search-label").textContent = t("costumeSearchLabel");
    $("keyboard-hint").textContent = t("costumeHint");
  } else if (state.type === "portrait") {
    $("description").textContent = t("portraitDescription");
    $("search-label").textContent = t("portraitSearchLabel");
    $("keyboard-hint").textContent = t("portraitHint");
  } else if (state.type === "compose") {
    $("description").textContent = t("composeDescription");
  }
  $("query").placeholder = t(state.type === "portrait" ? "portraitSearchPlaceholder" :
    state.type === "costume" ? "costumeSearchPlaceholder" : "searchPlaceholder");
  $("load-more").textContent = t("loadMore");
  $("dialog").setAttribute("aria-label", t(state.type === "portrait" ? "portraitDialog" :
    state.type === "costume" ? "costumeDialog" : "dialog"));
  $("close").setAttribute("aria-label", t("close"));
  $("prev").setAttribute("aria-label", t("previous"));
  $("next").setAttribute("aria-label", t("next"));
  $("add-to-compose").textContent = t(state.type === "portrait" ? "addPortrait" : state.type === "depth" ? "addDepth" : state.type === "costume" ? "addCostume" : "addPose");
  composeUI.refreshLabels();
  $("lang-zh").setAttribute("aria-pressed", i18n.locale === "zh-CN" ? "true" : "false");
  $("lang-en").setAttribute("aria-pressed", i18n.locale === "en" ? "true" : "false");
  $("lang-ja").setAttribute("aria-pressed", i18n.locale === "ja" ? "true" : "false");
  if (state.poseImages.length) {
    $("counts").textContent = t("countsWithDepth", state.poseImages.length, state.depthImages.length,
      state.costumeImages.length, state.portraitImages.length);
  } else $("counts").textContent = t("loadingCounts");
}
function changeLanguage(locale) {
  i18n.setLocale(locale);
  refreshStaticText();
  if (state.type !== "compose") {
    updateCategories(); updateAngles();
    if (state.images.length) render();
  } else composeUI.updateComposition();
  if (!$("overlay").hidden) drawImage();
}
function initialize() {
  refreshStaticText();
  try {
    state.poseImages = window.POSE_GALLERY_CATALOG;
    state.depthImages = window.DEPTH_GALLERY_CATALOG;
    state.costumeImages = window.COSTUME_GALLERY_CATALOG;
    state.portraitImages = window.PORTRAIT_GALLERY_CATALOG;
    if (!Array.isArray(state.poseImages) || !state.poseImages.length ||
        !Array.isArray(state.depthImages) || state.depthImages.length !== state.poseImages.length ||
        !Array.isArray(state.costumeImages) || !state.costumeImages.length ||
        !Array.isArray(state.portraitImages) || !state.portraitImages.length) {
      throw new Error("A catalog is missing or contains no images");
    }
    state.images = state.poseImages;
    refreshStaticText();
    updateCategories();
    updateAngles();
    render();
  } catch (e) {
    $("result").textContent = t("loadError", e.message);
  }
}
function resetFilters() {
  state.series = state.category = state.angle = state.search = "";
  state.view = "pose";
  state.visibleCount = 60;
  $("query").value = ""; $("angle").value = ""; $("view").value = "pose";
  updateCategories(); render();
}
function switchType(type) {
  if (state.type === type) return;
  composeUI.closePreview();
  if (!$("overlay").hidden) closeImage();
  state.type = type;
  $("browser-panel").hidden = type === "compose";
  $("compose-panel").hidden = type !== "compose";
  if (type === "compose") {
    refreshStaticText();
    composeUI.updateComposition();
    return;
  }
  state.images = type === "portrait" ? state.portraitImages :
    type === "costume" ? state.costumeImages : type === "depth" ? state.depthImages : state.poseImages;
  resetFilters();
  updateAngles();
  refreshStaticText();
}
function addCurrentToComposition() {
  if (!state.selected) return;
  if (state.type === "pose") {
    if (composeUI.isReferenceLocked("pose")) return;
    composeUI.rememberReference();
    composeUI.clearReferencePoseOverride();
    composeUI.setReferenceType("pose");
    state.composition.pose = state.selected;
    composeUI.syncDepthToPose();
    closeImage();
    switchType("costume");
  } else if (state.type === "depth") {
    if (composeUI.isReferenceLocked("pose")) return;
    composeUI.setDepthFromCatalog(state.selected);
    closeImage();
    switchType("compose");
  } else if (state.type === "costume") {
    if (composeUI.isReferenceLocked("costume")) return;
    composeUI.rememberReference();
    composeUI.releaseUploadedImage();
    state.composition.second = state.selected;
    closeImage();
    switchType("compose");
  } else if (state.type === "portrait") {
    composeUI.setPersonFromCatalog(state.selected, state.portraitTarget);
    closeImage();
    switchType("compose");
  }
}
$("type-pose").onclick = () => switchType("pose");
$("type-costume").onclick = () => switchType("costume");
$("type-portrait").onclick = () => switchType("portrait");
$("type-depth").onclick = () => switchType("depth");
$("type-compose").onclick = () => switchType("compose");
$("add-to-compose").onclick = addCurrentToComposition;
$("toggle-pose-depth").onclick = () => {
  if (!state.selected || !["pose", "depth"].includes(state.type)) return;
  const id = state.selected.id;
  const target = state.type === "pose" ? "depth" : "pose";
  closeImage();
  switchType(target);
  const index = state.cards.findIndex((card) => card.images.some((entry) => entry.id === id));
  if (index >= 0) openImage(index, state.cards[index].images.find((entry) => entry.id === id));
};
composeUI.bind();
$("lang-zh").onclick = () => changeLanguage("zh-CN");
$("lang-en").onclick = () => changeLanguage("en");
$("lang-ja").onclick = () => changeLanguage("ja");
$("query").oninput = (e) => { state.search = e.target.value.trim(); state.visibleCount = 60; render(); };
$("category").onchange = (e) => { state.category = e.target.value; state.visibleCount = 60; render(); };
$("angle").onchange = (e) => { state.angle = e.target.value; state.visibleCount = 60; render(); };
$("view").onchange = (e) => { state.view = e.target.value; state.visibleCount = 60; render(); };
$("reset").onclick = resetFilters;
$("load-more").onclick = () => { state.visibleCount += 60; render(); };
$("close").onclick = closeImage;
$("prev").onclick = () => shiftPose(-1);
$("next").onclick = () => shiftPose(1);
$("overlay").onclick = (e) => { if (e.target === $("overlay")) closeImage(); };
document.addEventListener("keydown", (e) => {
  if ($("overlay").hidden) return;
  if (e.key === "Escape") closeImage();
  else if (e.key === "ArrowLeft") { e.preventDefault(); shiftAngle(-1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); shiftAngle(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); shiftPose(-1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); shiftPose(1); }
});
initialize();
