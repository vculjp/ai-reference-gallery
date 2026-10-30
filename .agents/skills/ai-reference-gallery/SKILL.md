---
name: ai-reference-gallery
description: Standalone pose, depth, outfit and face reference Skill. Supports matched Depth maps, catalog face selection, natural-language selection, caching, reference boards, and 4/9-panel grids. No full gallery download or API key required.
---

# AI Reference Gallery

**Standalone after installation.** The skill contains a versioned Catalog v1 manifest (`data/catalog-v1.json.gz`) plus compressed Canvas/i18n runtime (`data/runtime.json.gz`); it runs from ANY working directory, including `E:\codex` or an unrelated project. Only selected original images are fetched over HTTPS and cached for later use. **Never require cloning the full gallery or copying `catalog.js`.** This tool composes reference boards, not finished AI artwork.

## Workflow

1. Find this installed `SKILL.md` and run its sibling `scripts/gallery.cjs` with an **absolute path** (for example `node "C:\Users\YOUR_NAME\.codex\skills\ai-reference-gallery\scripts\gallery.cjs" ...`). The current directory controls where output files are written; it need not contain a gallery or any images.
2. Run `doctor` first when a user's environment is unknown or exports fail. It checks Node.js, Chrome/Edge, bundled runtime, cache write permissions and output directory offline.
3. Use `--describe "春季自然站姿，不要性感风格"` for explainable rule-based selection, or explicit category/ID filters. The `selection` JSON field lists matched and **unsupported** constraints. Never claim to understand unsupported styles (e.g. 日系) visually or semantically. `search` and `categories` work offline; never invent IDs.
4. Run `compose` for separate two/three-image PNGs; use `grid --size 4|9 --grid-mode pairs` for 4/9 paired reference boards in **one** PNG (default), or `grid --size 4|9 --grid-mode single --grid-source pose|outfit` for a **single-image grid** where each cell contains one independent image. Single-image grids support `--aspect square|portrait`. If no fixed ID is requested, grids require distinct matching assets and fail clearly rather than silently repeating.
5. The Skill downloads only the selected originals (static site, then GitHub fallback) and retains an SHA-256-checked local cache. Internet is needed only for uncached images. Read the returned JSON; output `.png`, `.txt` and `.json` paths accurately.

## Commands

```bash
# Run these from the installed Skill directory, OR invoke gallery.cjs by absolute path.
# On a Windows global Codex install, see the PowerShell example below.
# Explore available categories or catalog records (JSON output).
node scripts/gallery.cjs categories --type pose
node scripts/gallery.cjs catalog --type outfit --category spring --limit 10
node scripts/gallery.cjs catalog --format manifest
node scripts/gallery.cjs search --type pose --query "站姿" --limit 8
node scripts/gallery.cjs search --type depth --query "站姿" --limit 8
node scripts/gallery.cjs search --type outfit --category spring --query "white"
node scripts/gallery.cjs search --type portrait --category short --limit 10
node scripts/gallery.cjs catalog --type portrait --id f71f980dde3
node scripts/gallery.cjs doctor
node scripts/gallery.cjs search --type outfit --describe "春季穿搭不要性感风格" --limit 8

# Reproducible random combinations; no need to start a browser for searching.
node scripts/gallery.cjs compose --pose-category 站姿 --outfit-category spring --count 5 --seed street-01 --out-dir output/street

# Explicit pose and clothing image; optional third, user-owned person photo.
node scripts/gallery.cjs compose --pose-id full_sexy_P001_front --outfit-id SPR-0001 --person "C:/Photos/person.png" --out output/my-reference.png

# Select a real face from the portrait catalog instead of uploading a local photo.
node scripts/gallery.cjs compose --pose-id full_sexy_P001_front --outfit-id SPR-0001 --portrait-id f71f980dde3 --out output/face-reference.png
node scripts/gallery.cjs compose --pose-id full_sexy_P001_front --outfit-id SPR-0001 --use-depth --out output/depth-outfit.png
node scripts/gallery.cjs compose --pose-id full_sexy_P001_front --outfit-id SPR-0001 --depth-file "C:/Photos/depth.png" --out output/custom-depth.png
node scripts/gallery.cjs grid --size 9 --use-depth --out output/depth-grid.png
node scripts/gallery.cjs grid --size 9 --grid-mode single --grid-source depth --pose-category 站姿 --out output/depth-sheet.png
node scripts/gallery.cjs grid --size 4 --portrait-hair long --portrait-section face --out output/one-character-grid.png

# Custom outfit photo in slot two, without a catalog outfit.
node scripts/gallery.cjs compose --pose-id full_sexy_P001_front --outfit-image "C:/Photos/outfit.webp" --background soft --labels false --out output/custom.png

# Four-panel comparison grid: one PNG, four different looks (2 columns × 2 rows).
node scripts/gallery.cjs grid --size 4 --pose-category 站姿 --outfit-category spring --seed four-demo --out output/four-grid.png

# Nine-panel comparison grid: nine poses against the SAME outfit (3 × 3).
node scripts/gallery.cjs grid --size 9 --outfit-id SPR-0001 --seed nine-demo --out output/nine-grid.png

# One image in each cell: 3x3 pose sheet, or portrait 2x2 clothing sheet.
node scripts/gallery.cjs grid --size 9 --grid-mode single --grid-source pose --pose-category 站姿 --out output/poses.png
node scripts/gallery.cjs grid --size 4 --grid-mode single --grid-source outfit --aspect portrait --out output/outfits.png

# Natural-language constraints, seed makes the selection repeatable.
node scripts/gallery.cjs grid --size 9 --describe "日系春季穿搭，动作自然站姿，不要性感风格" --seed demo --out output/natural.png

# Four/nine variations of the SAME character with a user-provided third reference:
node scripts/gallery.cjs grid --size 4 --person "C:/Photos/person.png" --out output/my-character-grid.png
```

