# Development skills

General engineering skills at [`skills/Development`](../skills/Development), a **git submodule** of
[github.com/mattpocock/skills](https://github.com/mattpocock/skills) ("Skills For Real Engineers")
— tracked, not copied, because we do not modify them. See [Tracking upstream](#tracking-upstream).
They are language-agnostic — none of them know anything about ABAP — and cover the *process* around
writing code: testing, review, design, debugging, planning, writing.

The ABAP-specific collection is documented separately in [`ABAP-Skills.md`](./ABAP-Skills.md).

## How to reach them

The server serves every skill two ways, both from the files on disk:

- **As an MCP resource**, `abap-adt://skills/development/<name>`, listed by `resources/list`. Use this
  to attach a skill in your client's UI.
- **Through the `readSkill` tool**, which an agent can call by itself. Resources are usually
  user-attached, so this is the route that works mid-task.

```jsonc
{"tool":"readSkill","args":{}}                                  // ~1.3 kB index of both collections
{"tool":"readSkill","args":{"collection":"development"}}        // ~11 kB, all 35 with descriptions
{"tool":"readSkill","args":{"skill":"tdd"}}                     // the SKILL.md
{"tool":"readSkill","args":{"skill":"tdd","file":"mocking.md"}} // a supporting file
```

Reading is a drill-down on purpose: the descriptions are what make a skill findable and they are long,
so listing all 53 skills with theirs costs ~19 kB. Start with the index.

## What is here

**35 skills in 4 categories.** Twenty of them are marked `disable-model-invocation: true` upstream —
meaning they are meant to be *invoked by the user*, not chosen autonomously by an agent. They are
marked **user-invoked** below. The rest an agent may reach for on its own.

Each skill is a directory with a `SKILL.md`; some carry supporting files, listed in the `files` field
of the `readSkill` response and readable with the `file` argument.

### engineering — 18 skills

The core loop: plan, implement, test, review.

| Skill | | What it is for |
| --- | --- | --- |
| `tdd` | | Test-driven development: what a good test is, where tests go, the anti-patterns, and the rules of the red→green loop. Supporting: `tests.md`, `mocking.md`. |
| `code-review` | | Reviews the diff since a fixed point along two axes — **Standards** (does it follow the repo's documented conventions?) and **Spec** (does it do what was asked?) — in parallel sub-agents, reported side by side. |
| `diagnosing-bugs` | | A diagnosis loop for hard bugs and performance regressions. Reach for it when something is broken, throwing or slow rather than guessing at fixes. |
| `codebase-design` | | Vocabulary for designing *deep modules* — narrow interface, substantial implementation. Supporting: `DEEPENING.md`, `DESIGN-IT-TWICE.md`. |
| `domain-modeling` | | Builds and sharpens a project's domain model; writes `CONTEXT.md` and ADRs. Supporting: `ADR-FORMAT.md`, `CONTEXT-FORMAT.md`. |
| `prototype` | | Throwaway prototypes to answer a design question about a state model, logic, or UI. Supporting: `LOGIC.md`, `UI.md`. |
| `research` | | Investigates a question against high-trust primary sources and captures the findings as markdown in the repo. |
| `resolving-merge-conflicts` | | Working through an in-progress merge or rebase conflict. |
| `wizard` | | Generates an interactive bash wizard for steps only a human can do — dashboards, credentials, cutovers. Supporting: `template.sh`. |
| `ask-matt` | user-invoked | A router: asks which skill or flow fits your situation. Supporting: `PHASE-BOUNDARIES.md`. |
| `implement` | user-invoked | Implements a piece of work from a spec or a set of tickets. |
| `to-spec` | user-invoked | Turns the current conversation into a spec on the issue tracker — synthesis, no interview. |
| `to-tickets` | user-invoked | Breaks a plan into tracer-bullet tickets with their blocking edges. |
| `triage` | user-invoked | Moves issues and external PRs through a triage state machine and writes agent-ready briefs. |
| `wayfinder` | user-invoked | Plans work too big for one agent session as a map of decision tickets, resolved one at a time. |
| `grill-with-docs` | user-invoked | A relentless design interview that produces ADRs and a glossary as it goes. |
| `improve-codebase-architecture` | user-invoked | Scans for deepening opportunities and reports them as HTML. Supporting: `HTML-REPORT.md`. |
| `setup-matt-pocock-skills` | user-invoked | One-time setup: issue tracker, triage labels, domain doc layout. **Run before the tracker-based skills above.** |

### productivity — 7 skills

Conversation-shaping rather than code-shaping. All but `writing-for-agents` are user-invoked.

| Skill | | What it is for |
| --- | --- | --- |
| `writing-for-agents` | | Writing documents *for agents* — skills, `AGENTS.md`, `CLAUDE.md`. Relevant to this repo, which has both. Supporting: `SKILL-MECHANICS.md`. |
| `grilling` | | Relentless interviewing to stress-test a plan, decision or idea. Triggered by "grill" phrases. |
| `grill-me` | user-invoked | The same interview, invoked deliberately. |
| `handoff` | user-invoked | Compacts the conversation into a handoff document for another agent. |
| `teach` | user-invoked | Teaches a concept within the workspace. Supporting: glossary, mission, learning-record and resources formats. |
| `to-questionnaire` | user-invoked | Turns a decision you cannot answer into a questionnaire for someone who can. |
| `wait-what` | user-invoked | "That last message did not land — re-pitch it." |

### misc — 4 skills

Setup and migration one-offs, all agent-invokable.

| Skill | What it is for |
| --- | --- |
| `setup-pre-commit` | Husky pre-commit hooks with lint-staged, type checking and tests. |
| `git-guardrails-claude-code` | Claude Code hooks that block destructive git commands (`push`, `reset --hard`, `clean`, `branch -D`) before they run. |
| `migrate-to-shoehorn` | Replaces `as` type assertions in tests with `@total-typescript/shoehorn`. |
| `scaffold-exercises` | Creates exercise directory structures that pass linting. |

### in-progress — 6 skills

Upstream's own work in progress. All user-invoked; treat them as unstable.

`claude-handoff`, `loop-me`, `setup-ts-deep-modules`, `writing-beats`, `writing-fragments`,
`writing-shape`.

## Which of these fit this repository

This server is a TypeScript project with an offline jest suite and a live check against SAP, so the
process skills apply directly:

- **`tdd`** — the suites here follow its shape already: behaviour-level tests against fakes, with the
  live script reserved for what a fake cannot prove.
- **`code-review`** — the Standards axis has something to read: [`AGENTS.md`](../AGENTS.md) documents
  this repo's conventions.
- **`diagnosing-bugs`** — the right tool for the class of bug this project produces, where the failure
  is in SAP's behaviour rather than in the TypeScript.
- **`writing-for-agents`** — [`MCP-Tools.md`](./MCP-Tools.md), [`JSON-RPC.md`](./JSON-RPC.md) and
  `AGENTS.md` are all agent-facing documents, and they are served to clients as resources.
- **`codebase-design`** — the handler split is a deep-module question: `DdicHandlers` taking an
  injected `RfcCaller` rather than a reference to `JsonRemoteFunctionCallHandlers` is exactly the
  seam this skill argues for.

The tracker-based skills (`to-tickets`, `triage`, `wayfinder`, `to-spec`) need
`setup-matt-pocock-skills` run first, since they expect a configured issue tracker.

## Tracking upstream

`skills/Development` is a **git submodule** pinned at
[`068b6e0`](https://github.com/mattpocock/skills), not a copy. That is deliberate: we do not modify
these skills, so upstream stays the source of truth.

Two consequences:

- **A plain `git clone` leaves the directory empty**, and the server then offers 35 fewer skills.
  Clone with `--recurse-submodules`, or run `git submodule update --init --recursive` afterwards.
- **Do not edit these files.** Changes here are changes to someone else's repository: they will not be
  recorded by this project and will be lost on the next update. Contribute upstream, or copy the skill
  into `skills/ABAP` and edit it there. (The ABAP collection *is* vendored, precisely because we do
  modify it.)

To take upstream's latest:

```bash
git submodule update --remote skills/Development
git add skills/Development && git commit
```

Then re-check the tables above — upstream adds, renames and promotes skills out of `in-progress`.

Discovery is filesystem-based and re-runs on every call, so an updated submodule is served
immediately without rebuilding the server.
