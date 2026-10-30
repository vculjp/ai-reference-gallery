# Local Skill usage

## Face references (new)

Catalog v1 includes `portrait` in addition to `pose` and `outfit` (1,499 faces/styling references). Query with `catalog --type portrait`, `search --type portrait --category short` or `categories --type portrait`.

In `compose` or paired `grid`, use `--portrait-id f71f980dde3` for one specific face, or filter using `--portrait-hair short|medium|semi-long|long`, `--portrait-section face|styling`, `--portrait-query TEXT`. A seeded random matching face is used across all output panels. `--person FILE` and portrait catalog selection are mutually exclusive. Selected originals come from the licensed AI Portrait Gallery by あぎ and are cached on demand. This does not generate or replace human faces automatically.

The entry point is `scripts/gallery.cjs` **relative to the installed Skill directory**. Use an absolute path to call it from any working directory, e.g. `node "$env:USERPROFILE\.codex\skills\ai-reference-gallery\scripts\gallery.cjs" help` on Windows PowerShell. No clone, `catalog.js`, `composition.js`, `img/` directory, or `git` command is required for an installed Skill. `data/catalog-v1.json.gz` stores the versioned metadata; `data/runtime.json.gz` stores Canvas and i18n code.

## Installation

With Codex's built-in `skill-installer`, use the **nested** Skill path (not the repository root):

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" --repo vculjp/ai-reference-gallery --path .agents/skills/ai-reference-gallery --method git
```

Reload Codex to discover the Skill. For an existing installation, reinstall or update the Skill to pick up the bundled runtime and downloader; the old version will not work outside the gallery repository.

The source catalog is included in the Skill (~87 KB compressed). On first export the downloader retrieves **only the selected originals** over HTTPS from `gallery.zsj.pp.ua` or, as fallback, `raw.githubusercontent.com/vculjp/ai-reference-gallery`; it caches them under `~/.cache/ai-reference-gallery/img/`. Later requests reuse cached files. Downloads are never uploaded to an AI service. You may configure `AI_REFERENCE_ASSET_BASE` to a trusted HTTPS mirror and `AI_REFERENCE_CACHE_DIR` to control cache storage. On Windows, the script uses `curl.exe` when available.

## Search

- `catalog --type pose|outfit --id ID --category NAME --query WORDS --offset 0 --limit 20` is the public, stable Catalog v1 JSON interface. `catalog --format manifest` exports all records as one JSON document without downloading photos. See [Catalog v1 documentation](https://github.com/vculjp/ai-reference-gallery/blob/main/docs/catalog-api.md) for the versioned data contract.

- `search --type pose|outfit --query "words" --category "value" --limit 10`
- `categories --type pose|outfit`
- `--lang zh-CN|en|ja` displays translated category and pose names where provided.
- Search performs case-insensitive substring matching across the ID and original / localized catalog fields. Multiple whitespace-separated terms must **all** match. There is no embedding model or external semantic search API; translate vague descriptions to useful catalog keywords first.
- `--describe "春季自然站姿，不要性感风格"` supports local rules for seasons, standing/sitting/squatting/lying poses, some angles/colors, natural/casual pose preference, and style exclusions. It can be used with `search`, `compose` or `grid`. JSON includes `selection.matched` and `selection.unsupported`. For example `日系` currently has no reliable visual classification and is reported as unsupported, not silently claimed as matched. This is an **interpretable filtering heuristic**, not visual understanding or an LLM.
- Use `--include-duo` to include two-person poses. Explicit pose IDs work even if they are two-person assets.

## Composition

`compose` chooses one real catalog pose from each pose group and one outfit per output. You can provide `--pose-id`, `--outfit-id`, `--pose-query`, `--outfit-query`, `--pose-category`, `--outfit-category`, `--include-duo`, `--seed`, `--count`, `--person`, `--outfit-image`, `--background white|soft`, `--labels true|false`, `--lang`, `--out FILE.png` (one result), `--out-dir DIR` (one or multiple), and `--overwrite`.

Outputs for `output/example.png` (relative to the **current working directory**):

- `output/example.png`: actual exported PNG created using `composition.js`.
- `output/example.txt`: AI creation prompt for the selected reference positions and roles.
- `output/example.json`: catalog IDs, localized labels, dimensions and export file names.

Automatic output names are `reference-001.png`, `reference-002.png`, etc. Files are not uploaded or sent to an AI model. The local rendering server is bound to 127.0.0.1 on an ephemeral port and shuts down when export finishes.

## Four-grid and nine-grid

Use `grid --size 4` for a **2×2 layout** or `grid --size 9` for a **3×3 layout**. Each cell is a complete, independently selected two- or three-image reference board. They are numbered reading left to right, top to bottom. The final output is **one comparison PNG**, not 4/9 separate files. By default it is saved as `output/skill-grids/grid-4.png` or `grid-9.png`; set `--out` or `--out-dir` to change the location.

The companion `.txt` describes the grid and provides a separate AI prompt for each numbered cell. The `.json` lists row, column, pose ID, outfit ID, and optional photo reference for each cell, plus the final PNG dimensions.

### Two grid modes

- `--grid-mode pairs` (default): each cell combines one pose and one outfit; optional `--person` adds the same local character photo to each paired board. Legacy commands work unchanged.
- `--grid-mode single --grid-source pose`: each cell shows **one pose**. With `--grid-source outfit`, each cell shows **one outfit**. No `--person` or `--outfit-image` in this mode. For `--aspect square` the output is 2400×2400; `--aspect portrait` outputs 2400×3200, with sources fully contained and not cropped. `--aspect` is only valid for single-image grids.
- If no exact ID is fixed, all 4 or 9 grid items must be unique; conflicting or overly narrow filters return an actionable error rather than a grid with duplicate images.

```bash
node scripts/gallery.cjs doctor
node scripts/gallery.cjs grid --size 4 --grid-mode single --grid-source outfit --out output/outfits.png
node scripts/gallery.cjs grid --size 9 --grid-mode single --grid-source pose --aspect portrait --describe "自然站姿" --out output/poses.png
node scripts/gallery.cjs grid --size 9 --grid-mode pairs --describe "春季自然站姿，不要性感风格" --seed spring1 --out output/matches.png
```

```bash
# Commands below assume you are inside the installed Skill directory.
# Four distinct outfits/poses.
node scripts/gallery.cjs grid --size 4 --pose-category 站姿 --outfit-category spring --seed lookbook-4

