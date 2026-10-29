"use strict";
// Interface strings and catalog labels. Original Japanese identifiers are preserved.
window.ReferenceGalleryI18n = (() => {
  const texts = {
    "zh-CN": {
      eyebrow: "AI 创作参考图库", tagline: "灵感，从这里开始。",
      collectionPose: "探索姿势素材", collectionCostume: "探索服装素材",
      collectionCompose: "组合工作台", typeCompose: "组合制作",
      composeDescription: "选择姿势与服装，还可添加人物照片，制作双图或三图参考板。",
      addPose: "使用这张姿势", addCostume: "加入组合",
      composePose: "01 · 姿势", composeSecond: "02 · 服装或图片",
      composePerson: "03 · 人物参考（可选）", composePersonEmpty: "可选人物照",
      composePersonHelp: "上传人物照片作为面部和人物特征参考；仅在本地处理。",
      composeUploadPerson: "上传人物照片", composeRemovePerson: "移除",
      composeRandomTitle: "试试随机搭配", composeRandomHint: "从全部姿势和服装素材中随机抽取，立即生成新组合。",
      composeRandomPair: "一键随机组合", composeRandomPose: "随机姿势", composeRandomCostume: "随机服装",
      composeModeLabel: "制作模式", composeModeReference: "参考图组合",
      composeModeFour: "四宫格", composeModeNine: "九宫格",
      composeGridHeading: "随机姿势 × 服饰搭配",
      composeGridHint: "每格左侧姿势、右侧服饰；点击任意格，同时更换这一组搭配。",
      composeGridShuffle: "重新随机全部搭配", composeGridReroll: "重新抽取这组姿势和服饰",
      composeGridTileLabel: (n, poseId, outfitId) => `第 ${n} 格：姿势 ${poseId}，服饰 ${outfitId}，点击同时重抽`,
      composeGridSettings: (n) => `${n} 宫格设置`, composeGridCopy: "复制宫格",
      composeGridExportHint: "仅预览时生成完整宫格，支持高清方形 PNG 导出。",
      composeGridInsufficient: (poses, outfits, needed) => `当前有 ${poses} 组姿势、${outfits} 套服饰，需要各至少 ${needed} 个不同素材，请放宽筛选。`,
      composeGridGenerated: (n) => `已生成 ${n} 组姿势 + 服饰的不重复搭配。`,
      composeGridTileUpdated: (n) => `已同时重抽第 ${n} 格的姿势和服饰。`,
      composeGridNoAlternative: "当前筛选下无法同时换成不同的姿势和服饰，请放宽筛选。",
      composeOutfitFilter: "服装分类", composePoseFilter: "姿势分类",
      composeAdaptiveSize: "自适应高清 PNG",
      composeAllOutfits: "全部服装", composeAllPoses: "全部姿势",
      composeSoloPoses: "全部单人姿势", composeIncludeDuo: "包含双人姿势",
      composeRandomRange: (poses, outfits) => `可抽取 ${poses} 组姿势 · ${outfits} 套服装`,
      composePromptTitle: "AI 创作提示词", composePromptHelp: "复制组合图和提示词，交给支持参考图片的 AI 工具使用。",
      composePromptEmpty: "请先选择姿势和服装，再生成创作提示词。",
      composeCopyPrompt: "复制提示词", composeCopyImage: "复制合并图片",
      composeCopiedPrompt: "提示词已复制", composeCopiedImage: "组合图片已复制",
      composeCopyError: "复制失败，请手动选择并复制提示词。",
      composeCopyImageError: "当前浏览器无法复制图片，请使用“下载 PNG”。图片复制需要 HTTPS 或受支持的本地环境。",
      composePosLeft: "左侧", composePosRight: "右侧", composePosMiddleHorizontal: "中间",
      composePoseMeta: (category, angle) => `${category} · ${angle}`,
      composePrompt: (poseId, posePos, outfitId, outfitPos) =>
        `请根据我提供的组合参考图创作一幅完整、自然的人物画面。\n\n` +
        `1. 姿势参考：画面${posePos}（${poseId}）。遵循人物的姿态、动作方向、手脚位置及互动关系。\n` +
        `2. 服装参考：画面${outfitPos}（${outfitId}）。保留衣服的廓形、配色、材质与重要配饰。\n` +
        `3. 如另外提供了主角脸部参考图，请以该图片为准保持面部特征一致。\n` +
        `4. 将服装与动作自然结合，画面比例协调、细节清晰，不要把两张参考图简单拼接作为成品。`,
      composePromptThree: (poseId, posePos, outfitId, outfitPos, personPos) =>
        `请根据这张三图参考板生成一张完整的人物作品，每张图片的用途不同：\n\n` +
        `1. 姿势参考：画面${posePos}（${poseId}），参考身体姿态、动作和四肢位置。\n` +
        `2. 服装参考：画面${outfitPos}（${outfitId}），参考款式、配色、材质和配饰。\n` +
        `3. 人物参考：画面${personPos}，尽量保持照片中人物可辨认的面部特征与发型，不照搬原照片的服装和姿势。\n` +
        `4. 将三项参考自然融合为一张新作品，人物比例协调、细节清晰，不要输出参考板拼贴。`,
      composeEmptyPose: "尚未选择姿势", composeEmptySecond: "尚未选择图片",
      choosePose: "选择姿势", chooseCostume: "选择服装", uploadImage: "上传图片",
      composeEditorEyebrow: "COMPOSITION", composeEditorTitle: "组合设置",
      composeOpenPreview: "大图预览", composePreviewDialogTitle: "组合大图预览",
      composePreviewCopy: "复制图片",
      composePreviewLoading: "正在生成预览…",
      composePreviewHint: "完整显示两张图片，不裁切。按 Esc 关闭预览。",
      composePreviewHintThree: "完整显示三张参考图，不裁切。按 Esc 关闭预览。",
      composeBg: "画布背景", composeWhite: "白色", composeSoft: "浅灰",
      composeLabels: "显示图片编号",
      composeHelp: "保留原图比例，不裁切。图片仅在你的浏览器中处理。",
      composeDownload: "下载 PNG", composeFolder: "选择本项目的 img 文件夹",
      composeSelectFolder: "请在弹出的窗口选择项目的 img 文件夹；授权一次即可导出。",
      composeFolderReady: "本地文件夹已授权，可以再次点击下载。",
      composeExporting: "正在生成高清 PNG…", composeSaved: "PNG 已生成并开始下载。",
      composeMissingFile: "找不到原图，请重新选择正确的 img 文件夹。",
      composeExportError: "导出失败，请检查图片文件或重新授权文件夹。",
      composePreviewError: "预览失败，请检查所选图片。",
      composeInvalidUpload: "请选择不超过 50MB 的 PNG、JPG 或 WebP 图片。",
      collectionEyebrow: "精选素材库", typeNav: "素材类型", filterNav: "素材筛选",
      socialNav: "项目与社交账号",
      galleryNav: "素材列表", pageTitle: "Reference Gallery — AI 创作参考素材库",
      composeOnlineImageError: "线上原图读取失败。请检查图片是否已部署，以及图片服务器的跨域设置。",
      composeLocalTitle: "本地下载或复制组合图片均需授权",
      composeLocalStep: "选择项目的 img 文件夹（包含 pose / costume）。仅本地打开时需要，线上无需授权。",
      description: "一站式浏览姿势与服装参考素材，按类别快速查找。",
      typePose: "姿势素材", typeCostume: "服装素材",
      costumeDescription: "按季节、风格和服装关键词浏览穿搭参考。",
      costumeSearchLabel: "搜索服装编号、季节或关键词", costumeSearchPlaceholder: "如 SPR-0001、春季、denim",
      costumeName: (category, id) => `${category}穿搭 · ${id}`,
      costumeResults: (total, showing) => `找到 ${total} 套服装，已展示 ${showing} 套`,
      costumeEmpty: "没有符合条件的服装，尝试其他关键词。",
      costumeHint: "← → / ↑ ↓ 切换服装，Esc 关闭",
      loadMore: "加载更多",
      searchLabel: "搜索编号、姿势名、分类", searchPlaceholder: "如 P001、站姿、侧卧",
      categoryLabel: "分类", angleLabel: "角度", viewLabel: "展示",
      viewPose: "按姿势组", viewImage: "逐张图片", allCategories: "全部分类",
      allAngles: "全部角度", allSeries: "全部系列", reset: "重置筛选",
      loadingCounts: "加载中…",
      counts: (poses, costumes) => `${poses} 张姿势图 · ${costumes} 套服装 · 共 ${poses + costumes} 项素材`,
      results: (images, poses, cards) => `${images} 张图 / ${poses} 组姿势，当前展示 ${cards} 项`,
      angles: (n) => `${n} 个视角`, empty: "没有符合条件的姿势，尝试调整筛选条件。",
      loadError: (msg) => `图库加载失败：${msg}。请检查图库索引文件。`,
      footer: "ai-reference-gallery · 图片与原始数据版权归原作者ギア所有 · 该版本由 vculjp 整理维护",
      download: "下载图片",
      hint: "← → 切换角度，↑ ↓ 切换姿势，Esc 关闭",
      close: "关闭", previous: "上一组", next: "下一组", dialog: "姿势图片预览",
      costumeDialog: "服装图片预览"
    },
    en: {
      eyebrow: "AI REFERENCE LIBRARY", tagline: "Inspiration starts here.",
      collectionPose: "Explore poses", collectionCostume: "Explore outfits",
      collectionCompose: "Composition studio", typeCompose: "Compose",
      composeDescription: "Combine a pose, an outfit and an optional person photo into one reference sheet.",
      addPose: "Use this pose", addCostume: "Add to composition",
      composePose: "01 · Pose", composeSecond: "02 · Outfit or image",
      composePerson: "03 · Person reference (optional)", composePersonEmpty: "Optional photo",
      composePersonHelp: "Upload a person photo as a face and character reference. Processed locally only.",
      composeUploadPerson: "Upload person", composeRemovePerson: "Remove",
      composeRandomTitle: "Try a random pairing", composeRandomHint: "Pick from the full pose and outfit collections to discover a new pairing.",
      composeRandomPair: "Shuffle both", composeRandomPose: "Random pose", composeRandomCostume: "Random outfit",
      composeModeLabel: "Creation mode", composeModeReference: "Reference board",
      composeModeFour: "4-grid", composeModeNine: "9-grid",
      composeGridHeading: "Random pose + outfit pairings",
      composeGridHint: "Each cell shows a pose on the left and an outfit on the right. Click to reroll the whole pair.",
      composeGridShuffle: "Shuffle all pairings", composeGridReroll: "Reroll pose and outfit",
      composeGridTileLabel: (n, poseId, outfitId) => `Cell ${n}: pose ${poseId}, outfit ${outfitId}; click to reroll both`,
      composeGridSettings: (n) => `${n}-grid settings`, composeGridCopy: "Copy grid",
      composeGridExportHint: "The full grid renders on preview. Export as a high-resolution square PNG.",
      composeGridInsufficient: (poses, outfits, needed) => `Only ${poses} poses and ${outfits} outfits match; at least ${needed} unique items of each are needed.`,
      composeGridGenerated: (n) => `Generated ${n} unique pose + outfit pairings.`,
      composeGridTileUpdated: (n) => `Rerolled both references in cell ${n}.`,
      composeGridNoAlternative: "Cannot replace both references uniquely; broaden the filters.",
      composeOutfitFilter: "Outfit category", composePoseFilter: "Pose category",
      composeAdaptiveSize: "Adaptive HD PNG",
      composeAllOutfits: "All outfits", composeAllPoses: "All poses",
      composeSoloPoses: "All solo poses", composeIncludeDuo: "Include duo poses",
      composeRandomRange: (poses, outfits) => `${poses} pose groups · ${outfits} outfits available`,
      composePromptTitle: "AI creation prompt", composePromptHelp: "Copy the reference sheet and prompt into an AI tool that supports image references.",
      composePromptEmpty: "Select a pose and outfit to generate a prompt.",
      composeCopyPrompt: "Copy prompt", composeCopyImage: "Copy merged image",
      composeCopiedPrompt: "Prompt copied", composeCopiedImage: "Merged image copied",
      composeCopyError: "Copy failed. Select the prompt text to copy it manually.",
      composeCopyImageError: "Image clipboard access is unavailable. Download the PNG instead. Copying requires HTTPS or a supported local context.",
      composePosLeft: "left", composePosRight: "right", composePosMiddleHorizontal: "center",
      composePoseMeta: (category, angle) => `${category} · ${angle}`,
      composePrompt: (poseId, posePos, outfitId, outfitPos) =>
        `Create a finished character image using the merged reference.\n\n` +
        `1. Pose: use the ${posePos} reference (${poseId}) for body posture, movement, limb placement and interaction.\n` +
        `2. Outfit: use the ${outfitPos} reference (${outfitId}) for clothing design, colors, materials and accessories.\n` +
        `3. If a separate character face reference is supplied, preserve that character's facial identity.\n` +
        `4. Integrate the outfit naturally with the pose, keep anatomy and details clear, and create a finished scene rather than a collage.`,
      composePromptThree: (poseId, posePos, outfitId, outfitPos, personPos) =>
        `Create one finished character image using this three-part reference sheet. Each reference has a distinct purpose:\n\n` +
        `1. Pose: use the ${posePos} reference (${poseId}) for body posture, movement and limb placement.\n` +
        `2. Outfit: use the ${outfitPos} reference (${outfitId}) for clothing design, colors, materials and accessories.\n` +
        `3. Person: use the ${personPos} reference for recognizable facial features and hairstyle, without copying its pose or clothing.\n` +
        `4. Merge all three references naturally into a coherent final image with clear details. Do not output a reference collage.`,
      composeEmptyPose: "No pose selected", composeEmptySecond: "No image selected",
      choosePose: "Choose pose", chooseCostume: "Choose outfit", uploadImage: "Upload image",
      composeEditorEyebrow: "COMPOSITION", composeEditorTitle: "Composition settings",
      composeOpenPreview: "Large preview", composePreviewDialogTitle: "Full-size composition preview",
      composePreviewCopy: "Copy image",
      composePreviewLoading: "Rendering preview…",
      composePreviewHint: "Both images are shown in full without cropping. Press Esc to close.",
      composePreviewHintThree: "All three images are shown in full without cropping. Press Esc to close.",
      composeBg: "Background", composeWhite: "White", composeSoft: "Light gray",
      composeLabels: "Show image IDs",
      composeHelp: "Original proportions, no cropping. Images stay in your browser.",
      composeDownload: "Download PNG", composeFolder: "Choose this project's img folder",
      composeSelectFolder: "Select this project's img folder in the dialog to enable offline export.",
      composeFolderReady: "Local folder granted. You can download the PNG.",
      composeExporting: "Rendering high-resolution PNG…", composeSaved: "PNG created. Download started.",
      composeMissingFile: "Original not found. Select the correct img folder again.",
      composeExportError: "Export failed. Check the files or grant folder access again.",
      composePreviewError: "Could not preview the selected images.",
      composeInvalidUpload: "Upload a PNG, JPG or WebP image smaller than 50 MB.",
      collectionEyebrow: "CURATED LIBRARY", typeNav: "Reference type", filterNav: "Filter references",
      socialNav: "Project and social profiles",
      galleryNav: "Reference results", pageTitle: "Reference Gallery — Creative references",
      composeOnlineImageError: "Could not load the original online image. Verify deployed assets and image CORS settings.",
      composeLocalTitle: "Local download and image copy require folder access",
      composeLocalStep: "Select the project's img folder (containing pose / costume). Not required on the published site.",
      description: "Browse pose and costume references in one searchable collection.",
      typePose: "Poses", typeCostume: "Costumes",
      costumeDescription: "Browse outfits by season, style, and clothing keywords.",
      costumeSearchLabel: "Search outfit ID, season or keywords", costumeSearchPlaceholder: "e.g. SPR-0001, spring, denim",
      costumeName: (category, id) => `${category} outfit · ${id}`,
      costumeResults: (total, showing) => `${total} outfits found · ${showing} displayed`,
      costumeEmpty: "No matching outfits. Try another search.",
      costumeHint: "← → / ↑ ↓ change outfit · Esc close",
      loadMore: "Load more",
      searchLabel: "Search ID, pose, or category", searchPlaceholder: "e.g. P001, standing, side",
      categoryLabel: "Category", angleLabel: "Angle", viewLabel: "View",
      viewPose: "Pose groups", viewImage: "Individual images", allCategories: "All categories",
      allAngles: "All angles", allSeries: "All series", reset: "Reset filters",
      loadingCounts: "Loading…",
      counts: (poses, costumes) => `${poses} pose images · ${costumes} outfits · ${poses + costumes} total`,
      results: (images, poses, cards) => `${images} images / ${poses} poses · Showing ${cards} items`,
      angles: (n) => `${n} angles`, empty: "No matching poses. Try adjusting the filters.",
      loadError: (msg) => `Could not load gallery: ${msg}. Check the catalog scripts.`,
      footer: "ai-reference-gallery · Images and original data © original creator ギア · This edition is maintained by vculjp",
      download: "Download image",
      hint: "← → change angle · ↑ ↓ change pose · Esc close",
      close: "Close", previous: "Previous group", next: "Next group", dialog: "Pose image preview",
      costumeDialog: "Costume image preview"
    },
    ja: {
      eyebrow: "AI 参考ギャラリー", tagline: "創作のひらめきを、ここから。",
      collectionPose: "ポーズを探す", collectionCostume: "衣装を探す",
      collectionCompose: "画像組み合わせ", typeCompose: "組み合わせ",
      composeDescription: "ポーズと衣装に人物写真も追加して、2枚または3枚の参考画像を作れます。",
      addPose: "このポーズを使う", addCostume: "組み合わせに追加",
      composePose: "01 · ポーズ", composeSecond: "02 · 衣装または画像",
      composePerson: "03 · 人物参考（任意）", composePersonEmpty: "人物写真（任意）",
      composePersonHelp: "顔立ちや人物の特徴を参照する写真です。画像はブラウザー内で処理されます。",
      composeUploadPerson: "人物写真を追加", composeRemovePerson: "削除",
      composeRandomTitle: "ランダムな組み合わせ", composeRandomHint: "すべてのポーズと衣装からランダムに選び、新しい組み合わせを作成します。",
      composeRandomPair: "両方ランダム", composeRandomPose: "ポーズを抽選", composeRandomCostume: "衣装を抽選",
      composeModeLabel: "制作モード", composeModeReference: "参考画像を組み合わせる",
      composeModeFour: "4分割", composeModeNine: "9分割",
      composeGridHeading: "ランダムなポーズ × 衣装の組み合わせ",
      composeGridHint: "各マスの左側にポーズ、右側に衣装を表示。クリックすると両方を再抽選します。",
      composeGridShuffle: "全組み合わせを再抽選", composeGridReroll: "ポーズと衣装を再抽選",
      composeGridTileLabel: (n, poseId, outfitId) => `${n}番：ポーズ ${poseId}、衣装 ${outfitId}（両方再抽選）`,
      composeGridSettings: (n) => `${n}分割の設定`, composeGridCopy: "グリッドをコピー",
      composeGridExportHint: "大きな画像はプレビュー時に生成。高解像度の正方形PNGで保存できます。",
      composeGridInsufficient: (poses, outfits, needed) => `ポーズ${poses}件・衣装${outfits}件。${needed}件ずつ必要です。絞り込みを緩めてください。`,
      composeGridGenerated: (n) => `${n}組の重複しないポーズと衣装の組み合わせを生成しました。`,
      composeGridTileUpdated: (n) => `${n}番のポーズと衣装を両方再抽選しました。`,
      composeGridNoAlternative: "ポーズと衣装を両方変更できません。絞り込みを緩めてください。",
      composeOutfitFilter: "衣装カテゴリー", composePoseFilter: "ポーズカテゴリー",
      composeAdaptiveSize: "自動サイズ調整 HD PNG",
      composeAllOutfits: "すべての衣装", composeAllPoses: "すべてのポーズ",
      composeSoloPoses: "1人のポーズのみ", composeIncludeDuo: "2人のポーズも含める",
      composeRandomRange: (poses, outfits) => `対象：${poses} ポーズ・${outfits} 衣装`,
      composePromptTitle: "AI制作プロンプト", composePromptHelp: "参考画像とプロンプトをコピーして、画像参照対応のAIツールで利用できます。",
      composePromptEmpty: "ポーズと衣装を選ぶとプロンプトが生成されます。",
      composeCopyPrompt: "プロンプトをコピー", composeCopyImage: "合成画像をコピー",
      composeCopiedPrompt: "プロンプトをコピーしました", composeCopiedImage: "合成画像をコピーしました",
      composeCopyError: "コピーできませんでした。テキストを選択してコピーしてください。",
      composeCopyImageError: "画像をクリップボードにコピーできません。PNGを保存してください。HTTPSか対応するローカル環境が必要です。",
      composePosLeft: "左側", composePosRight: "右側", composePosMiddleHorizontal: "中央",
      composePoseMeta: (category, angle) => `${category} · ${angle}`,
      composePrompt: (poseId, posePos, outfitId, outfitPos) =>
        `参考画像をもとに、自然な人物の完成画像を制作してください。\n\n` +
        `1. ポーズ：画像の${posePos}（${poseId}）を参考に、姿勢・動き・手足の位置・人物間の関係を保ってください。\n` +
        `2. 衣装：画像の${outfitPos}（${outfitId}）を参考に、服の形・色・素材・装飾を再現してください。\n` +
        `3. 顔の参考画像を別途提供した場合は、その人物の顔立ちを維持してください。\n` +
        `4. 衣装とポーズを自然に組み合わせ、人体の比率や細部を整え、単なるコラージュではなく完成作品にしてください。`,
      composePromptThree: (poseId, posePos, outfitId, outfitPos, personPos) =>
        `この3枚の参考画像をそれぞれ異なる目的で使用し、1枚の人物作品を生成してください。\n\n` +
        `1. ポーズ：${posePos}（${poseId}）の姿勢・動き・手足の位置を参考にしてください。\n` +
        `2. 衣装：${outfitPos}（${outfitId}）の服の形・色・素材・装飾を参考にしてください。\n` +
        `3. 人物：${personPos}の写真から顔立ちや髪型を参照し、元の服装やポーズはコピーしないでください。\n` +
        `4. 3つの要素を自然に組み合わせ、コラージュではなく完成画像にしてください。`,
      composeEmptyPose: "ポーズ未選択", composeEmptySecond: "画像未選択",
      choosePose: "ポーズを選ぶ", chooseCostume: "衣装を選ぶ", uploadImage: "画像をアップロード",
      composeEditorEyebrow: "COMPOSITION", composeEditorTitle: "組み合わせ設定",
      composeOpenPreview: "大きくプレビュー", composePreviewDialogTitle: "大きな合成プレビュー",
      composePreviewCopy: "画像をコピー",
      composePreviewLoading: "プレビューを生成しています…",
      composePreviewHint: "画像を切り抜かずに表示します。Escキーで閉じます。",
      composePreviewHintThree: "3枚の画像を切り抜かずに表示します。Escキーで閉じます。",
      composeBg: "背景", composeWhite: "白", composeSoft: "薄いグレー",
      composeLabels: "画像IDを表示",
      composeHelp: "元画像の比率を保持し、トリミングしません。処理はブラウザー内で行います。",
      composeDownload: "PNGをダウンロード", composeFolder: "このプロジェクトの img を選択",
      composeSelectFolder: "オフライン書き出しのため、プロジェクトのimgフォルダーを選択してください。",
      composeFolderReady: "フォルダーへのアクセスを許可しました。ダウンロードできます。",
      composeExporting: "高解像度PNGを生成中…", composeSaved: "PNGを生成し、ダウンロードを開始しました。",
      composeMissingFile: "元画像が見つかりません。正しいimgフォルダーを選び直してください。",
      composeExportError: "書き出しに失敗しました。画像またはフォルダー権限を確認してください。",
      composePreviewError: "選択した画像をプレビューできません。",
      composeInvalidUpload: "50MB以下のPNG・JPG・WebP画像を選んでください。",
      collectionEyebrow: "参考資料ライブラリー", typeNav: "素材の種類", filterNav: "素材を絞り込む",
      socialNav: "プロジェクトとSNS",
      galleryNav: "素材一覧", pageTitle: "Reference Gallery — 創作資料",
      composeOnlineImageError: "公開サイトの元画像を読み込めません。画像の配置とCORS設定を確認してください。",
      composeLocalTitle: "ローカルでの保存・画像コピーには許可が必要です",
      composeLocalStep: "プロジェクト内の img フォルダー（pose / costume を含む）を選択してください。公開サイトでは不要です。",
      description: "ポーズと衣装の参考素材をまとめて探せます。",
      typePose: "ポーズ素材", typeCostume: "衣装素材",
      costumeDescription: "季節、スタイル、キーワードから衣装を探せます。",
      costumeSearchLabel: "衣装ID・季節・キーワードを検索", costumeSearchPlaceholder: "例：SPR-0001、春、denim",
      costumeName: (category, id) => `${category}コーデ · ${id}`,
      costumeResults: (total, showing) => `${total} 着の衣装 · ${showing} 件を表示`,
      costumeEmpty: "該当する衣装がありません。検索条件を変更してください。",
      costumeHint: "← → / ↑ ↓ 衣装切替 · Esc で閉じる",
      loadMore: "もっと見る",
      searchLabel: "ID・ポーズ名・カテゴリーを検索", searchPlaceholder: "例：P001、立ち、横",
      categoryLabel: "カテゴリー", angleLabel: "アングル", viewLabel: "表示方法",
      viewPose: "ポーズ別", viewImage: "画像別", allCategories: "すべてのカテゴリー",
      allAngles: "すべてのアングル", allSeries: "すべてのシリーズ", reset: "絞り込みをリセット",
      loadingCounts: "読み込み中…",
      counts: (poses, costumes) => `ポーズ ${poses} 枚 · 衣装 ${costumes} 着 · 合計 ${poses + costumes} 件`,
      results: (images, poses, cards) => `${images} 枚 / ${poses} ポーズ · ${cards} 件を表示`,
      angles: (n) => `${n} アングル`, empty: "該当するポーズがありません。絞り込み条件を変更してください。",
      loadError: (msg) => `ギャラリーを読み込めませんでした：${msg}。カタログを確認してください。`,
      footer: "ai-reference-gallery · 画像と元データの著作権は原作者ギアに帰属します · この版は vculjp が整理・管理しています",
      download: "画像をダウンロード",
      hint: "← → アングル切替 · ↑ ↓ ポーズ切替 · Esc で閉じる",
      close: "閉じる", previous: "前のポーズ", next: "次のポーズ", dialog: "ポーズ画像プレビュー",
      costumeDialog: "衣装画像プレビュー"
    }
  };
  let locale = "zh-CN";
  const storageKey = "ai-reference-gallery-language";
  try {
    const stored = localStorage.getItem(storageKey) || localStorage.getItem("ai-pose-gallery-language") || localStorage.getItem("pose-gallery-language");
    if (Object.hasOwn(texts, stored)) locale = stored;
  } catch (_) { /* Storage can be disabled. */ }
  function setLocale(next) {
    if (!(next in texts)) return;
    locale = next;
    try { localStorage.setItem(storageKey, next); } catch (_) { /* Private mode. */ }
  }
  function t(key, ...args) {
    const value = texts[locale][key];
    return typeof value === "function" ? value(...args) : value;
  }
  function englishLabel(item, field) {
    // Never pass off untranslated names as English translations.
    if (field === "pose_name") return item.pose_name_en || `${englishLabel(item, "category")} · ${item.pose_number}`;
    return item[`${field}_en`] || item[field] || "";
  }
  function label(item, field) {
    if (locale === "zh-CN") return item[`${field}_zh`] || item[field] || "";
    // Use explicit translations, otherwise preserve the original catalog value.
    if (locale === "ja") return item[`${field}_ja`] || item[field] || "";
    return englishLabel(item, field);
  }
  function searchable(item) {
    return ["series", "category", "angle", "pose_name", "keywords"].flatMap((field) => [
      item[field], item[`${field}_zh`], item[`${field}_en`], item[`${field}_ja`], englishLabel(item, field)
    ]).filter(Boolean);
  }
  return { t, label, searchable, setLocale, get locale() { return locale; } };
})();
