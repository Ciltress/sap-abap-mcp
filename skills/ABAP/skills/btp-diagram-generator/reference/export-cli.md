# Exporting a diagram with the draw.io CLI

Platform-specific invocations for turning a `.drawio` file into PNG, SVG or PDF. Needed only at the
final export step, which is why it is here rather than in SKILL.md.

### Prerequisites

```bash
# macOS (Homebrew installs as `drawio`, no dot)
drawio --version

# macOS (full path fallback)
/Applications/draw.io.app/Contents/MacOS/draw.io --version

# Linux
draw.io --version

# Windows
"C:\Program Files\draw.io\draw.io.exe" --version
```

Install from [jgraph/drawio-desktop/releases](https://github.com/jgraph/drawio-desktop/releases) if missing.

### Step 1 — Export preview PNG (no `-e`)

```bash
drawio -x -f png -s 2 -o diagram.png diagram.drawio
```

### Step 2 — Self-check

Use vision (if available) to verify the exported PNG:

| Check                  | What to look for                                         |
| ---------------------- | -------------------------------------------------------- |
| Correct SAP colors     | Blue `#0070F2` for SAP, Grey `#475E75` for non-SAP       |
| Area nesting           | Alternating blue/white fill                              |
| Overlapping shapes     | ≥20px gap between all siblings                           |
| Clipped labels         | Text cut off → increase shape dimensions                 |
| Missing connections    | Disconnected arrows → verify source/target ids           |
| Line style             | Solid=sync, Dashed=async                                 |
| Unrequested components | Products not in the allowlist → remove                   |
| Wrong service order    | Edge order differs from requested sequence → fix         |
| Title collision        | Icon/label touches area title → move below reserved band |
| Raw HTML text          | `<font>` markup visible → fix escaping                   |

Also run: `python3 scripts/validate_diagram.py diagram.drawio --strict-palette`

Max 2 self-check rounds.

### Step 3 — Review loop

Show the preview to the user. Apply targeted XML edits per feedback. Loop until approved. **Safety valve:** after 5 rounds, suggest opening `.drawio` in draw.io desktop for manual fine-tuning.

### Step 4 — Final export (with `-e` for embedded diagram)

```bash
# PNG with embedded diagram XML (editable in draw.io)
drawio -x -f png -e -s 2 -o diagram.drawio.png diagram.drawio

# SVG with embedded diagram
drawio -x -f svg -e -o diagram.drawio.svg diagram.drawio

# PDF
drawio -x -f pdf -o diagram.pdf diagram.drawio
```

Key flags: `-x` export mode · `-f` format · `-e` embed diagram XML · `-s` scale (2 recommended for PNG) · `-o` output path · `-b 10` border.

### Known issue: truncated IEND in `-e` PNGs

draw.io CLI emits `-e` PNGs with an 8-byte truncation at IEND, causing some viewers/APIs to reject the file. Export SVG/PDF is unaffected. If the final PNG won't open, re-export without `-e` for the user-facing image.

### Fallback chain

| Scenario                              | Behavior                                                               |
| ------------------------------------- | ---------------------------------------------------------------------- |
| draw.io CLI missing, Python available | Generate `.drawio` + print a `https://app.diagrams.net/?…` browser URL |
| draw.io CLI missing, Python missing   | Generate `.drawio` XML only; instruct user to open manually            |
| CLI unavailable in sandbox (macOS)    | Use browser fallback; ask user to export in non-sandboxed terminal     |
| Vision unavailable for self-check     | Skip visual verification; proceed to showing user the file             |
| Linux headless export fails           | Try `xvfb-run -a drawio …`; add `--disable-gpu` if EGL errors          |

### WSL2 specifics

```bash
# CLI path on WSL2
"/mnt/c/Program Files/draw.io/draw.io.exe" --version

# Open exported file (convert path first)
cmd.exe /c start "" "$(wslpath -w diagram.drawio.png)"
```
