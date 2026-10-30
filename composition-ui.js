"use strict";
// Composition UI controller. Canvas rendering and file access stay in composition.js.
window.ReferenceCompositionUI = ({state, composition, t, label, $, element, choosePose, chooseDepth, chooseCostume, choosePortrait, openComposition}) => {
  let previewVersion = 0;
  let previewOpener = null;
  let gridPersonInitialized = false;
  let gridPicker = null, gridPickerLimit = 48, gridUploadTarget = null;
  let gridSingleIndex = -1, gridSingleVersion = 0;
  let gridHistory = [];
  const referenceLocks = {pose: false, costume: false, person: false};
  const referenceHistory = [];
  const referenceUrls = new Set();
  let referencePoseOverride = null;
  function rememberReference() {
    if (isGrid()) return;
    referenceHistory.push({
      pose: state.composition.pose, depth: state.composition.depth,
      second: state.composition.second, person: state.composition.person,
      referenceType: state.composition.referenceType,
      poseOverride: referencePoseOverride,
      locks: {...referenceLocks}
    });
    if (referenceHistory.length > 20) referenceHistory.shift();
    $("compose-reference-undo").disabled = false;
  }
  function undoReference() {
    const snapshot = referenceHistory.pop();
    if (!snapshot) return;
    Object.assign(state.composition, {pose:snapshot.pose, depth:snapshot.depth,
      second:snapshot.second, person:snapshot.person, referenceType:snapshot.referenceType});
    referencePoseOverride = snapshot.poseOverride;
    Object.assign(referenceLocks, snapshot.locks);
    updateComposition();
    $("compose-reference-undo").disabled = !referenceHistory.length;
  }
  function cleanupReferenceUrls() {
    const retained = new Set([
      referencePoseOverride?.uploadUrl,
      state.composition.second?.uploadUrl,
      state.composition.person?.uploadUrl,
      state.composition.depth?.uploadUrl,
      ...referenceHistory.flatMap(s => [s.poseOverride?.uploadUrl,
        s.second?.uploadUrl, s.person?.uploadUrl, s.depth?.uploadUrl])
    ].filter(Boolean));
    for (const url of referenceUrls) if (!retained.has(url)) {
      URL.revokeObjectURL(url);
      referenceUrls.delete(url);
    }
  }
  function toggleReferenceLock(role) {
    rememberReference();
    referenceLocks[role] = !referenceLocks[role];
    updateComposition();
  }
  function refreshReferenceLocks() {
    for (const role of ["pose", "costume", "person"]) {
      const locked = referenceLocks[role], button = $("compose-lock-" + role);
      button.textContent = t(locked ? "composeReferenceUnlock" : "composeReferenceLock",
        t(role === "pose" ? "composeGridPoseName" :
          role === "costume" ? "composeGridOutfitName" : "composePerson"));
      button.setAttribute("aria-pressed", String(locked));
    }
    for (const [role, ids] of Object.entries({
      pose:["compose-choose-pose","compose-random-pose","compose-upload-pose","compose-upload-depth","compose-match-depth","compose-remove-depth"],
      costume:["compose-choose-costume","compose-random-costume","compose-upload"],
      person:["compose-choose-person","compose-random-person","compose-upload-person","compose-remove-person"]
    })) for (const id of ids) $(id).disabled = referenceLocks[role];
  }
  let poseGroupsSource = null;
  let poseGroups = [];
  let filters = { outfit: "", pose: "", duo: false, portraitSection: "face", portraitHair: "" };
  const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
  const maxUploadBytes = 50 * 1024 * 1024;
  const validImageFile = (file) => file && imageTypes.has(file.type) &&
    file.size > 0 && file.size <= maxUploadBytes;
  const depthForPose = (pose) => pose && state.depthImages.find((depth) => depth.id === pose.id) || null;
  const gridPose = (pose, pair) => state.composition.referenceType === "depth"
    ? pair?.depthOverride || (pair?.poseOverride ? pair.poseOverride : depthForPose(pose) || pose)
    : pair?.poseOverride || pose;
  const gridOutfit = (pair) => pair.outfitOverride || pair.outfit;
  const gridHasUnmatchedDepth = () => state.composition.gridItems.some((pair) =>
    pair.poseOverride && !pair.depthOverride);
  const validDepthSignature = async file => {
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    return bytes.length === 8 && [137, 80, 78, 71, 13, 10, 26, 10]
      .every((value, index) => bytes[index] === value);
  };
  const gridSnapshot = () => state.composition.gridItems.map((pair) => ({...pair}));
  function rememberGrid(previousPerson = state.composition.person) {
    if (!state.composition.gridItems.length) return;
    gridHistory.push({mode: state.composition.mode, items: gridSnapshot(),
      person: previousPerson, gridUsePerson: state.composition.gridUsePerson});
    if (gridHistory.length > 20) gridHistory.shift();
    $("compose-grid-undo").disabled = false;
  }
  function undoGrid() {
    if (!gridHistory.length) return;
    const snapshot = gridHistory.pop();
    state.composition.mode = snapshot.mode;
    state.composition.gridItems = snapshot.items;
    state.composition.person = snapshot.person;
    state.composition.gridUsePerson = snapshot.gridUsePerson;
    setMode(snapshot.mode);
    updateComposition();
    $("compose-grid-undo").disabled = !gridHistory.length;
    setGridStatus("composeGridUndone");
  }
  const isLocked = (pair, role) => !!pair?.[role + "Locked"];
  const poseKey = (pair) => pair.poseOverride ? null : pair.pose.pose_key;
  const outfitKey = (pair) => pair.outfitOverride ? null : pair.outfit.id;
  function toggleGridLock(index, role) {
    const pair = state.composition.gridItems[index];
    if (!pair) return;
    rememberGrid();
    pair[role + "Locked"] = !isLocked(pair, role);
    renderGridTiles();
  }
  function toggleGridPairLock(index) {
    const pair = state.composition.gridItems[index];
    if (!pair) return;
    rememberGrid();
    const locked = !(isLocked(pair, "pose") && isLocked(pair, "outfit"));
    pair.poseLocked = pair.outfitLocked = locked;
    renderGridTiles();
  }
  function replaceGridEntry(index, role, entry, override = false) {
    const pair = state.composition.gridItems[index];
    if (!pair || isLocked(pair, role)) return;
    if (!override) {
      const duplicated = state.composition.gridItems.some((other, i) => i !== index &&
        (role === "pose" ? poseKey(other) === entry.pose_key : outfitKey(other) === entry.id));
      if (duplicated) return setGridStatus("composeGridDuplicate");
    }
    rememberGrid();
    if (role === "pose") {
      if (override) pair.poseOverride = entry;
      else { pair.pose = entry; pair.poseOverride = null; pair.depthOverride = null; }
    } else {
      if (override) pair.outfitOverride = entry;
      else { pair.outfit = entry; pair.outfitOverride = null; }
    }
    if (state.composition.promptMode === "professional" && gridHasUnmatchedDepth())
      state.composition.promptMode = "normal";
    refreshReferenceControls();
    renderGridTiles();
    setGridStatus("composeGridImageUpdated", index + 1);
  }
  const selectedReference = () => {
    const options = state.composition;
    if (referencePoseOverride) return referencePoseOverride;
    if (options.referenceType !== "depth") return options.pose;
    return options.depth?.uploadUrl ? options.depth : depthForPose(options.pose);
  };

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
  function gridActionIcon(kind) {
    // Small outline icons drawn with the same stroke as the rest of the site.
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "17");
    svg.setAttribute("height", "17");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const paths = {
      lock: ["M5 11V7a7 7 0 0 1 14 0v4", "M5 11h14v10H5z"],
      unlock: ["M5 11V7a7 7 0 0 1 13.5-2.5", "M5 11h14v10H5z"],
      reroll: ["M20 7v5h-5", "M4 17v-5h5",
        "M5.7 9A7 7 0 0 1 18.9 7L20 12",
        "M18.3 15A7 7 0 0 1 5.1 17L4 12"],
      preview: ["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z",
        "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"]
    };
    for (const d of paths[kind]) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }
  function renderGridTiles() {
    const list = $("compose-grid-tiles");
    list.style.setProperty("--grid-count", state.composition.mode === "nine" ? 3 : 2);
    list.classList.toggle("compose-grid-tiles-nine", state.composition.mode === "nine");
    const tiles = state.composition.gridItems.map((pair, index) => {
      const tile = element("article", "compose-grid-tile");
      const heading = element("div", "compose-grid-tile-head");
      const details = element("button", "compose-grid-detail-link");
      details.type = "button";
      details.append(gridActionIcon("preview"), document.createTextNode(t("composeGridSingleView")));
      details.setAttribute("aria-label", t("composeGridCellNumber", index + 1) +
        " · " + t("composeGridSingleView"));
      details.onclick = () => void openGridSingle(index);
      heading.append(details);
      const headerActions = element("div", "compose-grid-tile-tools");
      const pairLocked = isLocked(pair, "pose") && isLocked(pair, "outfit");
      const pairLock = element("button", "compose-grid-pair-lock compose-grid-icon-button");
      pairLock.type = "button";
      pairLock.append(gridActionIcon(pairLocked ? "lock" : "unlock"));
      pairLock.title = t(pairLocked ? "composeGridPairUnlock" : "composeGridPairLock");
      pairLock.setAttribute("aria-label", t("composeGridCellNumber", index + 1) +
        " · " + pairLock.title);
      pairLock.setAttribute("aria-pressed", String(pairLocked));
      pairLock.onclick = () => toggleGridPairLock(index);
      headerActions.append(pairLock);
      const reroll = element("button", "compose-grid-reroll-pair compose-grid-icon-button");
      reroll.type = "button";
      reroll.append(gridActionIcon("reroll"));
      reroll.title = t("composeGridReroll");
      reroll.setAttribute("aria-label", t("composeGridCellNumber", index + 1) +
        " · " + reroll.title);
      reroll.disabled = pairLocked;
      reroll.onclick = () => rerollGridTile(index);
      headerActions.append(reroll);
      heading.append(headerActions);
      tile.append(heading);
      const images = element("div", "compose-grid-tile-images");
      for (const [entry, role] of [[gridPose(pair.pose, pair), "pose"], [gridOutfit(pair), "outfit"]]) {
        const column = element("div", "compose-grid-image-column");
        const half = element("div", "compose-grid-half compose-grid-" + role);
        const img = element("img");
        img.alt = entry.id;
        img.loading = "lazy";
        img.src = composition.imageUrl(entry.uploadUrl || entry.thumbnail || entry.preview || entry.original);
        half.append(img);
        if (state.composition.gridLabels && !entry.uploadUrl) {
          half.append(element("span", "compose-grid-tile-code", entry.id));
        }
        const locked = isLocked(pair, role);
        const lock = element("button", "compose-grid-lock" + (locked ? " is-locked" : ""));
        lock.type = "button";
        lock.append(gridActionIcon(locked ? "lock" : "unlock"));
        lock.setAttribute("aria-pressed", String(locked));
        lock.setAttribute("aria-label", t("composeGridLockLabel", index + 1, role, isLocked(pair, role)));
        lock.onclick = () => toggleGridLock(index, role);
        half.append(lock);
        column.append(half);
        const actions = element("div", "compose-grid-image-actions");
        for (const [key, handler] of [
          ["composeGridChooseOne", () => openGridPicker(index, role)],
          ["composeGridRandomOne", () => rerollGridImage(index, role)],
          ["composeGridUploadOne", () => beginGridUpload(index, role)]
        ]) {
          const button = element("button", "compose-grid-pill", t(key));
          button.type = "button";
          button.disabled = isLocked(pair, role);
          button.setAttribute("aria-label", t("composeGridCellNumber", index + 1) +
            " · " + t(role === "pose" ? "composeGridPoseName" : "composeGridOutfitName") + " · " + t(key));
          button.onclick = handler;
          actions.append(button);
        }
        column.append(actions);
        images.append(column);
      }
      tile.append(images);
      return tile;
    });
    list.replaceChildren(...tiles);
    const complete = state.composition.gridItems.length === gridCount();
    for (const id of ["compose-grid-preview", "compose-grid-copy", "compose-grid-download", "compose-grid-download-panels"]) {
      $(id).disabled = !complete;
    }
    $("compose-grid-settings-title").textContent =
      t("composeGridSettings", state.composition.mode === "nine" ? 9 : 4);
    $("compose-grid-undo").disabled = !gridHistory.length;
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
      img.src = composition.imageUrl(state.composition.person.uploadUrl ||
        state.composition.person.thumbnail || state.composition.person.preview ||
        state.composition.person.original);
      preview.replaceChildren(img);
    } else preview.replaceChildren();
  }
  function shuffleGrid(randomizePerson = false) {
    // A user-uploaded portrait is deliberately fixed across full grid shuffles.
    // The separate "Random face" button can still explicitly replace it.
    const previousPerson = state.composition.person;
    if (randomizePerson && state.composition.gridUsePerson &&
        !state.composition.person?.uploadUrl && drawRandomPerson()) {
      updateComposition(["person"]);
    }
    const count = gridCount();
    const {poses, outfits} = gridPool();
    const old = state.composition.gridItems;
    const fixed = old.slice(0, count);
    const lockedPoses = new Set(fixed.filter((p) => isLocked(p, "pose") && poseKey(p))
      .map(poseKey));
    const lockedOutfits = new Set(fixed.filter((p) => isLocked(p, "outfit") && outfitKey(p))
      .map(outfitKey));
    if (poses.length < count || outfits.length < count) {
      if (old.length) rememberGrid();
      state.composition.gridItems = [];
      renderGridTiles();
      setGridStatus("composeGridInsufficient", poses.length, outfits.length, count);
      return;
    }
    // Shuffle the pose groups and outfit IDs independently. Both dimensions
    // remain unique, even if there are multiple camera angles for one pose.
    const usedPoses = new Set(old.map(poseKey).filter(Boolean));
    const usedOutfits = new Set(old.map(outfitKey).filter(Boolean));
    const remainingPoses = selectFresh(poses.filter(group => !lockedPoses.has(group[0].pose_key)),
      usedPoses, group => group[0].pose_key, count);
    const remainingOutfits = selectFresh(outfits.filter(item => !lockedOutfits.has(item.id)),
      usedOutfits, item => item.id, count);
    if (remainingPoses.length < count - fixed.filter(p => isLocked(p, "pose")).length ||
        remainingOutfits.length < count - fixed.filter(p => isLocked(p, "outfit")).length) {
      return setGridStatus("composeGridNoAlternative");
    }
    rememberGrid(previousPerson);
    state.composition.gridItems = Array.from({length: count}, (_, i) => {
      const previous = old[i];
      const poseLocked = isLocked(previous, "pose");
      const outfitLocked = isLocked(previous, "outfit");
      return {
        pose: poseLocked ? previous.pose : randomAngle(remainingPoses.shift()),
        outfit: outfitLocked ? previous.outfit : remainingOutfits.shift(),
        poseLocked, outfitLocked,
        ...(poseLocked && previous.poseOverride ? {poseOverride: previous.poseOverride} : {}),
        ...(poseLocked && previous.depthOverride ? {depthOverride: previous.depthOverride} : {}),
        ...(outfitLocked && previous.outfitOverride ? {outfitOverride: previous.outfitOverride} : {})
      };
    });
    renderGridTiles();
    setGridStatus("composeGridGenerated", count);
  }
  function rerollGridTile(index) {
    const current = state.composition.gridItems[index];
    if (!current) return;
    const poses = isLocked(current, "pose") ? null : gridRandomChoice(index, "pose");
    const outfit = isLocked(current, "outfit") ? null : gridRandomChoice(index, "outfit");
    if ((!isLocked(current, "pose") && !poses) ||
        (!isLocked(current, "outfit") && !outfit)) return setGridStatus("composeGridNoAlternative");
    if (!poses && !outfit) return;
    rememberGrid();
    if (poses) { current.pose = poses; current.poseOverride = null; current.depthOverride = null; }
    if (outfit) { current.outfit = outfit; current.outfitOverride = null; }
    renderGridTiles();
    setGridStatus("composeGridTileUpdated", index + 1);
  }
  function gridRandomChoice(index, role) {
    const current = state.composition.gridItems[index];
    if (!current || isLocked(current, role)) return null;
    if (role === "pose") {
      const used = new Set(state.composition.gridItems.filter((_, i) => i !== index)
        .map(poseKey).filter(Boolean));
      const choices = eligiblePoseGroups().filter(group =>
        !used.has(group[0].pose_key) && group[0].pose_key !== poseKey(current));
      return choices.length ? randomAngle(choices[Math.floor(Math.random() * choices.length)]) : null;
    }
    const used = new Set(state.composition.gridItems.filter((_, i) => i !== index)
      .map(outfitKey).filter(Boolean));
    const choices = eligibleOutfits().filter(outfit =>
      !used.has(outfit.id) && outfit.id !== outfitKey(current));
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
  }
  function rerollGridImage(index, role) {
    const next = gridRandomChoice(index, role);
    if (!next) return setGridStatus("composeGridNoAlternative");
    replaceGridEntry(index, role, next);
  }
  function pickerEntries() {
    if (!gridPicker) return [];
    const source = gridPicker.role === "outfit" ? state.costumeImages : state.poseImages;
    const query = $("compose-grid-dialog-search").value.trim().toLocaleLowerCase();
    return source.filter(item => !query || [
      item.id, item.pose_key, label(item, "category"), label(item, "pose_name"),
      item.keywords, item.style
    ].some(value => String(value || "").toLocaleLowerCase().includes(query)));
  }
  function renderGridPicker() {
    const all = pickerEntries();
    const used = new Set(state.composition.gridItems.filter((_, i) => i !== gridPicker.index)
      .map(gridPicker.role === "pose" ? poseKey : outfitKey).filter(Boolean));
    const list = all.slice(0, gridPickerLimit).map(item => {
      const button = element("button", "compose-grid-picker-item");
      button.type = "button";
      const duplicate = used.has(gridPicker.role === "pose" ? item.pose_key : item.id);
      button.disabled = duplicate;
      const img = element("img");
      img.loading = "lazy";
      const depth = gridPicker.role === "pose" && state.composition.referenceType === "depth";
      const preview = depth ? depthForPose(item) || item : item;
      img.src = composition.imageUrl(preview.thumbnail || preview.preview || preview.original);
      img.alt = item.id;
      button.append(img, element("span", "", item.id));
      button.title = duplicate ? t("composeGridDuplicate") : item.id;
      button.onclick = () => {
        replaceGridEntry(gridPicker.index, gridPicker.role, item);
        closeGridPicker();
      };
      return button;
    });
    $("compose-grid-dialog-items").replaceChildren(...list);
    $("compose-grid-dialog-more").hidden = gridPickerLimit >= all.length;
  }
  function openGridPicker(index, role) {
    const pair = state.composition.gridItems[index];
    if (!pair || isLocked(pair, role)) return;
    gridPicker = {index, role};
    gridPickerLimit = 48;
    $("compose-grid-dialog-title").textContent = t("composeGridChooseTitle",
      index + 1, t(role === "pose" ? "composeGridPoseName" : "composeGridOutfitName"));
    $("compose-grid-dialog-search").value = "";
    $("compose-grid-dialog").hidden = false;
    renderGridPicker();
    $("compose-grid-dialog-search").focus();
  }
  function closeGridPicker() {
    gridPicker = null;
    $("compose-grid-dialog").hidden = true;
  }
  function beginGridUpload(index, role) {
    if (!state.composition.gridItems[index] || isLocked(state.composition.gridItems[index], role)) return;
    gridUploadTarget = {index, role, pair: state.composition.gridItems[index], mode: state.composition.mode,
      depth: role === "pose" && state.composition.referenceType === "depth"};
    const input = $("compose-grid-image-input");
    input.accept = gridUploadTarget.depth ? "image/png" : "image/png,image/jpeg,image/webp";
    input.click();
  }
  async function uploadGridImage(file, target) {
    if (!file || !target || !validImageFile(file) ||
        (target.depth && file.type !== "image/png")) {
      if (file) setGridStatus("composeInvalidUpload");
      return;
    }
    if (target.depth && !(await validDepthSignature(file))) {
      setGridStatus("composeInvalidDepth");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (target.mode !== state.composition.mode ||
          state.composition.gridItems[target.index] !== target.pair) {
        URL.revokeObjectURL(url);
        return;
      }
      const entry = {id: file.name, uploadUrl: url, localFile: file};
      if (target.depth) {
        rememberGrid();
        target.pair.depthOverride = entry;
        refreshReferenceControls();
        renderGridTiles();
      } else replaceGridEntry(target.index, target.role, entry, true);
    } catch (_) {
      URL.revokeObjectURL(url);
      setGridStatus("composeInvalidUpload");
    }
  }
  function singleOptions(index) {
    const pair = state.composition.gridItems[index];
    return {mode: "reference", pose: gridPose(pair.pose, pair), second: gridOutfit(pair),
      person: state.composition.gridUsePerson ? state.composition.person : null,
      background: state.composition.gridBackground, labels: state.composition.gridLabels};
  }
  function gridSinglePrompt(index) {
    const options = singleOptions(index);
    const depth = state.composition.referenceType === "depth";
    const person = options.person;
    const personLine = person ? t(person.uploadUrl ?
      "composeGridPromptPersonUpload" : "composeGridPromptPersonCatalog", person.id) :
      t("composeGridPromptNoPerson");
    const intro = t("composeGridSingleIntro");
    const matchingDepth = depth && !(state.composition.gridItems[index].poseOverride &&
      !state.composition.gridItems[index].depthOverride);
    const detail = t(matchingDepth ? "composeGridDepthPair" : "composeGridPromptPair",
      index + 1, 1, 1, options.pose.id,
      options.pose.uploadUrl ? t("composeGridCustom") : label(state.composition.gridItems[index].pose, "pose_name"),
      options.second.id, options.second.uploadUrl ? t("composeGridCustom") : label(options.second, "category"));
    let depthLine = "";
    if (depth) depthLine = !matchingDepth ? t("composeGridCustomPoseVisual") :
      state.composition.promptMode === "professional" && !gridHasUnmatchedDepth() ?
        t("composeGridSingleProfessionalDepth", String(index + 1).padStart(2, "0")) :
        t("composeDepthVisualPrompt");
    return [intro, personLine, detail, depthLine, t("composeGridSingleFinish")]
      .filter(Boolean).join("\n\n");
  }
  async function openGridSingle(index) {
    if (!isGrid() || !state.composition.gridItems[index]) return;
    gridSingleIndex = index;
    $("compose-grid-single-dialog").hidden = false;
    $("compose-grid-single-title").textContent = t("composeGridSingleTitle", index + 1);
    $("compose-grid-single-prompt").value = gridSinglePrompt(index);
    $("compose-grid-single-status").textContent = t("composePreviewLoading");
    const version = ++gridSingleVersion;
    try {
      const canvas = $("compose-grid-single-canvas");
      if (composition.needsFolder() && !(await chooseLocalFolder())) throw new Error("LOCAL_ACCESS_REQUIRED");
      await composition.draw(canvas, singleOptions(index));
      if (version === gridSingleVersion) $("compose-grid-single-status").textContent = "";
    } catch (_) {
      if (version === gridSingleVersion)
        $("compose-grid-single-status").textContent = t("composePreviewError");
    }
  }
  function closeGridSingle() {
    ++gridSingleVersion;
    gridSingleIndex = -1;
    $("compose-grid-single-dialog").hidden = true;
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url; link.download = name; document.body.append(link);
    link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function downloadGridSingle() {
    if (gridSingleIndex < 0) return;
    const index = gridSingleIndex;
    try {
      if (composition.needsFolder() && !(await chooseLocalFolder())) return;
      const blob = await composition.exportPNG(singleOptions(index));
      saveBlob(blob, String(index + 1).padStart(2, "0") + "_reference.png");
      $("compose-grid-single-status").textContent = t("composeSaved");
    } catch (_) {
      $("compose-grid-single-status").textContent = t("composeExportError");
    }
  }
  function setMode(mode) {
    if (state.composition.mode !== mode) {
      // Undo is scoped to one grid size to avoid replaying four cells into a nine-grid.
      gridHistory = [];
      $("compose-grid-undo").disabled = true;
      if (!$("compose-grid-dialog").hidden) closeGridPicker();
      if (!$("compose-grid-single-dialog").hidden) closeGridSingle();
    }
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
      "compose-costume-label": "composeSecond",
      "compose-reference-depth-label": "composeReferenceDepthCheckbox",
      "compose-grid-depth-label": "composeGridUseDepth",
      "compose-prompt-mode-label": "composePromptModeLabel",
      "compose-grid-prompt-mode-label": "composePromptModeLabel",
      "compose-grid-download-panels": "composeGridExportPanels",
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
      "compose-choose-costume": "chooseCostume",
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
      "compose-match-depth": "composeRestoreDepth",
      "compose-upload-depth": "composeUploadDepth",
      "compose-remove-depth": "composeClearCustomDepth",
      "compose-download-depth": "composeDownloadDepth",
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
    for (const id of ["compose-prompt-mode", "compose-grid-prompt-mode"]) {
      const select = $(id);
      select.options[0].textContent = t("composePromptModeNormal");
      select.options[1].textContent = t("composePromptModeProfessional");
    }
    refreshReferenceControls();
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
    if (state.composition.referenceType === "depth") releaseUploadedDepth();
    syncDepthToPose();
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
    const canPose = !referenceLocks.pose && (which === "both" || which === "pose");
    const canCostume = !referenceLocks.costume && (which === "both" || which === "costume");
    const canPerson = !referenceLocks.person && (which === "both" || which === "person");
    if (canPose || canCostume || canPerson) rememberReference();
    if (canPose) referencePoseOverride = null;
    const poseChanged = canPose && drawRandomPose();
    const costumeChanged = canCostume && drawRandomCostume();
    const personChanged = canPerson && drawRandomPerson();
    if (poseChanged || costumeChanged || personChanged) updateComposition([
      ...(poseChanged ? ["pose"] : []), ...(costumeChanged ? ["costume"] : []),
      ...(personChanged ? ["person"] : [])
    ]);
  }

  function releaseUpload(key) {
    const url = state.composition[key]?.uploadUrl;
    if (url) referenceUrls.add(url);
  }
  function releaseUploadedImage() { releaseUpload("second"); }
  function releaseUploadedPerson() { releaseUpload("person"); }
  function releaseUploadedDepth() { releaseUpload("depth"); }
  function setDepthFromCatalog(item) {
    if (!isGrid() && referenceLocks.pose) return;
    rememberReference();
    referencePoseOverride = null;
    releaseUploadedDepth();
    state.composition.depth = item;
    // Catalog Depth and pose IDs are 1:1. Never keep a mismatched pose.
    state.composition.pose = state.poseImages.find((pose) => pose.id === item.id) || state.composition.pose;
    state.composition.referenceType = "depth";
    refreshReferenceControls();
    updateComposition();
  }
  function syncDepthToPose() {
    if (state.composition.depth?.uploadUrl) return;
    state.composition.depth = depthForPose(state.composition.pose);
  }
  function setReferenceType(type) {
    if (!["pose", "depth"].includes(type)) return;
    if (!isGrid() && referenceLocks.pose) return;
    if (!isGrid()) rememberReference();
    state.composition.referenceType = type;
    if (!isGrid()) referencePoseOverride = null;
    if (type === "pose") state.composition.promptMode = "normal";
    if (type === "depth" && isGrid() && gridHasUnmatchedDepth())
      state.composition.promptMode = "normal";
    if (type === "depth" && !state.composition.depth?.uploadUrl) syncDepthToPose();
    refreshReferenceControls();
    updateComposition();
    if (isGrid()) renderGridTiles();
  }
  function refreshReferenceControls() {
    const depth = state.composition.referenceType === "depth";
    $("compose-reference-depth").checked = depth;
    $("compose-grid-use-depth").checked = depth;
    for (const id of ["compose-prompt-mode", "compose-grid-prompt-mode"]) {
      $(id).querySelector('[value="professional"]').disabled =
        !depth || id === "compose-grid-prompt-mode" && gridHasUnmatchedDepth();
      $(id).value = depth && !(id === "compose-grid-prompt-mode" &&
        gridHasUnmatchedDepth()) ? state.composition.promptMode : "normal";
    }
    $("compose-pose-label").textContent = t(depth ? "composeDepthFirst" : "composePose");
    $("compose-pose-empty").textContent = t(depth ? "composeDepthEmpty" : "composeEmptyPose");
    $("compose-choose-pose").textContent = t(depth ? "composeChooseDepth" : "choosePose");
    $("compose-random-pose").textContent = t(depth ? "composeRandomDepth" : "composeRandomPose");
    $("compose-upload-depth").hidden = !depth;
    const uploaded = depth && !!state.composition.depth?.uploadUrl;
    $("compose-match-depth").hidden = !uploaded || !state.composition.pose;
    $("compose-remove-depth").hidden = !uploaded;
    $("compose-download-depth").hidden = !depth || !selectedReference();
    $("compose-grid-heading").textContent = t(depth ? "composeGridDepthHeading" : "composeGridHeading");
    $("compose-grid-hint").textContent = t(depth ? "composeGridDepthHint" : "composeGridHint");
    $("compose-grid-prompt-help").textContent = t(!depth ? "composeGridPromptHelp" :
      state.composition.promptMode === "professional" ? "composeGridDepthPromptHelp" : "composeGridDepthVisualHelp");
    $("compose-random-title").textContent = t(depth ? "composeDepthRandomTitle" : "composeRandomTitle");
    $("compose-random-hint").textContent = t(depth ? "composeDepthRandomHint" : "composeRandomHint");
  }
  function matchDepthToPose() {
    const matched = depthForPose(state.composition.pose);
    if (!matched) return setComposeStatus("composeDepthNoMatch");
    setDepthFromCatalog(matched);
  }
  function removeDepth() {
    releaseUploadedDepth();
    state.composition.depth = depthForPose(state.composition.pose);
    updateComposition();
  }
  async function uploadDepth(file) {
    if (!file) return;
    if (file.type !== "image/png" || !validImageFile(file)) return setComposeStatus("composeInvalidDepth");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      releaseUploadedDepth();
      state.composition.depth = {id: file.name, uploadUrl: url, localFile: file};
      state.composition.referenceType = "depth";
      updateComposition();
    } catch (_) {
      URL.revokeObjectURL(url);
      setComposeStatus("composeInvalidDepth");
    }
  }
  async function downloadDepth() {
    const entry = state.composition.referenceType === "depth" ? selectedReference() : null;
    if (!entry) return;
    if (composition.needsFolder() && !entry.uploadUrl && !(await chooseLocalFolder())) return;
    try {
      const file = await composition.exportDepthOriginal(entry);
      const url = URL.createObjectURL(file);
      const anchor = element("a");
      anchor.download = String(entry.id).replace(/[^\w.-]/g, "_").replace(/\.png$/i, "") + "_depth.png";
      anchor.href = url;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setComposeStatus("composeSaved");
    } catch (_) {
      setComposeStatus("composeExportError");
    }
  }
  function compositionOptions() {
    if (isGrid()) return {
      mode: state.composition.mode,
      items: state.composition.gridItems.map((pair) => ({
        pose: gridPose(pair.pose, pair), outfit: gridOutfit(pair)
      })),
      person: state.composition.gridUsePerson ? state.composition.person : null,
      background: state.composition.gridBackground,
      labels: state.composition.gridLabels
    };
    return { ...state.composition, pose: selectedReference(), depth: null, mode: "reference" };
  }
  const activeEntries = () => isGrid()
    ? [...state.composition.gridItems.flatMap(pair => [gridPose(pair.pose, pair), gridOutfit(pair)]),
      ...(state.composition.gridUsePerson && state.composition.person ? [state.composition.person] : [])]
    : [selectedReference(), state.composition.second, state.composition.person].filter(Boolean);
  const hasCompleteSelection = () => isGrid()
    ? state.composition.gridItems.length === gridCount()
    : !!selectedReference() && !!state.composition.second;
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
        "composeInvalidUpload", "composeInvalidDepth"].includes(key));
  }
  function syncComposeFolderNotice() {
    $("compose-local-notice").hidden = location.protocol !== "file:" || !composition.needsFolder();
  }
  function updatePrompt() {
    const { second, person } = state.composition;
    const pose = selectedReference();
    if (!pose || !second) {
      $("compose-prompt-text").value = t("composePromptEmpty");
      return;
    }
    const base = person
      ? t("composePromptThree", pose.id, t("composePosLeft"), second.id,
        t("composePosMiddleHorizontal"), t("composePosRight"))
      : t("composePrompt", pose.id, t("composePosLeft"), second.id, t("composePosRight"));
    const depth = state.composition.referenceType === "depth";
    const extra = !depth ? "" : state.composition.promptMode === "professional"
      ? t("composeDepthProfessionalPrompt", pose.localFile ? pose.localFile.name : pose.id + ".png")
      : t("composeDepthVisualPrompt");
    $("compose-prompt-text").value = base + (extra ? "\n\n" + extra : "");
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
    const depthMode = state.composition.referenceType === "depth";
    const pairLines = gridItems.map((pair, index) => {
      const pose = gridPose(pair.pose, pair);
      const outfit = gridOutfit(pair);
      const matchingDepth = depthMode && !(pair.poseOverride && !pair.depthOverride);
      return t(matchingDepth ? "composeGridDepthPair" : "composeGridPromptPair", index + 1,
        Math.floor(index / columns) + 1, index % columns + 1,
        pose.id, pose.uploadUrl ? t("composeGridCustom") :
          label(pair.pose, "pose_name") || label(pair.pose, "category"),
        outfit.id, outfit.uploadUrl ? t("composeGridCustom") : label(outfit, "category"));
    });
    $("compose-grid-prompt-text").value = [
      t(depthMode && !gridHasUnmatchedDepth() ? "composeGridDepthIntro" :
        gridHasUnmatchedDepth() ? "composeGridMixedIntro" : "composeGridPromptIntro", count, columns), shared,
      ...(depthMode ? [t(state.composition.promptMode === "professional" && !gridHasUnmatchedDepth()
        ? "composeDepthProfessionalGridPrompt" : "composeDepthVisualGridPrompt")] : []), ...pairLines,
      t("composeGridPromptFinish")
    ].join("\n\n");
  }
  function setPromptMode(value) {
    state.composition.promptMode = value === "professional" &&
      state.composition.referenceType === "depth" &&
      !(isGrid() && gridHasUnmatchedDepth()) ? "professional" : "normal";
    refreshReferenceControls();
    updatePrompt();
    updateGridPrompt();
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
    refreshReferenceLocks();
    refreshReferenceControls();
    syncComposeFolderNotice();
    for (const [key, image] of [["pose", selectedReference()], ["costume", options.second]]) {
      const panel = $(key === "pose" ? "compose-pose-preview" : "compose-costume-preview");
      panel.querySelector("img")?.remove();
      $(key === "pose" ? "compose-pose-id" : "compose-costume-id").textContent = image?.id || "";
      $(key === "pose" ? "compose-pose-empty" : "compose-costume-empty").hidden = !!image;
      $(key === "pose" ? "compose-pose-meta" : "compose-costume-meta").textContent = !image ? "" :
        key === "pose" ? (image.uploadUrl ? t("composeDepthUploaded") :
          t("composePoseMeta", label(image, "category"), label(image, "angle"))) :
        (image.uploadUrl ? image.id : label(image, "category"));
      if (image) {
        const img = element("img");
        img.alt = image.id;
        img.src = composition.imageUrl(image.uploadUrl || image.thumbnail || image.preview || image.original);
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
      img.src = composition.imageUrl(options.person.uploadUrl || options.person.thumbnail || options.person.preview || options.person.original);
      personPreview.prepend(img);
    }
    updateGridPersonLabel();
    updateGridPrompt();
    const complete = !!selectedReference() && !!options.second;
    $("compose-open-preview").disabled = !complete;
    $("compose-download").disabled = !complete;
    $("compose-preview-download").disabled = !complete;
    $("compose-copy-prompt").disabled = !complete;
    $("compose-copy-image").disabled = !complete;
    $("compose-preview-copy").disabled = !complete;
    updatePrompt();
    cleanupReferenceUrls();
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
        : [selectedReference().id, state.composition.second.id]
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
  async function downloadGridPanels() {
    if (!isGrid() || !hasCompleteSelection()) return;
    if (composition.needsFolder() && !(await chooseLocalFolder())) return;
    const button = $("compose-grid-download-panels");
    const options = compositionOptions();
    const count = options.items.length;
    const professional = state.composition.promptMode === "professional" &&
      state.composition.referenceType === "depth" && !gridHasUnmatchedDepth();
    const prompt = $("compose-grid-prompt-text").value;
    button.disabled = true;
    try {
      const files = [];
      for (let index = 0; index < count; index++) {
        $("compose-grid-status").textContent = t("composeGridExportingPanel", index + 1, count);
        const {pose, outfit} = options.items[index];
        const prefix = String(index + 1).padStart(2, "0");
        const board = await composition.exportPNG({
          mode: "reference", pose, second: outfit, person: options.person,
          background: options.background, labels: options.labels
        });
        files.push({name: prefix + "_reference.png", blob: board});
        if (professional) {
          // Keep original PNG bytes, never clip or re-encode the Depth image.
          files.push({name: prefix + "_depth.png", blob: await composition.exportDepthOriginal(pose)});
        }
      }
      files.push({name: "prompt.txt", blob: new Blob([
        t(professional ? "composeGridZipProfessionalHelp" : "composeGridZipNormalHelp"),
        "\n\n", prompt
      ], {type: "text/plain;charset=utf-8"})});
      const archive = await window.ReferenceGridZIP.create(files);
      const href = URL.createObjectURL(archive);
      const link = element("a");
      link.href = href;
      link.download = `${count}grid_${professional ? "depth_control" : "references"}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30000);
      setComposeStatus("composeGridExportZipSaved");
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
      button.disabled = !isGrid() || !hasCompleteSelection();
    }
  }
  async function uploadSecondImage(file) {
    if (!file) return;
    if (referenceLocks.costume) return;
    if (!validImageFile(file)) {
      setComposeStatus("composeInvalidUpload"); return;
    }
    rememberReference();
    releaseUploadedImage();
    state.composition.second = { id: file.name, uploadUrl: URL.createObjectURL(file) };
    if (state.type === "compose") updateComposition();
    else openComposition();
  }
  async function uploadPersonImage(file, target = "reference") {
    if (!file) return;
    if (target === "reference" && referenceLocks.person) return;
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
      if (target === "reference") rememberReference();
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
    if (referenceLocks.person) return;
    rememberReference();
    releaseUploadedPerson();
    state.composition.person = null;
    state.composition.gridUsePerson = false;
    updateComposition();
  }
  function setPersonFromCatalog(item, target = "reference") {
    if (target === "reference" && referenceLocks.person) return;
    if (target === "reference") rememberReference();
    releaseUploadedPerson();
    state.composition.person = item;
    state.composition.gridUsePerson = target === "grid";
    updateComposition();
  }
  function randomizeGridPerson() {
    const previousPerson = state.composition.person;
    if (!drawRandomPerson()) {
      setGridStatus("composeNoPortraits");
      return;
    }
    rememberGrid(previousPerson);
    state.composition.gridUsePerson = true;
    updateComposition(["person"]);
  }
  function bind() {
    $("compose-reference-undo").onclick = undoReference;
    for (const role of ["pose","costume","person"])
      $("compose-lock-" + role).onclick = () => toggleReferenceLock(role);
    $("compose-upload-pose").onclick = () => $("compose-pose-input").click();
    $("compose-pose-input").onchange = async event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || referenceLocks.pose || !validImageFile(file)) return;
      const url = URL.createObjectURL(file);
      try {
        const image = new Image(); image.src = url; await image.decode();
        rememberReference();
        referenceUrls.add(url);
        referencePoseOverride = {id:file.name, uploadUrl:url, localFile:file};
        state.composition.referenceType = "pose";
        state.composition.promptMode = "normal";
        updateComposition(["pose"]);
      } catch (_) { URL.revokeObjectURL(url); setComposeStatus("composeInvalidUpload"); }
    };
    $("compose-grid-undo").onclick = undoGrid;
    $("compose-grid-image-input").onchange = (event) => {
      const target = gridUploadTarget;
      gridUploadTarget = null;
      const file = event.target.files?.[0];
      event.target.value = "";
      void uploadGridImage(file, target);
    };
    $("compose-grid-dialog-search").oninput = () => {
      gridPickerLimit = 48;
      if (gridPicker) renderGridPicker();
    };
    $("compose-grid-dialog-more").onclick = () => {
      gridPickerLimit += 48;
      renderGridPicker();
    };
    $("compose-grid-dialog-close").onclick = closeGridPicker;
    $("compose-grid-dialog").onclick = (event) => {
      if (event.target === $("compose-grid-dialog")) closeGridPicker();
    };
    $("compose-grid-single-close").onclick = closeGridSingle;
    $("compose-grid-single-dialog").onclick = (event) => {
      if (event.target === $("compose-grid-single-dialog")) closeGridSingle();
    };
    $("compose-grid-single-copy-prompt").onclick = async () => {
      try {
        await navigator.clipboard.writeText($("compose-grid-single-prompt").value);
        $("compose-grid-single-status").textContent = t("composeCopiedPrompt");
      } catch (_) {
        $("compose-grid-single-prompt").select();
        $("compose-grid-single-status").textContent = t("composeCopyError");
      }
    };
    $("compose-grid-single-download").onclick = () => void downloadGridSingle();
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!$("compose-grid-dialog").hidden) closeGridPicker();
      if (!$("compose-grid-single-dialog").hidden) closeGridSingle();
    });
    for (const id of ["compose-prompt-mode", "compose-grid-prompt-mode"]) {
      $(id).onchange = (event) => setPromptMode(event.target.value);
    }
    $("compose-reference-depth").onchange = (event) =>
      setReferenceType(event.target.checked ? "depth" : "pose");
    $("compose-grid-use-depth").onchange = (event) =>
      setReferenceType(event.target.checked ? "depth" : "pose");
    $("compose-match-depth").onclick = matchDepthToPose;
    $("compose-remove-depth").onclick = removeDepth;
    $("compose-download-depth").onclick = downloadDepth;
    $("compose-upload-depth").onclick = () => $("compose-depth-input").click();
    $("compose-depth-input").onchange = (event) => {
      void uploadDepth(event.target.files[0]);
      event.target.value = "";
    };
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
    $("compose-grid-download-panels").onclick = downloadGridPanels;
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
    $("compose-choose-pose").onclick = () =>
      state.composition.referenceType === "depth" ? chooseDepth() : choosePose();
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
    rememberReference, isReferenceLocked: role => referenceLocks[role],
    clearReferencePoseOverride: () => { referencePoseOverride = null; },
    setDepthFromCatalog, syncDepthToPose, setReferenceType,
    setPersonFromCatalog,
    uploadPersonImage, removePersonImage };
};
