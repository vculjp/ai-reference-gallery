# Local Skill usage

The entry point is `scripts/gallery.cjs` **relative to the installed Skill directory**. Use an absolute path to call it from any working directory, e.g. `node "$env:USERPROFILE\.codex\skills\ai-reference-gallery\scripts\gallery.cjs" help` on Windows PowerShell. No clone, `catalog.js`, `composition.js`, `img/` directory, or `git` command is required for an installed Skill. `data/runtime.json.gz` contains the compressed indexes and Canvas implementation.

## Installation

With Codex's built-in `skill-installer`, use the **nested** Skill path (not the repository root):

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" --repo vculjp/ai-reference-gallery --path .agents/skills/ai-reference-gallery --method git
```

Reload Codex to discover the Skill. For an existing installation, reinstall or update the Skill to pick up the bundled runtime and downloader; the old version will not work outside the gallery repository.

The source catalog is included in the Skill (~87 KB compressed). On first export the downloader retrieves **only the selected originals** over HTTPS from `gallery.zsj.pp.ua` or, as fallback, `raw.githubusercontent.com/vculjp/ai-reference-gallery`; it caches them under `~/.cache/ai-reference-gallery/img/`. Later requests reuse cached files. Downloads are never uploaded to an AI service. You may configure `AI_REFERENCE_ASSET_BASE` to a trusted HTTPS mirror and `AI_REFERENCE_CACHE_DIR` to control cache storage. On Windows, the script uses `curl.exe` when available.

## Search

- `search --type pose|outfit --query "words" --category "value" --limit 10`
- `categories --type pose|outfit`
- `--lang zh-CN|en|ja` displays translated category and pose names where provided.
- Search performs case-insensitive substring matching across the ID and original / localized catalog fields. Multiple whitespace-separated terms must **all** match. There is no embedding model or external semantic search API; translate vague descriptions to useful catalog keywords first.
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

```bash
# Commands below assume you are inside the installed Skill directory.
# Four distinct outfits/poses.
node scripts/gallery.cjs grid --size 4 --pose-category 站姿 --outfit-category spring --seed lookbook-4

# Nine poses using one fixed outfit.
node scripts/gallery.cjs grid --size 9 --outfit-id SPR-0001 --seed pose-set-9

# Four variations with one uploaded person reference.
node scripts/gallery.cjs grid --size 4 --person "C:/Photos/person.jpg" --out output/my-four-grid.png
```

Grid accepts the same catalog filters and options as `compose`, except it requires `--size 4|9` instead of `--count`. Use `--pose-id` / `--outfit-id` to lock one reference across every cell. If fewer distinct catalog matches exist than the requested grid size, assets may repeat. Every grid element preserves original image proportions and follows fixed pose → outfit → optional person order. The grid canvas is landscape-oriented to leave room for the wide paired reference boards.

## Common errors

- **No matching poses/outfits**: run `categories` or broaden `search`, then choose exact IDs. Search filters are AND conditions.
- **Output already exists**: choose another `--out` or `--out-dir`; use `--overwrite` only with the user's consent.
- **Chrome/Edge not found**: install a supported browser or set `CHROME_PATH`.
- **Image downloading failed**: check connectivity to the project's image domain / GitHub. The script retries and can use a configured `AI_REFERENCE_ASSET_BASE` mirror. It does NOT require cloning the image repository. Cached images are reused offline.
- **Bundled runtime missing**: reinstall the entire Skill directory including `data/runtime.json.gz`, `scripts/` and `SKILL.md` (not just one script).
- **Image loading failed**: ensure your selected `--person` / `--outfit-image` is a valid local JPG, PNG or WebP file ≤50 MB.
- **Node/WebSocket unsupported**: run Node.js 22 or newer.
