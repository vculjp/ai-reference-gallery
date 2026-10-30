# Image attribution and licensing / 素材来源与授权

This project combines a static image viewer with separately sourced visual reference material. **The MIT license in `LICENSE` applies to the source code only; it does not grant rights to the images, thumbnails, or source-derived catalog metadata.**

本仓库中的浏览器代码与图像素材适用不同的版权、授权条件。**MIT 代码许可证不代表图像或原站衍生目录数据可自由再分发或商用。**

## 来源

| 类型               | 原始来源                                                    | 对应文件                             |
| ------------------ | ----------------------------------------------------------- | ------------------------------------ |
| Pose / 姿势参考    | [AI Pose Gallery](https://ai-pose-gallery.pages.dev/)       | `img/pose/`, `catalog.js`            |
| Costume / 服装参考 | [AI Costume Gallery](https://ai-costume-gallery.pages.dev/) | `img/costume/`, `costume-catalog.js` |
| Portrait / 脸部与造型参考 | [AI Portrait Gallery](https://ai-portrait-gallery.pages.dev/)（あぎ） | `img/portrait/thumb/`、`img/portrait/original/`、`portrait-catalog.js` |

The images and source-derived metadata remain subject to their respective rights holders' conditions. The maintainer has reported authorization for the project materials; **before publishing a public repository, verify and document the precise permitted scope**, including public redistribution on GitHub, downloadable originals, modifications, and any credit or license requirements.

项目维护者已表示取得相关授权，但在公开发布前仍须以实际授权条款核对并留存适用范围，包括 GitHub 公开分发、原图下载、修改、署名以及第三方再利用等条件。**仅注明来源或添加原站链接，不等于获得相应的版权许可。**

### 脸部素材的交付方式

脸库收录 1,499 张图（Face 893、Styling 606），来源作者为 **あぎ**，并非姿势与服装图库的作者 ギア。维护者表示已另行获得该脸库的使用授权。原站公开标注 CC0，同时请求避免直接再分发源图片数据；具体再分发范围以维护者取得的额外授权为准。

本地工程提供完整的静态素材索引、**1,499 张本地 WebP 缩略图**（约 27 MiB），以及完整下载后约 **4.86 GB** 的本地原始 PNG。原图位于 `img/portrait/original/`，和姿势／服装图库相同，不依赖原站在线读取。网页的预览、导出均使用本地相对路径；Agent Skill 则按需通过项目网站及其镜像下载选中的素材并缓存。**在将项目部署到新设备或 Cloudflare 时，必须同时确保原图已实际上传到相应静态存储，不能只上传目录索引。**

**GitHub 分发**：`img/portrait/original/*.png` 使用 Git LFS 跟踪。克隆者需要安装 Git LFS、运行 `git lfs pull` 才能取得实际 PNG；普通 Git 文件历史只保存指针。静态托管平台或 CI 构建系统如未拉取 LFS 内容，部署到网站上的也可能只是指针文件。GitHub 的 LFS 存储和下载带宽均有限额，公开仓库频繁克隆可能消耗配额。参见 [GitHub LFS 计费说明](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)。

开发者可运行 `node scripts/import-portraits.cjs --thumbs` 检查并续传缩略图；`--full` 可在获授权且磁盘空间充足时续传全部原图，**全部校验成功后才切换到本地路径**。重新执行会跳过已校验的文件。由于静态原图总体积较大，上传 GitHub／部署 Cloudflare 前应先核实大小限制及托管方案；仅本地下载不会自动上传至远程。

If permission does not cover public redistribution, omit the corresponding images and metadata from the public repository or replace them with independently licensed assets. This project is unaffiliated with either original reference site.
