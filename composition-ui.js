"use strict";
// Composition UI controller. Canvas rendering and file access stay in composition.js.
window.ReferenceCompositionUI = ({state, composition, t, label, $, element, choosePose, chooseCostume, choosePortrait, openComposition}) => {
  let previewVersion = 0;
  let previewOpener = null;
  let gridPersonInitialized = false;
  let poseGroupsSource = null;
  let poseGroups = [];
  let filters = { outfit: "", pose: "", duo: false, portraitSection: "face", portraitHair: "" };
  const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
  const maxUploadBytes = 50 * 1024 * 1024;
  const validImageFile = (file) => file && imageTypes.has(file.type) &&
    file.size > 0 && file.size <= maxUploadBytes;

  // Draw uniformly from pose groups (then angles), not from repeated images:
  // a group with five angles should not be five times more likely to appear.
  function getPoseGroups() {
    if (poseGroupsSource !== state.poseImages) {
      const groups = new Map();
      for (const item of state.poseImages) {
        if (!groups.has(item.pose_key)) groups.set(item.pose_key, []);
        groups.get(item.pose_key).push(item);
      }
      poseGroups = [...groups.values()];
      poseGroupsSource = state.poseImages;
    }
    return poseGroups;
  }
  function pickDifferent(items, excluded, key) {
    if (!items.length) return null;
    const alternatives = items.filter((item) => key(item) !== excluded);
    const pool = alternatives.length ? alternatives : items;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const isDuo = (record) => record.series === "2人絡み";
  function eligiblePoseGroups() {
    return getPoseGroups().filter((images) =>
      (filters.duo || !isDuo(images[0])) &&
      (!filters.pose || images[0].category === filters.pose));
  }
  function eligibleOutfits() {
    return state.costumeImages.filter((item) => !filters.outfit || item.category === filters.outfit);
  }
  function eligiblePortraits() {
    return state.portraitImages.filter((item) =>
      (!filters.portraitSection || item.section === filters.portraitSection) &&
      (!filters.portraitHair || item.category === filters.portraitHair));
  }
  function updatePoolCount() {
    $("compose-random-pool-size").textContent =
      t("composeRandomRange", eligiblePoseGroups().length, eligibleOutfits().length,
        eligiblePortraits().length);
  }
  function refreshRandomFilters() {
    const outfits = [...new Set(state.costumeImages.map((item) => item.category))];
    const outfitSelect = $("compose-random-outfit-filter");
    outfitSelect.replaceChildren(new Option(t("composeAllOutfits"), ""),
      ...outfits.map((category) => {
        const item = state.costumeImages.find((x) => x.category === category);
        return new Option(label(item, "category"), category);
      }));
    outfitSelect.value = filters.outfit;

    const categories = new Map();
    for (const group of getPoseGroups()) {
      const item = group[0];
      if (!filters.duo && isDuo(item)) continue;
      if (!categories.has(item.category)) categories.set(item.category, label(item, "category"));
    }
    if (filters.pose && !categories.has(filters.pose)) filters.pose = "";
    const poseSelect = $("compose-random-pose-filter");
    poseSelect.replaceChildren(new Option(t(filters.duo ? "composeAllPoses" : "composeSoloPoses"), ""),
      ...[...categories].sort((a, b) => a[1].localeCompare(b[1]))
        .map(([category, name]) => new Option(name, category)));
    poseSelect.value = filters.pose;
    const sectionSelect = $("compose-random-portrait-section");
    sectionSelect.replaceChildren(
      new Option(t("composeAllPortraitSections"), ""),
      new Option(t("portraitFace"), "face"),
      new Option(t("portraitStyling"), "styling")
    );
    sectionSelect.value = filters.portraitSection;
    const hairSelect = $("compose-random-portrait-hair");
    hairSelect.replaceChildren(new Option(t("composeAllPortraitHair"), ""),
      ...["short", "medium", "semi-long", "long"].map((category) => {
        const item = state.portraitImages.find((x) => x.category === category);
        return new Option(item ? label(item, "category") : category, category);
      }));
    hairSelect.value = filters.portraitHair;
    $("compose-random-include-duo").checked = filters.duo;
    updatePoolCount();
  }
  const isGrid = () => ["four", "nine"].includes(state.composition.mode);
  const gridCount = () => state.composition.mode === "nine" ? 9 : 4;
  const randomAngle = (group) => group[Math.floor(Math.random() * group.length)];
  const gridPool = () => ({ poses: eligiblePoseGroups(), outfits: eligibleOutfits() });
  function shuffleList(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[k]] = [shuffled[k], shuffled[i]];
    }
    return shuffled;
  }
  function selectFresh(items, previous, key, count) {
    const shuffled = shuffleList(items);
    return [
      ...shuffled.filter((item) => !previous.has(key(item))),
      ...shuffled.filter((item) => previous.has(key(item)))
    ].slice(0, count);
  }
  function setGridStatus(key, ...args) {
    $("compose-grid-status").textContent = key ? t(key, ...args) : "";
    $("compose-grid-status").dataset.status = key === "composeGridInsufficient" ? "error" : "";
  }
  function renderGridTiles() {
    const list = $("compose-grid-tiles");
    list.style.setProperty("--grid-count", state.composition.mode === "nine" ? 3 : 2);
    const tiles = state.composition.gridItems.map(({pose, outfit}, index) => {
      const tile = element("button", "compose-grid-tile");
      tile.type = "button";
      tile.title = t("composeGridReroll");
      tile.setAttribute("aria-label", t("composeGridTileLabel", index + 1, pose.id, outfit.id));
      for (const [entry, role] of [[pose, "pose"], [outfit, "outfit"]]) {
        const half = element("span", "compose-grid-half compose-grid-" + role);
        const img = element("img");
        img.alt = entry.id;
        img.loading = "lazy";
        img.src = entry.thumbnail || entry.preview || entry.original;
        half.append(img);
        if (state.composition.gridLabels) {
          half.append(element("span", "compose-grid-tile-code", entry.id));
        }
        tile.append(half);
      }
      tile.append(element("span", "compose-grid-tile-refresh", "↻"));
      tile.onclick = () => rerollGridTile(index);
      return tile;
    });
    list.replaceChildren(...tiles);
    const complete = state.composition.gridItems.length === gridCount();
    for (const id of ["compose-grid-preview", "compose-grid-copy", "compose-grid-download"]) {
      $(id).disabled = !complete;
    }
    $("compose-grid-settings-title").textContent =
      t("composeGridSettings", state.composition.mode === "nine" ? 9 : 4);
    updateGridPersonLabel();
    updateGridPrompt();
    if (!$("compose-preview-overlay").hidden && isGrid()) void renderPreview();
  }
  function updateGridPersonLabel() {
    const hasPerson = !!state.composition.person;
    $("compose-grid-use-person").disabled = !hasPerson;
    $("compose-grid-use-person").checked = hasPerson && state.composition.gridUsePerson;
    $("compose-grid-person-current").textContent = hasPerson
      ? t("composeGridCurrentPerson", state.composition.person.id) : t("composeGridNoPerson");
    const preview = $("compose-grid-person-preview");
    preview.hidden = !hasPerson;
    if (hasPerson) {
      const img = element("img");
      img.alt = state.composition.person.id;
      img.src = state.composition.person.uploadUrl ||
        state.composition.person.thumbnail || state.composition.person.preview ||
        state.composition.person.original;
      preview.replaceChildren(img);
    } else preview.replaceChildren();
  }
  function shuffleGrid(randomizePerson = false) {
    // A user-uploaded portrait is deliberately fixed across full grid shuffles.
    // The separate "Random face" button can still explicitly replace it.
    if (randomizePerson && state.composition.gridUsePerson &&
        !state.composition.person?.uploadUrl && drawRandomPerson()) {
      updateComposition(["person"]);
    }
    const count = gridCount();
    const {poses, outfits} = gridPool();
    if (poses.length < count || outfits.length < count) {
      state.composition.gridItems = [];
      renderGridTiles();
      setGridStatus("composeGridInsufficient", poses.length, outfits.length, count);
      return;
    }
    // Shuffle the pose groups and outfit IDs independently. Both dimensions
    // remain unique, even if there are multiple camera angles for one pose.
    const usedPoses = new Set(state.composition.gridItems.map((pair) => pair.pose.pose_key));
    const usedOutfits = new Set(state.composition.gridItems.map((pair) => pair.outfit.id));
    const orderedPoses = selectFresh(poses, usedPoses, (group) => group[0].pose_key, count);
    const orderedOutfits = selectFresh(outfits, usedOutfits, (item) => item.id, count);
    state.composition.gridItems = orderedPoses.map((group, i) => ({
      pose: randomAngle(group), outfit: orderedOutfits[i]
    }));
    renderGridTiles();
    setGridStatus("composeGridGenerated", count);
  }
  function rerollGridTile(index) {
    const {poses, outfits} = gridPool();
    const current = state.composition.gridItems[index];
    if (!current) return;
    const usedPoses = new Set(state.composition.gridItems
      .filter((_, i) => i !== index).map((pair) => pair.pose.pose_key));
    const usedOutfits = new Set(state.composition.gridItems
      .filter((_, i) => i !== index).map((pair) => pair.outfit.id));
    const poseChoices = poses.filter((group) =>
      !usedPoses.has(group[0].pose_key) && group[0].pose_key !== current.pose.pose_key);
    const outfitChoices = outfits.filter((item) =>
      !usedOutfits.has(item.id) && item.id !== current.outfit.id);
    if (!poseChoices.length || !outfitChoices.length) {
      setGridStatus("composeGridNoAlternative");
      return;
    }
    state.composition.gridItems[index] = {
      pose: randomAngle(poseChoices[Math.floor(Math.random() * poseChoices.length)]),
      outfit: outfitChoices[Math.floor(Math.random() * outfitChoices.length)]
    };
    renderGridTiles();
    setGridStatus("composeGridTileUpdated", index + 1);
  }
  function setMode(mode) {
    state.composition.mode = mode;
    for (const item of ["reference", "four", "nine"]) {
      const button = $("compose-mode-" + item);
      button.classList.toggle("active", mode === item);
      button.setAttribute("aria-pressed", String(mode === item));
    }
    $("compose-workbench").hidden = isGrid();
    $("compose-grid-panel").hidden = !isGrid();
    document.querySelector(".compose-random-bar").hidden = isGrid();
    if (isGrid()) {
      if (!gridPersonInitialized) {
        if (!state.composition.person) drawRandomPerson();
        state.composition.gridUsePerson = !!state.composition.person;
        gridPersonInitialized = true;
        updateComposition(["person"]);
      }
      const {poses, outfits} = gridPool();
      const allowedPoses = new Set(poses.map((group) => group[0].pose_key));
      const allowedOutfits = new Set(outfits.map((item) => item.id));
      if (state.composition.gridItems.length !== gridCount() ||
          state.composition.gridItems.some(({pose, outfit}) =>
            !allowedPoses.has(pose.pose_key) || !allowedOutfits.has(outfit.id))) {
        shuffleGrid();
      }
      else renderGridTiles();
    } else if (!$("compose-preview-overlay").hidden) void renderPreview();
    syncComposeFolderNotice();
  }
  // The composition module owns its own controls and translations; the gallery
  // controller only needs to refresh them when the selected language changes.
  function refreshLabels() {
    const keys = {
      "compose-pose-label": "composePose", "compose-costume-label": "composeSecond",
      "compose-random-title": "composeRandomTitle", "compose-random-hint": "composeRandomHint",
      "compose-random-pair-label": "composeRandomPair",
      "compose-random-pose": "composeRandomPose", "compose-random-costume": "composeRandomCostume",
      "compose-random-outfit-filter-label": "composeOutfitFilter",
      "compose-random-pose-filter-label": "composePoseFilter",
      "compose-random-portrait-section-label": "composePortraitSection",
      "compose-random-portrait-hair-label": "composePortraitHair",
      "compose-random-duo-label": "composeIncludeDuo",
      "compose-prompt-title": "composePromptTitle", "compose-prompt-help": "composePromptHelp",
      "compose-copy-prompt": "composeCopyPrompt", "compose-copy-image": "composeCopyImage",
      "compose-pose-empty": "composeEmptyPose", "compose-costume-empty": "composeEmptySecond",
      "compose-person-label": "composePerson", "compose-person-empty": "composePersonEmpty",
      "compose-person-help": "composePersonHelp",
      "compose-upload-person": "composeUploadPerson", "compose-remove-person": "composeRemovePerson",
      "compose-choose-person": "composeChoosePortrait",
      "compose-random-person": "composeRandomPerson",
      "compose-choose-pose": "choosePose", "compose-choose-costume": "chooseCostume",
      "compose-upload": "uploadImage", "compose-preview-eyebrow": "composeEditorEyebrow",
      "compose-preview-title": "composeEditorTitle", "compose-open-preview": "composeOpenPreview",
      "compose-preview-dialog-title": "composePreviewDialogTitle",
      "compose-preview-hint": "composePreviewHint",
      "compose-preview-copy": "composePreviewCopy",
      "compose-preview-download": "composeDownload",
      "compose-bg-label": "composeBg", "compose-white": "composeWhite",
      "compose-soft": "composeSoft", "compose-labels-label": "composeLabels",
      "compose-help": "composeHelp",
      "compose-download": "composeDownload", "compose-folder-button": "composeFolder",
      "compose-local-title": "composeLocalTitle", "compose-local-step": "composeLocalStep",
      "compose-mode-reference": "composeModeReference",
      "compose-mode-four": "composeModeFour", "compose-mode-nine": "composeModeNine",
      "compose-grid-heading": "composeGridHeading", "compose-grid-hint": "composeGridHint",
      "compose-grid-shuffle": "composeGridShuffle",
      "compose-grid-face-title": "composeGridFaceTitle",
      "compose-grid-person-label": "composeGridPerson",
      "compose-grid-choose-person": "composeGridChoosePerson",
      "compose-grid-random-person": "composeRandomPerson",
      "compose-grid-upload-person": "composeGridUploadPerson",
      "compose-grid-bg-label": "composeBg", "compose-grid-white": "composeWhite",
      "compose-grid-soft": "composeSoft", "compose-grid-labels-label": "composeLabels",
      "compose-grid-export-hint": "composeGridExportHint",
      "compose-grid-prompt-title": "composeGridPromptTitle",
      "compose-grid-prompt-help": "composeGridPromptHelp",
      "compose-grid-copy-prompt": "composeCopyPrompt",
      "compose-grid-preview": "composeOpenPreview",
      "compose-grid-copy": "composeGridCopy", "compose-grid-download": "composeDownload"
    };
    for (const [id, key] of Object.entries(keys)) $(id).textContent = t(key);
    $("compose-preview-close").setAttribute("aria-label", t("close"));
    $("compose-random-filters").setAttribute("aria-label", t("composeRandomTitle"));
    $("compose-mode-tabs").setAttribute("aria-label", t("composeModeLabel"));
    $("compose-grid-tiles").setAttribute("aria-label", t("composeGridHeading"));
    refreshRandomFilters();
    if (isGrid()) renderGridTiles();
  }
  function drawRandomPose() {
    const group = pickDifferent(eligiblePoseGroups(), state.composition.pose?.pose_key,
      (images) => images[0].pose_key);
    if (!group) return false;
    state.composition.pose = group[Math.floor(Math.random() * group.length)];
    return true;
  }
  function drawRandomCostume() {
    const item = pickDifferent(eligibleOutfits(), state.composition.second?.id,
      (costume) => costume.id);
    if (!item) return false;
    releaseUploadedImage();
    state.composition.second = item;
    return true;
  }
  function drawRandomPerson() {
    const item = pickDifferent(eligiblePortraits(), state.composition.person?.id,
      (portrait) => portrait.id);
    if (!item) return false;
    releaseUploadedPerson();
    state.composition.person = item;
    return true;
  }
  function randomize(which) {
    const poseChanged = (which === "both" || which === "pose") && drawRandomPose();
    const costumeChanged = (which === "both" || which === "costume") && drawRandomCostume();
    const personChanged = (which === "both" || which === "person") && drawRandomPerson();
    if (poseChanged || costumeChanged || personChanged) updateComposition([
      ...(poseChanged ? ["pose"] : []), ...(costumeChanged ? ["costume"] : []),
      ...(personChanged ? ["person"] : [])
    ]);
  }

  function releaseUpload(key) {
    const url = state.composition[key]?.uploadUrl;
    if (url) URL.revokeObjectURL(url);
  }
  function releaseUploadedImage() { releaseUpload("second"); }
  function releaseUploadedPerson() { releaseUpload("person"); }
  function compositionOptions() {
    if (isGrid()) return {
      mode: state.composition.mode,
      items: state.composition.gridItems.map(({pose, outfit}) => ({pose, outfit})),
      person: state.composition.gridUsePerson ? state.composition.person : null,
      background: state.composition.gridBackground,
      labels: state.composition.gridLabels
    };
    return { ...state.composition, mode: "reference" };
  }
  const activeEntries = () => isGrid()
    ? [...state.composition.gridItems.flatMap(({pose, outfit}) => [pose, outfit]),
      ...(state.composition.gridUsePerson && state.composition.person ? [state.composition.person] : [])]
    : [state.composition.pose, state.composition.second, state.composition.person].filter(Boolean);
  const hasCompleteSelection = () => isGrid()
    ? state.composition.gridItems.length === gridCount()
    : !!state.composition.pose && !!state.composition.second;
  function setStatus(id, key, error = false) {
    const message = key ? t(key) : "";
    const status = error ? "error" : "";
    $(id).textContent = message;
    $(id).dataset.status = status;
    if (isGrid()) {
      $("compose-grid-status").textContent = message;
      $("compose-grid-status").dataset.status = status;
    }
    if (!$("compose-preview-overlay").hidden) {
      $("compose-preview-action-status").textContent = message;
      $("compose-preview-action-status").dataset.status = status;
    }
  }
  function setComposeStatus(key) {
    setStatus("compose-status", key,
      ["composeExportError", "composeOnlineImageError", "composeMissingFile",
        "composeInvalidUpload"].includes(key));
  }
  function syncComposeFolderNotice() {
    $("compose-local-notice").hidden = location.protocol !== "file:" || !composition.needsFolder();
  }
  function updatePrompt() {
    const { pose, second, person } = state.composition;
    if (!pose || !second) {
      $("compose-prompt-text").value = t("composePromptEmpty");
      return;
    }
    if (person) {
      $("compose-prompt-text").value = t("composePromptThree", pose.id,
        t("composePosLeft"), second.id, t("composePosMiddleHorizontal"), t("composePosRight"));
      return;
    }
    $("compose-prompt-text").value = t("composePrompt", pose.id,
      t("composePosLeft"), second.id, t("composePosRight"));
  }
  function updateGridPrompt() {
    const complete = isGrid() && hasCompleteSelection();
    $("compose-grid-copy-prompt").disabled = !complete;
    $("compose-grid-prompt-status").textContent = "";
    if (!complete) {
      $("compose-grid-prompt-text").value = t("composeGridPromptEmpty");
      return;
    }
    const count = gridCount();
    const columns = count === 9 ? 3 : 2;
    const {person, gridUsePerson, gridItems} = state.composition;
    const shared = gridUsePerson && person
      ? person.uploadUrl ? t("composeGridPromptPersonUpload") :
        t("composeGridPromptPersonCatalog", person.id)
      : t("composeGridPromptNoPerson");
    const pairLines = gridItems.map(({pose, outfit}, index) =>
      t("composeGridPromptPair", index + 1, Math.floor(index / columns) + 1,
        index % columns + 1, pose.id, label(pose, "pose_name") || label(pose, "category"),
        outfit.id, label(outfit, "category")));
    $("compose-grid-prompt-text").value = [
      t("composeGridPromptIntro", count, columns), shared, ...pairLines,
      t("composeGridPromptFinish")
    ].join("\n\n");
  }
  function setCopyStatus(key, error = false) {
    setStatus("compose-copy-status", key, error);
  }
  function closePreview() {
    if ($("compose-preview-overlay").hidden) return;
    $("compose-preview-overlay").hidden = true;
    ++previewVersion;
    document.body.style.overflow = "";
    (previewOpener || $("compose-open-preview")).focus();
  }
  function fitPreviewToViewport(width, height) {
    if ($("compose-preview-overlay").hidden) return;
    const dialog = $("compose-preview-dialog");
    const head = dialog.querySelector(".compose-preview-dialog-head");
    const hint = $("compose-preview-hint");
    const status = $("compose-preview-action-status");
    const ratio = width / height;
    const availableWidth = Math.max(200, window.innerWidth * .96 - 30);
    const overhead = head.offsetHeight + hint.offsetHeight + status.offsetHeight + 34;
    const availableHeight = Math.max(100, window.innerHeight * .96 - overhead);
    const artWidth = Math.min(availableWidth, availableHeight * ratio);
    dialog.style.width = `${Math.round(artWidth + 20)}px`;
    $("compose-preview-stage").style.aspectRatio = `${width} / ${height}`;
  }
  async function renderPreview() {
    if ($("compose-preview-overlay").hidden) return;
    const options = compositionOptions(), version = ++previewVersion;
    const placeholder = $("compose-placeholder");
    placeholder.hidden = false;
    placeholder.textContent = t("composePreviewLoading");
    const buffer = document.createElement("canvas");
    try {
      await composition.draw(buffer, options);
      if (version !== previewVersion || $("compose-preview-overlay").hidden) return;
      const canvas = $("compose-canvas");
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.getContext("2d").drawImage(buffer, 0, 0);
      const sizeText = isGrid()
        ? `${state.composition.mode === "nine" ? 3072 : 2048} × ${state.composition.mode === "nine" ? 3072 : 2048} PNG`
        : `${buffer.width * 2} × ${buffer.height * 2} PNG`;
      $("compose-size").textContent = sizeText;
      $("compose-preview-size").textContent = sizeText;
      fitPreviewToViewport(buffer.width, buffer.height);
      placeholder.hidden = true;
    } catch (_) {
      if (version !== previewVersion || $("compose-preview-overlay").hidden) return;
      placeholder.textContent = t("composePreviewError");
    }
  }
  function openPreview() {
    if (!hasCompleteSelection()) return;
    previewOpener = document.activeElement instanceof HTMLButtonElement &&
      document.activeElement.closest("#compose-panel")
      ? document.activeElement : $(isGrid() ? "compose-grid-preview" : "compose-open-preview");
    $("compose-preview-overlay").hidden = false;
    $("compose-preview-dialog").style.width = "";
    $("compose-preview-stage").style.aspectRatio = "";
    $("compose-preview-action-status").textContent = "";
    document.body.style.overflow = "hidden";
    $("compose-preview-close").focus();
    void renderPreview();
  }
  async function copyPrompt(grid = false) {
    if (grid && !hasCompleteSelection()) return;
    const textarea = $(grid ? "compose-grid-prompt-text" : "compose-prompt-text");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(textarea.value);
      setCopyStatus("composeCopiedPrompt");
      if (grid) $("compose-grid-prompt-status").textContent = t("composeCopiedPrompt");
    } catch (_) {
      $(grid ? "compose-grid-prompt-box" : "compose-prompt-box").open = true;
      textarea.focus();
      textarea.select();
      setCopyStatus("composeCopyError", true);
      if (grid) $("compose-grid-prompt-status").textContent = t("composeCopyError");
    }
  }
  async function copyMergedImage() {
    if (!hasCompleteSelection()) return;
    if (composition.needsFolder() && !(await chooseLocalFolder())) return;
    const buttons = [$("compose-copy-image"), $("compose-grid-copy"), $("compose-preview-copy")];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("CLIPBOARD_UNAVAILABLE");
      }
      const blob = await composition.exportPNG(compositionOptions());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyStatus("composeCopiedImage");
    } catch (err) {
      if (["LOCAL_IMAGE_NOT_FOUND", "LOCAL_ACCESS_REQUIRED"].includes(err.message)) {
        composition.clearFiles();
        syncComposeFolderNotice();
        setCopyStatus("composeMissingFile", true);
      } else {
        setCopyStatus("composeCopyImageError", true);
      }
    } finally {
      buttons.forEach((button) => { button.disabled = !hasCompleteSelection(); });
    }
  }
  function updateComposition(animate = []) {
    // Reference selection survives switching to a four/nine grid, including
    // language changes made while the grid panel is active.
    const options = state.composition;
    syncComposeFolderNotice();
    for (const [key, image] of [["pose", options.pose], ["costume", options.second]]) {
      const panel = $(key === "pose" ? "compose-pose-preview" : "compose-costume-preview");
      panel.querySelector("img")?.remove();
      $(key === "pose" ? "compose-pose-id" : "compose-costume-id").textContent = image?.id || "";
      $(key === "pose" ? "compose-pose-empty" : "compose-costume-empty").hidden = !!image;
      $(key === "pose" ? "compose-pose-meta" : "compose-costume-meta").textContent = !image ? "" :
        key === "pose" ? t("composePoseMeta", label(image, "category"), label(image, "angle")) :
        (image.uploadUrl ? image.id : label(image, "category"));
      if (image) {
        const img = element("img");
        img.alt = image.id;
        img.src = image.uploadUrl || image.thumbnail || image.preview || image.original;
        if (animate.includes(key)) img.classList.add("compose-random-appear");
        panel.prepend(img);
      }
    }
    const personPreview = $("compose-person-preview");
    personPreview.querySelector("img")?.remove();
    $("compose-person-empty").hidden = !!options.person;
    $("compose-person-id").textContent = options.person?.id || "";
    $("compose-remove-person").hidden = !options.person;
    if (options.person) {
      const img = element("img");
      img.alt = options.person.id;
      img.src = options.person.uploadUrl || options.person.thumbnail || options.person.preview || options.person.original;
      personPreview.prepend(img);
    }
    updateGridPersonLabel();
    updateGridPrompt();
    const complete = !!options.pose && !!options.second;
    $("compose-open-preview").disabled = !complete;
    $("compose-download").disabled = !complete;
    $("compose-preview-download").disabled = !complete;
    $("compose-copy-prompt").disabled = !complete;
    $("compose-copy-image").disabled = !complete;
    $("compose-preview-copy").disabled = !complete;
    updatePrompt();
    $("compose-size").textContent = t("composeAdaptiveSize");
    $("compose-preview-hint").textContent = t(options.person ? "composePreviewHintThree" : "composePreviewHint");
    if (!$("compose-preview-overlay").hidden) void renderPreview();
  }
  async function chooseLocalFolder(force = false) {
    if (!force && !composition.needsFolder()) return true;
    try {
      if (await composition.requestFolder()) {
        await composition.checkLocalAccess(activeEntries());
        syncComposeFolderNotice();
        setComposeStatus("composeFolderReady");
        return true;
      }
    } catch (err) {
      if (err.name === "AbortError") return false;
      composition.clearFiles();
      syncComposeFolderNotice();
      setComposeStatus("composeMissingFile");
      return false;
    }
    setComposeStatus("composeSelectFolder");
    $("compose-folder-input").click();
    return false;
  }
  async function downloadComposition() {
    if (!hasCompleteSelection()) return;
    if (composition.needsFolder() && !(await chooseLocalFolder())) return;
    $("compose-download").disabled = true;
    $("compose-grid-download").disabled = true;
    $("compose-preview-download").disabled = true;
    setComposeStatus("composeExporting");
    try {
      const blob = await composition.exportPNG(compositionOptions());
      const name = isGrid()
        ? `${state.composition.mode === "nine" ? "9" : "4"}grid_pose_outfit.png`
        : [state.composition.pose.id, state.composition.second.id]
          .map((s) => String(s).replace(/[^\w.-]/g, "_").slice(0, 48)).join("_") + ".png";
      const href = URL.createObjectURL(blob);
      const link = element("a");
      link.href = href; link.download = name; document.body.append(link);
      link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30000);
      setComposeStatus("composeSaved");
    } catch (err) {
      if (["LOCAL_IMAGE_NOT_FOUND", "LOCAL_ACCESS_REQUIRED"].includes(err.message)) {
        composition.clearFiles();
        syncComposeFolderNotice();
        setComposeStatus("composeMissingFile");
      } else {
        setComposeStatus(err.message === "IMAGE_LOAD_FAILED" && location.protocol !== "file:"
          ? "composeOnlineImageError" : "composeExportError");
      }
    } finally {
      const complete = hasCompleteSelection();
      $("compose-download").disabled = !complete;
      $("compose-grid-download").disabled = !complete;
      $("compose-preview-download").disabled = !complete;
    }
  }
  async function uploadSecondImage(file) {
    if (!file) return;
    if (!validImageFile(file)) {
      setComposeStatus("composeInvalidUpload"); return;
    }
    releaseUploadedImage();
    state.composition.second = { id: file.name, uploadUrl: URL.createObjectURL(file) };
    if (state.type === "compose") updateComposition();
    else openComposition();
  }
  async function uploadPersonImage(file, target = "reference") {
    if (!file) return;
    if (!validImageFile(file)) {
      setComposeStatus("composeInvalidUpload");
      return;
    }
    // Reject corrupt files before replacing a valid selection.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      releaseUploadedPerson();
      state.composition.person = { id: file.name, uploadUrl: url };
      state.composition.gridUsePerson = target === "grid";
      setComposeStatus("");
      updateComposition();
    } catch (_) {
      URL.revokeObjectURL(url);
      setComposeStatus("composeInvalidUpload");
    }
  }
  function removePersonImage() {
    releaseUploadedPerson();
    state.composition.person = null;
    state.composition.gridUsePerson = false;
    updateComposition();
  }
  function setPersonFromCatalog(item, target = "reference") {
    releaseUploadedPerson();
    state.composition.person = item;
    state.composition.gridUsePerson = target === "grid";
    updateComposition();
  }
  function randomizeGridPerson() {
    if (!drawRandomPerson()) {
      setGridStatus("composeNoPortraits");
      return;
    }
    state.composition.gridUsePerson = true;
    updateComposition(["person"]);
  }
  function bind() {
    $("compose-choose-person").onclick = () => choosePortrait("reference");
    $("compose-random-person").onclick = () => randomize("person");
    $("compose-grid-choose-person").onclick = () => choosePortrait("grid");
    $("compose-grid-random-person").onclick = randomizeGridPerson;
    $("compose-grid-upload-person").onclick = () => $("compose-grid-person-input").click();
    $("compose-grid-person-input").onchange = (event) => {
      void uploadPersonImage(event.target.files[0], "grid");
      // Allow the same file to be chosen again after replacing the portrait.
      event.target.value = "";
    };
    $("compose-grid-use-person").onchange = (event) => {
      state.composition.gridUsePerson = event.target.checked && !!state.composition.person;
      updateGridPersonLabel();
      updateGridPrompt();
      if (!$("compose-preview-overlay").hidden) void renderPreview();
    };
    for (const mode of ["reference", "four", "nine"]) {
      $("compose-mode-" + mode).onclick = () => setMode(mode);
    }
    $("compose-grid-shuffle").onclick = () => shuffleGrid(true);
    $("compose-grid-bg").onchange = (event) => {
      state.composition.gridBackground = event.target.value;
      if (!$("compose-preview-overlay").hidden) void renderPreview();
    };
    $("compose-grid-labels").onchange = (event) => {
      state.composition.gridLabels = event.target.checked;
      renderGridTiles();
    };
    $("compose-grid-preview").onclick = openPreview;
    $("compose-grid-copy").onclick = copyMergedImage;
    $("compose-grid-download").onclick = downloadComposition;
    $("compose-open-preview").onclick = openPreview;
    $("compose-preview-close").onclick = closePreview;
    $("compose-preview-copy").onclick = copyMergedImage;
    $("compose-preview-download").onclick = downloadComposition;
    window.addEventListener("resize", () => {
      if (!$("compose-preview-overlay").hidden) {
        const canvas = $("compose-canvas");
        if (canvas.width && canvas.height && $("compose-placeholder").hidden) {
          fitPreviewToViewport(canvas.width, canvas.height);
        }
      }
    });
    $("compose-preview-overlay").onclick = (event) => {
      if (event.target === $("compose-preview-overlay")) closePreview();
    };
    document.addEventListener("keydown", (event) => {
      if ($("compose-preview-overlay").hidden) return;
      if (event.key === "Escape") { event.preventDefault(); closePreview(); }
      // Keep keyboard focus within the preview's working actions.
      if (event.key === "Tab") {
        const controls = [$("compose-preview-copy"), $("compose-preview-download"),
          $("compose-preview-close")].filter((button) => !button.disabled);
        const current = controls.indexOf(document.activeElement);
        if (current !== -1) {
          event.preventDefault();
          const next = (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
          controls[next].focus();
        }
      }
    });
    $("compose-choose-pose").onclick = choosePose;
    $("compose-choose-costume").onclick = chooseCostume;
    $("compose-random-pose").onclick = () => randomize("pose");
    $("compose-random-costume").onclick = () => randomize("costume");
    $("compose-random-pair").onclick = () => randomize("both");
    $("compose-random-portrait-section").onchange = (event) => {
      filters.portraitSection = event.target.value;
      updatePoolCount();
    };
    $("compose-random-portrait-hair").onchange = (event) => {
      filters.portraitHair = event.target.value;
      updatePoolCount();
    };
    $("compose-random-outfit-filter").onchange = (event) => {
      filters.outfit = event.target.value;
      updatePoolCount();
      if (isGrid()) shuffleGrid();
    };
    $("compose-random-pose-filter").onchange = (event) => {
      filters.pose = event.target.value;
      updatePoolCount();
      if (isGrid()) shuffleGrid();
    };
    $("compose-random-include-duo").onchange = (event) => {
      filters.duo = event.target.checked;
      refreshRandomFilters();
      if (isGrid()) shuffleGrid();
    };
    $("compose-copy-prompt").onclick = () => copyPrompt();
    $("compose-grid-copy-prompt").onclick = () => copyPrompt(true);
    $("compose-copy-image").onclick = copyMergedImage;
    $("compose-upload").onclick = () => $("compose-upload-input").click();
    $("compose-upload-input").onchange = (event) => { uploadSecondImage(event.target.files[0]); event.target.value = ""; };
    $("compose-upload-person").onclick = () => $("compose-person-input").click();
    $("compose-person-input").onchange = (event) => { void uploadPersonImage(event.target.files[0]); event.target.value = ""; };
    $("compose-remove-person").onclick = removePersonImage;
    $("compose-folder-button").onclick = () => chooseLocalFolder(true);
    $("compose-folder-input").onchange = (event) => {
      const count = composition.setFiles(event.target.files);
      composition.checkLocalAccess(activeEntries())
        .then(() => {
          if (!count) composition.clearFiles();
          syncComposeFolderNotice();
          setComposeStatus(count ? "composeFolderReady" : "composeMissingFile");
        })
        .catch(() => {
          composition.clearFiles();
          syncComposeFolderNotice();
          setComposeStatus("composeMissingFile");
        });
      event.target.value = "";
    };
    $("compose-download").onclick = downloadComposition;
    $("compose-bg").onchange = (event) => { state.composition.background = event.target.value; updateComposition(); };
    $("compose-labels").onchange = (event) => { state.composition.labels = event.target.checked; updateComposition(); };
  }

  return { bind, updateComposition, closePreview, refreshLabels, releaseUploadedImage, uploadSecondImage,
    setPersonFromCatalog,
    uploadPersonImage, removePersonImage };
};
