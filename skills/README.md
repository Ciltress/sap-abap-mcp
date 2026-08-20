# Skills

Agent skills served by this MCP server — as resources under `abap-adt://skills/<collection>/<name>`
and through the `readSkill` tool. Discovery walks each collection's `skills/` directory for
`SKILL.md` files, so adding, editing or removing one needs **no rebuild** — but the result is cached
per process ([`discoverSkills()`](../src/lib/skills.ts)), so a running server keeps serving the old
set until it is **restarted**.

Documented in [`docs/ABAP-Skills.md`](../docs/ABAP-Skills.md) and
[`docs/Development-Skills.md`](../docs/Development-Skills.md).

## Provenance

The two collections are tracked differently, because we treat them differently.

| Collection | Upstream | Tracked as | Skills |
| --- | --- | --- | --- |
| [`ABAP`](ABAP) | [likweitan/abap-skills](https://github.com/likweitan/abap-skills) | **vendored** from `eccc4d0`, maintained here | 20 (18 upstream + `basis` + `abap-analyze-modification`) |
| [`Development`](Development) | [mattpocock/skills](https://github.com/mattpocock/skills) | **git submodule**, pinned at `068b6e0` | 35 |

**ABAP is vendored** because ten of its skills are modified to use this server's tools, so it is ours
now. The upstream history is not preserved; the commit above is recorded for attribution and so a
future diff against upstream is still possible.

**Development is a submodule** because we do not modify it. Upstream stays the source of truth and
updates arrive with one command.

Each collection keeps its upstream `LICENSE`. Both are MIT; the licence text and its copyright notice
must stay with the files.

### Cloning

`skills/Development` is a submodule, so a plain `git clone` leaves it **empty** and the server offers
35 fewer skills. Either clone with submodules:

```bash
git clone --recurse-submodules https://github.com/Ciltress/sap-abap-mcp.git
```

or initialise them afterwards:

```bash
git submodule update --init --recursive
```

### Updating Development

```bash
git submodule update --remote skills/Development   # fetch upstream's latest
git add skills/Development && git commit           # record the new commit
```

Check `docs/Development-Skills.md` afterwards — it lists the skills by name and category, and upstream
adds and renames them.

To compare against upstream later:

```bash
git clone https://github.com/likweitan/abap-skills.git /tmp/abap-skills
diff -ru /tmp/abap-skills/skills skills/ABAP/skills
```

## Local changes

**ABAP** — ten skills use this server's tools rather than assuming there is no live system:

- `abap` and `clean-abap` are **restructured**: the frontmatter description, a "Step 0 — is there a
  system?" branch, the workflow, the output format and the references. Each has a new
  `references/mcp-adt-tools.md` — `abap`'s is workflow-shaped, `clean-abap`'s maps all 15 Clean ABAP
  categories onto what the system can decide versus what stays judgement.
- Eight more carry an appended *Using the ABAP ADT MCP server* section: `abap-sql-amdp`,
  `abap-unit-testing`, `abapgit`, `atc-cloudification`, `cds-view-entities`, `odata`, `rap`,
  `released-abap-classes`.

Plus **`basis`**, written here rather than taken from upstream: operational questions about a running
system, paired with the `listLoggedOnUsers` tool.

**Development** — unmodified.

## What was removed when vendoring ABAP

Only `skills/` and `LICENSE` were kept from that collection. The upstream project scaffolding was
dropped, because it describes *that* project rather than this one:

- **`.github/`** — including a skills-validation workflow and a `FUNDING.yml`. Vendored, these would
  have run, and solicited sponsorship, on this repository.
- `scripts/`, `docs/`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `.claude-plugin/`, `.opencode/`.

No skill referenced anything outside its own directory, so nothing broke — checked before removal.

`Development` keeps its full upstream tree, since a submodule is a separate repository: its
`.github/workflows` belong to *that* repo and GitHub does not run them from here, and its root
`AGENTS.md` / `CLAUDE.md` are upstream's own. Only `skills/Development/skills/` is read by this
server.

## Adding a skill

Add it to **`ABAP`** (or a new collection of your own) — never to `Development`, which is a submodule
whose changes belong upstream and would be lost on the next update.

Create `<collection>/skills/<name>/SKILL.md` with YAML front matter carrying `name` and `description`.
The description is what an agent matches on, so write it as trigger phrases rather than a summary.
Supporting files go beside it and are reachable with `readSkill`'s `file` argument.
