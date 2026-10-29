---
name: ai-reference-gallery
description: Standalone AI reference-image Skill. Search bundled pose and outfit catalogs and automatically download only selected photos to make 2/3-image PNG boards or 4/9-panel grids with prompts. No gallery clone required. Use for pose/outfit matching, reference image generation, and batch export.
---

# AI Reference Gallery

**Standalone after installation.** The skill directory includes a small compressed catalog and the website's Canvas compositor. It runs from ANY working directory, including `E:\codex` or a project unrelated to this repository. It fetches only the requested original images over HTTPS and caches them for later use. **Never require cloning the full image gallery, copying `catalog.js`, or running commands from the repository root.** Do not claim to generate finished AI artwork or call a diffusion model.

## Workflow

1. Find this installed `SKILL.md` and run its sibling `scripts/gallery.cjs` with an **absolute path** (for example `node "C:\Users\YOUR_NAME\.codex\skills\ai-reference-gallery\scripts\gallery.cjs" ...`). The current directory controls where output files are written; it need not contain a gallery or any images.
2. Translate the user's natural-language request to catalog terms. `categories` and `search` use the bundled metadata and work offline. Never invent IDs or paths; use actual results. Pose angles have separate IDs; multiple angles may be members of one `poseKey`.
3. Run `compose` with exact IDs when specific matches matter, or filters plus `--seed` and `--count` for reproducible random compositions. For a **四宫格 / four-grid** or **九宫格 / nine-grid**, run `grid --size 4` or `grid --size 9`: the output is ONE PNG with 4/9 different reference combinations, not 4/9 separate PNG files.
4. For export, the Skill automatically downloads only the chosen originals from the project's static image site, falling back to GitHub, and retains a local cache. This requires network access **only for uncached images**. Read the returned JSON. The PNG is the real reference board; the neighboring `.txt` is its prompt; the `.json` records selected references and dimensions.

## Commands

```bash
# Run these from the installed Skill directory, OR invoke gallery.cjs by absolute path.
# On a Windows global Codex install, see the PowerShell example below.
# Explore available categories or catalog records (JSON output).
node scripts/gallery.cjs categories --type pose
node scripts/gallery.cjs search --type pose --query "站姿" --limit 8
node scripts/gallery.cjs search --type outfit --category spring --query "white"

# Reproducible random combinations; no need to start a browser for searching.
node scripts/gallery.cjs compose --pose-category 站姿 --outfit-category spring --count 5 --seed street-01 --out-dir output/street

# Explicit pose and clothing image; optional third, user-owned person photo.
node scripts/gallery.cjs compose --pose-id full_sexy_P001_front --outfit-id SPR-0001 --person "C:/Photos/person.png" --out output/my-reference.png

# Custom outfit photo in slot two, without a catalog outfit.
node scripts/gallery.cjs compose --pose-id full_sexy_P001_front --outfit-image "C:/Photos/outfit.webp" --background soft --labels false --out output/custom.png

# Four-panel comparison grid: one PNG, four different looks (2 columns × 2 rows).
node scripts/gallery.cjs grid --size 4 --pose-category 站姿 --outfit-category spring --seed four-demo --out output/four-grid.png

# Nine-panel comparison grid: nine poses against the SAME outfit (3 × 3).
node scripts/gallery.cjs grid --size 9 --outfit-id SPR-0001 --seed nine-demo --out output/nine-grid.png

# Four/nine variations of the SAME character with a user-provided third reference:
node scripts/gallery.cjs grid --size 4 --person "C:/Photos/person.png" --out output/my-character-grid.png
```

PowerShell from **any folder**, after installing the Skill through Codex:

```powershell
$skill = "$env:USERPROFILE\.codex\skills\ai-reference-gallery\scripts\gallery.cjs"
node $skill search --type pose --query "站姿" --limit 5
node $skill grid --size 4 --pose-category 站姿 --outfit-category spring --out output/four-grid.png
```

Every individual reference board uses **fixed left-to-right** order: pose → outfit → optional person. The `grid` command arranges complete boards in a numbered 2×2 or 3×3 matrix. The grid's `.txt` contains individual prompts for every cell. Only catalog images show catalog IDs. Images are contained without cropping. `--person` and `--outfit-image` accept local JPG, PNG or WebP up to 50 MB; user photos stay local. Defaults are `output/skill-compositions` for `compose` and `output/skill-grids/grid-4.png` or `grid-9.png` for `grid`, **relative to the caller's working directory**.

`--lang zh-CN|en|ja` controls labels and generated prompts. Random selection defaults to single-person poses; use `--include-duo` for two-person poses. `compose --count` ranges from 1 to 20 and avoids repeating pose groups or outfits until their pools are exhausted. `grid` uses `--size 4|9` instead of `--count`; if selection filters yield fewer unique options, repetitions may occur. Existing output files are not overwritten unless `--overwrite` is explicitly given.

PNG generation requires **Node.js 22+ and installed Chrome or Edge**. Set `CHROME_PATH` to the browser executable when auto-detection fails. No npm packages or remote API keys are required. First-time image download needs internet access; downloaded originals are cached under `~/.cache/ai-reference-gallery/img/` (override with `AI_REFERENCE_CACHE_DIR`). Change `AI_REFERENCE_ASSET_BASE` to a trusted HTTPS static mirror if necessary. Only search/categories work without Chrome or internet.

See [usage and troubleshooting](references/usage.md) for search semantics and error recovery.

## Guardrails

- This is **reference-board composition**, not final image synthesis or automatic face replacement.
- Do not upload local photos to external services or copy source images into the skill folder.
- Catalog assets retain their original restrictions: read `ASSETS.md` before redistributing or commercializing materials. The code's MIT license does not grant blanket rights to the images.
- If a category/keyword has no matches, report that and use search to find supported alternatives rather than silently changing the request.
