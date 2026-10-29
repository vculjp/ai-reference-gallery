"use strict";

// Deterministic, explainable language-to-catalog matching. No external model,
// no imagined metadata or guessed pose/outfit IDs.
const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase();

const poseRules = [
  { pattern: /站(立|姿|着|著)?|standing|street.?pose/i, category: "站姿" },
  { pattern: /坐(着|姿|下)?|sitting|seated/i, category: "坐姿" },
  { pattern: /蹲|squat/i, category: "蹲姿" },
  { pattern: /跪|kneel/i, category: "跪姿" },
  { pattern: /躺|卧|lying|reclining/i, category: "躺卧" }
];
const outfitRules = [
  { pattern: /春(天|季|装|日)?|spring/i, category: "spring" },
  { pattern: /夏(天|季|装|日)?|summer/i, category: "summer" },
  { pattern: /秋(天|季|装|日)?|autumn|fall fashion/i, category: "autumn" },
  { pattern: /冬(天|季|装|日)?|winter/i, category: "winter" },
  { pattern: /泳装|泳衣|swimsuit|swimwear/i, category: "swimwear" },
  { pattern: /内衣|lingerie/i, category: "lingerie" },
  { pattern: /派对|party/i, category: "party" }
];
const exclusions = [
  { pattern: /(?:不要|避免|排除|不想要|不要太|without|no|avoid)[^，。,.]{0,8}(?:性感|暴露|sexy|erotic)/i,
    pose: /性感|胸部|sexy|upper80/i, outfit: /性感|内衣|泳装|sexy|lingerie|swimwear|^sxy|^lng|^swm/i,
    label: "避免性感风格" },
  { pattern: /(?:不要|避免|排除|without|no|avoid)[^，。,.]{0,8}(?:双人|情侣|couple|duo)/i,
    pose: /双人|2人/, label: "避免双人姿势" }
];

function interpret(description) {
  const text = normalize(description);
  if (!text.trim()) return null;
  const rules = (items) => items.filter((rule) => rule.pattern.test(text));
  const selectedPose = rules(poseRules);
  const selectedOutfit = rules(outfitRules);
  const exclusionsFound = rules(exclusions);
  const unique = (list) => [...new Set(list)];
  const poseCategories = unique(selectedPose.map((rule) => rule.category));
  const outfitCategories = unique(selectedOutfit.map((rule) => rule.category));
  const duos = /双人|情侣|两个人|couple|duo/i.test(text) &&
    !exclusionsFound.some((rule) => rule.label === "避免双人姿势");
  const natural = /自然|日常|随意|不夸张|自然站|通勤|casual|relaxed|everyday/i.test(text);
  const modifiers = [
    { pattern: /正面|正视|front/i, name: "正面", en: "front" },
    { pattern: /侧面|侧身|侧拍|side/i, name: "侧面", en: "side" },
    { pattern: /背影|背对|back view/i, name: "背面", en: "back" },
    { pattern: /回头|回眸|looking back/i, name: "回头", en: "look back" },
    { pattern: /白色|white/i, name: "白色", en: "white" },
    { pattern: /黑色|black/i, name: "黑色", en: "black" },
    { pattern: /牛仔|denim/i, name: "牛仔", en: "denim" },
    { pattern: /裙|skirt|dress/i, name: "裙装", en: "skirt" }
  ].filter((rule) => rule.pattern.test(text));
  const unsupported = [
    { pattern: /日系|日式|japanese style/i, label: "日系" },
    { pattern: /韩系|韩风|korean style/i, label: "韩系" },
    { pattern: /高级感|high fashion/i, label: "高级感" }
  ].filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
  return { input: description, poseCategories, outfitCategories, modifiers,
    exclude: exclusionsFound, includeDuo: duos, natural, unsupported,
    understood: [...poseCategories, ...outfitCategories, ...modifiers.map((m) => m.name),
      ...exclusionsFound.map((m) => m.label), ...(natural ? ["自然日常"] : []),
      ...(duos ? ["双人"] : [])] };
}

function relevantText(item, type) {
  const fields = type === "pose" ?
    [item.id, item.pose_name, item.pose_name_zh, item.pose_name_en, item.angle,
      item.angle_zh, item.category_zh, item.series_zh] :
    [item.id, item.keywords, item.category, item.category_zh, item.category_en];
  return normalize(fields.filter(Boolean).join(" "));
}

function score(item, type, intent) {
  const value = relevantText(item, type);
  for (const exclusion of intent.exclude) {
    const pattern = exclusion[type];
    if (pattern && pattern.test(value)) return -Infinity;
  }
  if (type === "pose" && intent.natural && /full_sexy|upper80|性感|胸部/i.test(value)) {
    return -Infinity;
  }
  const choices = type === "pose" ? intent.poseCategories : intent.outfitCategories;
  if (choices.length) {
    const category = type === "pose" ? item.category_zh : item.category;
    if (!choices.some((choice) => normalize(category).includes(normalize(choice)) ||
      normalize(choice).includes(normalize(category)))) return -Infinity;
  }
  let points = 0;
  if (type === "pose" && intent.natural && /full_single|标准|日常|自然/i.test(value)) points += 10;
  for (const modifier of intent.modifiers) {
    if (value.includes(normalize(modifier.name)) || value.includes(normalize(modifier.en))) {
      points += 5;
    }
  }
  return points;
}

function rank(items, type, intent, random) {
  if (!intent) return items.slice();
  return items.map((item) => ({ item, score: score(item, type, intent), tie: random() }))
    .filter((entry) => entry.score > -Infinity)
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .map((entry) => entry.item);
}

function selectionInfo(intent) {
  return intent && { description: intent.input, matched: intent.understood,
    unsupported: intent.unsupported,
    note: "基于本地分类与关键词规则选图，不是视觉理解或 AI 语义模型；不支持的风格未被强行当作已匹配。" };
}

module.exports = { interpret, score, rank, selectionInfo };
