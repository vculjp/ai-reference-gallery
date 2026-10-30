# Skill 标准化分发与自动发布

## 分发渠道

项目提供**同一套** `.agents/skills/ai-reference-gallery/` 源码，适用于三个分发入口：

1. **GitHub Agent Skill 子目录**：Codex 等兼容 Agent Skills 的平台可按各自安装规范从仓库导入 `.agents/skills/ai-reference-gallery`，其中含 `SKILL.md`、数据包、脚本和使用说明。
2. **GitHub Release ZIP**：推送符合版本的 Git 标签后，工作流生成 `ai-reference-gallery-skill-vX.Y.Z.zip`。解压后的 `ai-reference-gallery/` 是独立 Skill 根目录，可以复制到助手的 Skills 文件夹，不依赖整个仓库。
3. **npm CLI**：以 `@vculjp/ai-reference-gallery` 打包分发（需先由维护者在 npm 发布该包）。安装后使用 `ai-reference-gallery` CLI；也可以通过包的 `/catalog` 子路径读取 Catalog v1 数据。

**现阶段 npm 包名只是在仓库中配置；没有运行 npm publish 前，不能宣称 npm 上已有正式版本。**

### 本地使用与打包检查

```bash
node bin/ai-reference-gallery.cjs doctor
node bin/ai-reference-gallery.cjs catalog --type pose --limit 3
node bin/ai-reference-gallery.cjs grid --size 4 --grid-mode single --grid-source outfit --out output/sample.png

npm run check:catalog
npm test
npm pack --dry-run
```

`npm pack` 的内容不包含 `img/` 里的原图。图片仅在实际导出时按需下载并放入用户缓存；命令行执行要求 Node.js 22+，实际图片导出还需要 Chrome／Edge。

## CI 检查

`.github/workflows/ci.yml` 在 PR、`main` 分支推送或手动运行时自动启动 Ubuntu／Windows 双平台检查，包含：

- 从 GitHub **稀疏检出**代码和小清单，避免每次 CI 下载约 2GB 的图片仓库；
- 数据清单与网站源索引、Skill Runtime 字节一致性校验；
- Catalog API、独立 CLI、npm 打包内容测试，以及无需图片的 Skill 规则测试；
- 网站 JS 语法检查，确保发布包不夹带原图库。

这套快速 CI **不等同完整真实图片浏览器端到端测试**。本地完整回归（有全量图片与 Chrome／Edge 时）执行：

```bash
npm run test:full
node scripts/browser-smoke.cjs
```

## Release 流程

`.github/workflows/release.yml` 在推送 `v*` 版本标签时：

1. 检查 Git tag 与 `package.json` 中 `version` 一致，且生成索引不是旧版本。
2. 执行分发测试。
3. 打包独立 Skill ZIP、npm TGZ，并生成 `SHA256SUMS.txt`。
4. 使用 GitHub Token 创建对应 GitHub Release。
5. **仅在仓库 Secrets 已设置 `NPM_TOKEN` 时**调用 `npm publish --access public`；否则只发布 GitHub Release。

示例（先确认版本号及授权、测试结果；**不要重复使用已发布的版本号**）：

```bash
# 修改 package.json 中 version 并完成相应提交后
git tag v0.1.0
git push origin v0.1.0
```

此示例只展示流程，**不会自动创建标签或推送**。发布前应确认 npm 组织权限、GitHub Actions 权限与 [素材使用许可](../ASSETS.md)；如果尚未在 npm 上注册该作用域/包名，不要设置自动发布密钥。
