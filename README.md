# AI Reference Gallery

> **5,784 条参考素材记录 · 姿势 × Depth 深度图 × 服饰 × 脸部造型。**
> 开源 AI 创作参考图库：选姿势和服装、挑选人物参考、随机组合四宫格／九宫格，或用一一对应的 Depth 深度图替换姿势图。网页可离线使用，也提供独立的 Agent Skill。**项目制作参考图和提示词，不负责 AI 生图、自动换装或换脸。**

[在线体验](https://gallery.zsj.pp.ua/) · [GitHub 源码](https://github.com/vculjp/ai-reference-gallery) · [项目维护 @vculjp](https://x.com/vculjp)

**素材原作者：**あぎ（[@agi_aibusi](https://x.com/agi_aibusi)）。本项目整合的姿势、Depth 深度图、服饰及脸部造型素材均来自该作者；代码整理由 [@vculjp](https://x.com/vculjp) 维护。

> Depth 功能已合并到 `main` 分支。在线体验的功能和素材是否齐全，以网站当前部署版本为准。

## 页面预览

| 脸部素材页                                                 | 姿势库素材页                                                        |
|:----------------------------------------------------------:|:-------------------------------------------------------------------:|
| ![脸部素材页：Face 与 Styling 素材浏览](docs/portrait.jpg) | ![姿势库素材页：分类与多角度姿势参考](docs/preview.jpg)             |
| **服饰素材页**                                             | **随机四宫格素材页**                                                |
| ![服饰素材页：按分类浏览服装参考](docs/costumes.jpg)       | ![随机四宫格素材页：四组不重复的姿势与服装参考](docs/four-grid.jpg) |

四宫格图来自网页「**重新随机全部**」的真实操作：从图库随机抽取 **4 组不同姿势＋4 套不同服饰**，每格展示一组搭配。截图是一次随机结果，**不是每次打开 README 自动变换的图片**；可在网站里重新随机，并切换为对应的 Depth 深度参考。

## 主要功能

| 模块                  | 能做什么                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **姿势图库**          | 1,439 张姿势图（288 组），按系列、分类、视角、关键词搜索，支持原图预览与下载                                                                         |
| **Depth 深度图库**    | 1,439 张与原姿势按 ID、视角一一对应的深度参考图，支持浏览、筛选、原图下载                                                                            |
| **服装图库**          | 1,407 套穿搭素材，支持季节、风格、编号筛选                                                                                                           |
| **脸部图库**          | 1,499 张参考图（Face 893 / Styling 606），按用途、发型与关键词筛选                                                                                   |
| **双图 / 三图**       | 姿势（或对应 Depth）＋服装＋可选人物参考；支持随机搭配、脸库选人和本地上传                                                                           |
| **Depth 替换**        | 在组合制作中切换「用对应 Depth 代替姿势图」，左侧仅展示一种参考；普通组合还支持上传自定义 Depth PNG、恢复匹配图及下载原始 Depth                      |
| **四宫格 / 九宫格**   | 每格都是一组**姿势（或对应 Depth）＋服装**搭配，可统一人物参考、整组随机、单格重抽，姿势组与服装不重复                                               |
| **AI 生图提示词模式** | 默认「普通 AI 生图」：Depth 作为视觉参考，不要求工具支持专业深度控制；切换「专业 Depth 控制」后提示如何使用原始 PNG 与兼容的 Depth/ControlNet 工作流 |
| **导出与提示词**      | 保留完整宫格高清 PNG 的预览、复制和下载，另支持四宫格／九宫格**逐格高清 ZIP 导出**；专业 Depth 模式可同时打包每格对应的原始 Depth PNG 与提示词       |
| **多语言与离线**      | 简体中文、English、日本語；网页使用原生 HTML / CSS / JavaScript，无后端依赖                                                                          |

网页宫格输出：四宫格 **2048×2048**，九宫格 **3072×3072**。统一人物参考可以从脸库随机选择、手动选择，或上传自己的照片；上传的照片只在浏览器本地参与拼图。导出的是**创作参考板**，并非 AI 生成的最终人物图。

### Depth 是什么？怎么使用？

Depth 不是额外生成的一套动作，而是**原有 1,439 张姿势的逐张深度参考**：同一素材 ID 与拍摄角度，可以在普通姿势参考与 Depth 之间切换，方便向支持深度控制的 AI 工具提供结构参考。

1. 在「**Depth 深度图**」素材页浏览、筛选或下载对应的原始图片。
2. 在「**组合制作**」中选择姿势与服装，打开「**用对应 Depth 代替姿势图**」，即可用匹配的 Depth 替换姿势位置；关闭开关恢复原姿势。
3. 切换到「**四宫格 / 九宫格**」后也沿用同一开关。每格依然是两张参考图的搭配，不会把姿势和 Depth 同时叠加。
4. AI 提示词默认使用普通视觉参考模式；只有明确选择「**专业 Depth 控制**」时，才会提示单独使用原始 Depth PNG。宫格既能导出整张 PNG，也能将各格独立参考图打包为 ZIP；专业模式的 ZIP 还包含各格原始 Depth PNG。

普通参考图组合还可上传**自己的 Depth PNG**、恢复自动匹配或下载原始深度图；网页负责组织参考素材，**不会直接执行 ControlNet 等 AI 推理**。

## 网页怎么用

直接打开 [在线预览](https://gallery.zsj.pp.ua/)：浏览姿势／Depth／服装／脸部图库，或进入「组合制作」，选择双图、三图、四宫格、九宫格。支持按分类随机搭配、统一人物参考、切换对应的 Depth，并复制图片、下载 PNG 或复制提示词。

本地离线版：

```bash
git lfs install
git clone https://github.com/vculjp/ai-reference-gallery.git
cd ai-reference-gallery
git lfs pull
```

下载完整素材后双击 `index.html` 即可打开。网页本身**无需 npm、后端或构建**。通过 `file://` 导出使用本地原图的组合图时，按提示选择本项目的 `img/` 文件夹；使用同源 HTTP 网站时无需授权文件夹。

**素材下载提示：**姿势、Depth 和服饰资源位于仓库的 `img/` 目录；脸库的 1,499 张高清 PNG 使用 **Git LFS** 管理，原图约 4.5 GiB。克隆前请预留磁盘空间，并确保 LFS 原图已实际下载，否则脸部高清预览和导出可能不可用。新版本在线功能以网站实际部署为准。

## Agent Skill：无需下载整个图库

项目内置 [独立 Agent Skill](.agents/skills/ai-reference-gallery/SKILL.md)，可在 Codex 等兼容 Agent Skills 的助手中安装仓库子目录 `.agents/skills/ai-reference-gallery/`，无需克隆多 GB 原图库。

- 支持姿势、Depth、服饰、脸部的素材查询，以及自然语言规则筛选、素材 ID、分类和随机种子；无法理解的条件会明确反馈，不会冒充图像语义识别。
- 支持批量双图／三图、**组合四宫格／九宫格**；`--use-depth` 用对应 Depth 替换姿势，还可以指定自定义 Depth PNG。
- Skill 还支持**单图宫格**（每格一张姿势、Depth 或服饰），与网页的成对组合宫格不同。
- 可从脸库选定统一人物参考，也可使用自己的照片；按需下载选中的原图并缓存，不下载整库。
- 每次导出生成 **PNG 参考图＋TXT 提示词＋JSON 素材记录**。

示例：安装 Skill 后，可在任意工作目录用自然语言请求：

> 用春季穿搭和自然站姿随机生成 9 组不重复搭配，做一个九宫格，附上每格的提示词。

也可以从仓库内调用 CLI：

```bash
# 查询脸部素材
node bin/ai-reference-gallery.cjs catalog --type portrait --limit 5

# 查询 Depth 深度图
node bin/ai-reference-gallery.cjs search --type depth --query "站姿" --limit 5

# 九组姿势＋服装的组合宫格
node bin/ai-reference-gallery.cjs grid --size 9 --grid-mode pairs --describe "春季自然站姿，不要性感风格" --out output/nine-grid.png

# 单图姿势九宫格（Skill 模式）
node bin/ai-reference-gallery.cjs grid --size 9 --grid-mode single --grid-source pose --out output/poses.png

# 匹配 Depth 深度图后生成组合参考板（替换姿势，不是新增一列）
node bin/ai-reference-gallery.cjs compose --pose-id full_sexy_P001_front --outfit-id SPR-0001 --use-depth --out output/depth-reference.png

# 四格姿势＋服饰组合，并把各格姿势切换成匹配的 Depth
node bin/ai-reference-gallery.cjs grid --size 4 --grid-mode pairs --use-depth --out output/depth-pairs.png

# Depth 单图四宫格（每格一张深度参考，不等于 AI 生成成品）
node bin/ai-reference-gallery.cjs grid --size 4 --grid-mode single --grid-source depth --out output/depth-grid.png
```

Skill 的查询不需要浏览器；**导出 PNG 需要 Node.js 22+ 和 Chrome / Edge**，未缓存的原图首次导出需要网络。完整安装和参数见 [Skill 使用说明](.agents/skills/ai-reference-gallery/references/usage.md)。

## 给开发者

- [Catalog v1 素材接口](docs/catalog-api.md)：汇总姿势、Depth、服饰和脸部索引，生成版本化 JSON 清单，支持本地 CLI / Node.js 查询；**不是在线 HTTP API**。
- [分发与发布说明](docs/distribution.md)：独立 Skill、GitHub Release、npm CLI 打包及 CI 流程。**npm 包只有正式发布后才能通过 npm / npx 获取**。
- [贡献指南](CONTRIBUTING.md)：代码规范、测试和素材授权注意事项。

## 版权与致谢

项目**代码**采用 [MIT License](LICENSE)；图片及来源衍生数据不自动适用 MIT，使用或再分发请遵守 [ASSETS.md](ASSETS.md) 所述授权条件。

**四类素材的原作者统一为：あぎ（[@agi_aibusi](https://x.com/agi_aibusi)）。** 原始素材页面如下：

| 素材类型     | 原始项目                                                          |
| ------------ | ----------------------------------------------------------------- |
| 姿势         | [AI Pose Gallery](https://ai-pose-gallery.pages.dev/)             |
| Depth 深度图 | [AI Pose Depth Gallery](https://ai-pose-depth-gallery.pages.dev/) |
| 服饰         | [AI Costume Gallery](https://ai-costume-gallery.pages.dev/)       |
| 脸部与造型   | [AI Portrait Gallery](https://ai-portrait-gallery.pages.dev/)     |

本项目由 [@vculjp](https://x.com/vculjp) 整理维护，并非上述素材网站的官方项目。素材的使用与再分发条件请以 [ASSETS.md](ASSETS.md) 和实际授权为准。
