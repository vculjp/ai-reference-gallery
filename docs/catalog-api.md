# Catalog v1：统一素材数据接口

网页使用 `catalog.js`、`depth-catalog.js`、`costume-catalog.js` 和 `portrait-catalog.js` 作为静态索引来源，兼容直接打开 `index.html`；构建脚本从它们生成稳定的 Catalog v1 JSON 压缩清单。不要手工编辑生成文件。Depth 的 1,439 个 ID 与原姿势库逐张相同，索引通过普通姿势元数据生成，原图存放在 `img/depth/original/`。

| 文件 | 用途 |
| --- | --- |
| `metadata/catalog-v1.json.gz` | 仓库公开数据接口；可供第三方下载解析 |
| `.agents/skills/ai-reference-gallery/data/catalog-v1.json.gz` | 随 Skill／npm CLI 分发的同版本清单 |
| `.agents/skills/ai-reference-gallery/data/runtime.json.gz` | 独立 Skill 需要的浏览器 Canvas 与多语言逻辑 |
| `.agents/skills/ai-reference-gallery/scripts/catalog-api.cjs` | 加载、验证、筛选、分页和图片 URL 解析的 Node.js API |

当前 schemaVersion 为 **1**；修改字段含义或删除字段前必须升级大版本。原有素材 `id`、`pose_key`、`category` 和相对图片路径保持不变，不会复制 2GB 原图库。

## 数据结构

将 `metadata/catalog-v1.json.gz` 解压后得到 JSON：

```json
{
  "schemaVersion": 1,
  "source": ["catalog.js", "depth-catalog.js", "costume-catalog.js", "portrait-catalog.js"],
  "counts": { "pose": 1439, "depth": 1439, "outfit": 1407, "portrait": 1499 },
  "collections": {
    "depth": [
      {
        "id": "full_sexy_P001_front",
        "relatedPoseId": "full_sexy_P001_front",
        "category_zh": "站姿",
        "thumbnail": "img/depth/thumbs/full_sexy_P001_front.jpg",
        "original": "img/depth/original/full_sexy_P001_front.png"
      }
    ],
    "pose": [
      {
        "id": "full_sexy_P001_front",
        "pose_key": "全身1人・セクシー系|P001",
        "category_zh": "站姿",
        "thumbnail": "img/pose/solo-expressive/thumbs/full_sexy_P001_front.jpg",
        "original": "img/pose/solo-expressive/original/full_sexy_P001_front.png"
      }
    ],
    "outfit": [
      {
        "id": "SPR-0001",
        "category": "spring",
        "thumbnail": "img/costume/spring/thumbs/SPR-0001.webp",
        "preview": "img/costume/spring/preview/SPR-0001.webp",
        "original": "img/costume/spring/original/SPR-0001.png"
      }
    ],
    "portrait": [
      {
        "id": "f71f980dde3",
        "section": "face",
        "category": "short",
        "thumbnail": "img/portrait/thumb/f71f980dde3.webp",
        "original": "img/portrait/original/f71f980dde3.png"
      }
    ]
  }
}
```

上述示例为精简字段。真实数据**保留网页索引中的原始字段**，包括多语言标签、姿势系列、角度、服饰关键词及脸库发型描述。清单使用相对素材路径；**姿势、服装与脸部原图均通过本站的 `img/` 路径解析**，图片需要部署到对应静态存储。清单本身不包含图片二进制内容。

## CLI 与 Node.js 读取

```bash
# 从任意目录执行已安装的 CLI（npm 发布后）
ai-reference-gallery catalog --type outfit --category spring --limit 10
ai-reference-gallery catalog --type pose --query 站姿 --offset 20 --limit 5
ai-reference-gallery catalog --type depth --query 站姿 --offset 20 --limit 5
ai-reference-gallery catalog --type outfit --id SPR-0001
ai-reference-gallery catalog --type portrait --category short --limit 5

# 输出完整 JSON 清单到文件（注意它不包含图片）
ai-reference-gallery catalog --format manifest > catalog.json
```

```js
const api = require("@vculjp/ai-reference-gallery/catalog");
const catalog = api.loadManifest();
const page = api.query(catalog, { type: "outfit", category: "spring", limit: 10 });
const url = api.imageURL(page.items[0], "original");
console.log(page.total, url);
```

接口返回：`{schemaVersion,type,total,offset,limit,items}`；`type` 为 `pose`、`outfit` 或 `portrait`，`limit` 最大 1000，支持 `id`、`category`、`q`。它是本地只读查询接口，**不是在线 HTTP API**。

## 数据修改与版本同步

编辑 `catalog.js`／`costume-catalog.js`／`portrait-catalog.js` 或 `composition.js`／`i18n.js` 后，执行：

```bash
npm run build:catalog
npm run check:catalog
npm test
```

`build:catalog` 同步更新公开清单、Skill 清单和运行时；`check:catalog` 解压后比较内容（避免不同系统的 gzip 编码差异），不一致立即报错，CI 会阻止过期的清单进入发布。生成文件需随源码一并提交。对旧版本 Skill 的兼容性应通过发布新版本验证。

**素材许可：**MIT 仅覆盖代码。清单源于第三方图库，图片与元数据适用相应权利人的条件，详见 [ASSETS.md](../ASSETS.md)；不要将接口可用误认为授予了二次分发或商用授权。