# Nine poses using one fixed outfit.
node scripts/gallery.cjs grid --size 9 --outfit-id SPR-0001 --seed pose-set-9

# Four variations with one uploaded person reference.
node scripts/gallery.cjs grid --size 4 --person "C:/Photos/person.jpg" --out output/my-four-grid.png
```

Grid accepts the same catalog filters and options as `compose`, except it requires `--size 4|9` instead of `--count`. Use `--pose-id` / `--outfit-id` to intentionally lock one reference across every paired cell. Without a locked ID, too few unique catalog matches cause an error rather than repeating assets. Every grid element preserves original image proportions. Paired grids use fixed pose → outfit → optional person order and a landscape canvas; single-image grids contain exactly one source image per cell.

## Common errors

- **No matching poses/outfits**: run `categories` or broaden `search`, then choose exact IDs. Search filters are AND conditions.
- **Output already exists**: choose another `--out` or `--out-dir`; use `--overwrite` only with the user's consent.
- **Chrome/Edge not found**: install a supported browser or set `CHROME_PATH`.
- **Image downloading failed**: check connectivity to the project's image domain / GitHub. The script retries and can use a configured `AI_REFERENCE_ASSET_BASE` mirror. It does NOT require cloning the image repository. Cached images are reused offline.
- **Cache inconsistency**: cached images are validated by file format and a local SHA-256 sidecar; if the digest changes the downloader re-fetches that image. The hash guards against later local corruption, not against a malicious source or an incorrect source image.
- **Environment issues**: run `node scripts/gallery.cjs doctor` from inside the installed Skill folder or call it via absolute path; it checks Node.js, Chrome/Edge, runtime archive, cache and current output folder without a network request.
- **Bundled runtime missing**: reinstall the entire Skill directory including `data/runtime.json.gz`, `scripts/` and `SKILL.md` (not just one script).
- **Image loading failed**: ensure your selected `--person` / `--outfit-image` is a valid local JPG, PNG or WebP file ≤50 MB.
- **Node/WebSocket unsupported**: run Node.js 22 or newer.