PowerShell from **any folder**, after installing the Skill through Codex:

```powershell
$skill = "$env:USERPROFILE\.codex\skills\ai-reference-gallery\scripts\gallery.cjs"
node $skill search --type pose --query "站姿" --limit 5
node $skill grid --size 4 --pose-category 站姿 --outfit-category spring --out output/four-grid.png
node $skill grid --size 9 --grid-mode single --grid-source outfit --describe "春季服装" --out output/spring.png
node $skill doctor
```

Every standard reference board uses **fixed left-to-right** order: pose OR depth → outfit → optional person. With `--use-depth`, Depth **replaces** the pose instead of adding a third panel. In paired grids, each left-hand pose is replaced by its matched Depth. The `grid` command arranges boards in a numbered 2×2 or 3×3 matrix. The grid's `.txt` contains prompts for every cell. Only catalog images show catalog IDs. Images are contained without cropping. `--person` and `--outfit-image` accept local JPG, PNG or WebP up to 50 MB; `--depth-file` requires a local PNG. User photos stay local. Defaults are `output/skill-compositions` for `compose` and `output/skill-grids/grid-4.png` or `grid-9.png` for `grid`, **relative to the caller's working directory**.

`--lang zh-CN|en|ja` controls catalog labels and prompts. Random selection defaults to single-person poses; use `--include-duo` for two-person poses. `compose --count` ranges from 1 to 20; `grid` uses `--size 4|9`. Explicit `--pose-id` / `--outfit-id` locks an asset across cells. Otherwise grid outputs enforce distinct references. `--describe` uses local catalog rules, NOT AI image recognition; unsupported style terms are reported. Existing files are never overwritten without `--overwrite`.

PNG generation requires **Node.js 22+ and installed Chrome or Edge**. Set `CHROME_PATH` if auto-detection fails. No npm packages or remote API keys are required. Original downloads go into `~/.cache/ai-reference-gallery/img/` (override with `AI_REFERENCE_CACHE_DIR`); cached files get SHA-256 sidecars and are re-fetched if changed or corrupted. Downloader prints progress to stderr while keeping JSON output on stdout. `AI_REFERENCE_ASSET_BASE` can point to a trusted HTTPS static mirror. `doctor`, `search` and `categories` work without image downloads.

Faces come from [AI Portrait Gallery](https://ai-portrait-gallery.pages.dev/) by あぎ. Use `--portrait-id`, or `--portrait-hair short|medium|semi-long|long` with `--portrait-section face|styling` and `--portrait-query`. One selected face is shared across a batch or paired grid. `--person FILE` and catalog-face options are mutually exclusive. Original faces are downloaded and cached only when selected.

See [usage and troubleshooting](references/usage.md) for search semantics and error recovery.

## Guardrails

- This is **reference-board composition**, not final image synthesis or automatic face replacement.
- Do not upload local photos to external services or copy source images into the skill folder.
- Catalog assets retain their original restrictions: read `ASSETS.md` before redistributing or commercializing materials. The code's MIT license does not grant blanket rights to the images.
- If a category/keyword has no matches, report that and use search to find supported alternatives rather than silently changing the request.
