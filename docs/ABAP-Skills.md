# ABAP skills

SAP/ABAP skills bundled under [`skills/ABAP`](../skills/ABAP), from
[github.com/likweitan/abap-skills](https://github.com/likweitan/abap-skills), plus one written here.
Twenty skills covering Clean ABAP, RAP, CDS, ABAP Cloud, ATC, abapGit, OData, authorizations, BTP,
Basis and modification analysis.

The general engineering collection is documented separately in
[`Development-Skills.md`](./Development-Skills.md).

## How to reach them

Every skill is served both as an MCP resource, `abap-adt://skills/abap/<name>`, and through the
`readSkill` tool:

```jsonc
{"tool":"readSkill","args":{}}                          // ~1.3 kB index of both collections
{"tool":"readSkill","args":{"collection":"abap"}}       // ~27 kB, all 20 with descriptions
{"tool":"readSkill","args":{"skill":"rap"}}             // the SKILL.md
{"tool":"readSkill","args":{"skill":"abap","file":"references/CleanABAP.md"}}
```

The ABAP descriptions are long — they are trigger-heavy so the right skill gets matched — so the
collection listing costs ~24 kB. Start with the index.

---

## How these skills relate to this server's tools

The skills came from a repository that assumes **no live system**: code arrives pasted or as
abapGit-serialized files on disk, and the only checker is abaplint. This server changes that premise —
it has an authenticated ADT session, so it can read the code, ask SAP to compile it, and run ATC.

Ten of the eighteen have been updated to use these tools. Two of them — `abap` and `clean-abap`, the
ones a code-quality request actually lands on — were **restructured**, not merely annotated: each
opens with a "Step 0 — is there a system?" branch and carries its own
`references/mcp-adt-tools.md`. The other eight gained a "Using the ABAP ADT MCP server" section
mapping their workflow onto real tools. The gaps that closed:

| The skills assumed | This server provides |
| --- | --- |
| "Read the ABAP code provided by the user" | `readAbapObject` — by name, no URL to discover |
| abaplint as the only syntax check | `syntaxCheckCode` / `syntaxCheckCdsUrl` — the real compiler, which knows the DDIC, the release and the enhancements |
| ATC described but not runnable | `atcCustomizing` → `createAtcRun` → `atcWorklists`, plus the exemption workflow |
| Table structure looked up by hand | `describeAbapTable` — fields, types, key flags, check tables |
| Tests written but not run | `unitTestRun`, `unitTestEvaluation`, `createTestInclude` |
| abapGit driven through the SAP GUI | `gitRepos`, `gitPullRepo`, `stageRepo`, `pushRepo`, `checkRepo`, … |
| Formatting argued about | `prettyPrinter` with the system's own settings |

**abaplint has not been removed.** It is still the right tool with no system, and in CI over serialized
files. The restructured skills branch on availability rather than replacing one approach with the
other, and every Clean ABAP category remains reviewable by hand.

### The division of labour

A Clean ABAP review is two jobs under one name — the *mechanical* half (obsolete statements, unknown
types, line length, whether tests exist) and the *judgement* half (does this name convey meaning, does
this method do one thing). The system is better at the first and has no opinion on the second.

`clean-abap`'s `references/mcp-adt-tools.md` tabulates this for all 15 categories, so a reviewer knows
where to spend attention:

| | Categories |
| --- | --- |
| **Never review by hand** when a system is reachable | Language (ATC knows what is obsolete on *this* release), Formatting (`prettyPrinter`), Testing (`unitTestRun`) |
| **Partly answerable**, depending on the ATC variant | Constants, Variables, Tables, Conditions, Ifs, Methods, Error handling |
| **Almost entirely judgement** | Names, Strings, Booleans, Classes, Comments |

ATC coverage is variant-dependent, so the middle row is "ask ATC and see" rather than a guarantee —
the reference says so explicitly rather than overclaiming.

### Two traps found while verifying this

- **`syntaxCheckCode` with a URL for an object that does not exist returns `[]`** — indistinguishable
  from "clean". The URL is the compilation context, so it must be a real object; use the `sourceUrl`
  from `readAbapObject`. Verified against DEV: a bogus URL reported no findings on code containing
  `THIS IS NOT ABAP AT ALL`, while the same code against a real class URL reported both errors with
  line and offset.
- **The system check variant is not `DEFAULT_REMOTE` everywhere.** On DEV `atcCustomizing` reports
  `systemCheckVariant: DEFAULT`. Read it rather than assuming.

---

## The skills

### Code quality

| Skill | Uses our tools | What it covers |
| --- | --- | --- |
| `abap` | **yes, rewritten** | The entry point for code quality. Now branches on whether a system is reachable: system checks (syntax + ATC) when it is, abaplint when it is not, Clean ABAP review either way. References: `mcp-adt-tools.md` (new), `abaplint.md`, `CleanABAP.md`, `checklist.md`, `quick-reference.md`. |
| `clean-abap` | **yes, restructured** | The Clean ABAP style guide as a review procedure: 15 categories, priority levels, worked examples. Now opens with the same "is there a system?" branch, reads the code with `readAbapObject` instead of asking for a paste, reports system findings above judgement ones, and carries a per-category division of labour. References: `mcp-adt-tools.md` (new), `CleanABAP.md`, `checklist.md`, `quick-reference.md`. Overlaps `abap`; this one is the review, `abap` is the workflow. |
| `atc-cloudification` | yes | ATC check variants for cloud readiness and clean core, using the SAP Cloudification Repository for released APIs. |

### Building things

| Skill | Uses our tools | What it covers |
| --- | --- | --- |
| `rap` | yes | RESTful ABAP: behaviour definitions, EML, managed vs unmanaged, draft, actions, validations, determinations, side effects. Reference: `eml-quick-reference.md`. |
| `rap-business-events` | — | RAP business events, event bindings, Event Mesh, event-driven patterns. |
| `cds-view-entities` | yes | CDS view entities: modelling, annotations, associations, compositions, access control, input parameters. |
| `abap-sql-amdp` | yes | Modern ABAP SQL (window functions, CTEs, expressions) and AMDP procedures, table functions and SQLScript. |
| `odata` | yes | OData V2 and V4 — RAP service bindings, SEGW, annotations, consuming external services, `/IWBEP/` errors. |
| `badi-enhancement` | — | BAdIs and the enhancement framework: definitions, implementations, filters, fallback classes, key-user extensibility. |
| `authorization-iam` | — | Authorization objects, `AUTHORITY-CHECK`, IAM apps, business catalogs and roles, CDS access control (DCL). |

### Testing

| Skill | Uses our tools | What it covers |
| --- | --- | --- |
| `abap-unit-testing` | yes | Test classes, assertions, test doubles, dependency injection, CDS and SQL test environments, RAP BO test doubles. Reference: `test-environment-examples.md`. |

### ABAP Cloud and migration

| Skill | Uses our tools | What it covers |
| --- | --- | --- |
| `abap-cloud` | — | The 3-tier extensibility model, language version restrictions, wrapper patterns for unreleased APIs, clean core. |
| `abap-cloud-migration` | — | Migrating classic custom code to ABAP Cloud: replacements for unreleased APIs, wrapper generation, ATC cloud-readiness. |
| `released-abap-classes` | yes | Finding released ABAP classes by purpose (email, UUID, JSON, HTTP, …). Reference: `Released_ABAP_Classes.md`. |

### Operations

| Skill | Uses our tools | What it covers |
| --- | --- | --- |
| `basis` | **written here** | The running system rather than the repository: who is logged on (`listLoggedOnUsers`), how it is configured (`readProfileParameters`), which authentication it accepts (`checkLogonConfiguration`), system identity via `RFC_SYSTEM_INFO`, short dumps, runtime traces, reachability, and the difference between sessions now (`listLoggedOnUsers`) and users that exist (`systemUsers`). Carries the per-instance caveat, the `rc 4` vs empty-value distinction, the `VCLIENT` / `icm/HTTPS/verify_client` trap, and the two `-32601` traps. |
| `abap-analyze-modification` | **written here** | Modifications to SAP-owned objects: the `SMODILOG` inventory (`runQuery`), the Modification Assistant markers `*{ INSERT` / `*{ REPLACE` / `*\` in the source (`readAbapObject`), the pre-modification baseline (`revisions`), blast radius (`usageReferences`) and SPAU cost. Carries the 30-character `SUB_NAME` padding, the `operation <> 'NOTE'` filter, the `includes/implementations`-is-CCIMP trap, and the `author: "SAP"` rule that decides whether a delta is reconstructible at all. |

### Lifecycle and platform

| Skill | Uses our tools | What it covers |
| --- | --- | --- |
| `abapgit` | yes | abapGit workflows: setup, cloning, serialization, branching, transport-vs-git, CI/CD, `.abapgit.xml`. |
| `btp-abap-environment` | — | BTP ABAP Environment (Steampunk): service instances, ADT connectivity, communication arrangements and scenarios. |
| `btp-diagram-generator` | — | Generates BTP solution architecture diagrams as draw.io files. The largest skill here (~41 kB) and unrelated to ABAP code. |
| `sap-fiori-url-generator` | — | Builds Fiori Launchpad URLs from app names via `AppList.json`. |

The eight marked "—" are advisory: they are knowledge, not procedures this server can execute. They
were left as upstream wrote them. `basis` and `abap-analyze-modification` are not from upstream at
all — both were written for this server: `basis` alongside the `listLoggedOnUsers` tool it uses, and
`abap-analyze-modification` out of a real `SMODILOG` analysis on DEV, with every trap it lists
verified against the live system.

---

## Suggested combinations

- **Review an object properly:** `readSkill{skill:"clean-abap"}` → read its
  `references/mcp-adt-tools.md` → fetch with `readAbapObject`, run `syntaxCheckCode` and ATC, then
  review only the categories the system cannot decide. Use `abap` instead when you also need the
  abaplint path, or are unsure which check applies.
- **Sweep a package:** `searchPackages` for the inventory, then one ATC run with the package as
  `mainUrl` rather than an object at a time.
- **Understand an unfamiliar table:** `describeAbapTable` for keys and check tables, then `runQuery`
  with a `WHERE` clause.
- **Document what was done to SAP standard:** `readSkill{skill:"abap-analyze-modification"}` for the
  three-source method — `SMODILOG` inventory, source markers, version baseline — then `clean-abap` or
  `abap` to judge the code the modification introduced.
- **Test-drive a change:** the `tdd` skill from the Development collection for the loop, and
  `abap-unit-testing` for the ABAP mechanics.

## Local changes and updating

`skills/ABAP` is a clone of the upstream repository and **the ten skills above are modified locally**:

- **Eight** carry an appended "Using the ABAP ADT MCP server" section at the end of the `SKILL.md`.
  Additive and easy to merge.
- **`abap` and `clean-abap` are edited in place** — frontmatter description, workflow, output format
  and references — so a `git pull` is more likely to conflict there.
- **Two new files**: `skills/abap/references/mcp-adt-tools.md` and
  `skills/clean-abap/references/mcp-adt-tools.md`. Untracked upstream, so they will not conflict.

`git -C skills/ABAP diff` shows exactly what diverges. If you want to track upstream cleanly, fork it
and point the clone at your fork.

Discovery is filesystem-based, so a pulled or edited skill needs no rebuild. It is cached per process
though — `discoverSkills()` in [`src/lib/skills.ts`](../src/lib/skills.ts) memoises the walk — so a
**running server must be restarted** before it offers a newly added skill.
