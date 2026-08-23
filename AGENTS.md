# AGENTS.md

Guidance for AI agents working **on this repository**. If you are an agent _using_ the running server
to work on ABAP, you want [`docs/MCP-Tools.md`](docs/MCP-Tools.md) instead.

## What this is

An MCP server that gives an agent read/write access to an SAP ABAP system over **ADT**, authenticated
with **SPNEGO/Kerberos SSO**, an **X.509 client certificate** or an **OAuth 2.0 bearer token** — none of
which involves a password (there is a password mode too, as a last resort). It wraps
[`abap-adt-api`](https://github.com/marcellourbani/abap-adt-api) and adds one thing ADT cannot do:
**calling RFC-enabled function modules**, over the SAP Gateway JSON-RPC service.

## Read these first

| Document                                                       | When you need it                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`docs/Tool-Router.md`](docs/Tool-Router.md)**               | Intent to tool, hand-written: "short dump", "where-used", "SE16". The cheapest useful thing to read, and the right first stop when you know the job but not the tool.                                                                                                                                                                                                                                                                                                                    |
| **[`docs/Tool-Reference.md`](docs/Tool-Reference.md)**         | Every tool with its arguments, **generated** from `getTools()` by `npm run docs:tools`. Never edit it by hand.                                                                                                                                                                                                                                                                                                                                                                           |
| **[`docs/MCP-Tools.md`](docs/MCP-Tools.md)**                   | The rules a generator cannot produce: golden-path workflows, ADT URI and lock semantics, the response/error model, a troubleshooting matrix, and the test-suite map. **Start here** for how the server behaves.                                                                                                                                                                                                                                                                          |
| **[`docs/ABAP-Skills.md`](docs/ABAP-Skills.md)**               | The bundled ABAP skills, which of them use these tools, and the two traps found while wiring them up.                                                                                                                                                                                                                                                                                                                                                                                    |
| **[`docs/Development-Skills.md`](docs/Development-Skills.md)** | The bundled general engineering skills, and which fit this repo.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **[`docs/JSON-RPC.md`](docs/JSON-RPC.md)**                     | The design and protocol record for the RFC path: the wire protocol read from `/IWBEP/CL_JSRPC_*`, why a batch shares one LUW, and the traps that bite. Read it before touching `JsonRemoteFunctionCallHandlers.ts` or anything that calls a function module.                                                                                                                                                                                                                             |
| **[`docs/Authentication.md`](docs/Authentication.md)**         | All four logon modes and what SAP needs for each, plus how Streamable HTTP hosting (`ABAP_MCP_TRANSPORT=http`) builds one per-connection session per SAP OAuth token instead of one shared stdio logon, and the three gates in front of it — the origin/host allow-list, the per-session rate limit, and the credential check. Read it before touching `sso.ts`, `certauth.ts`, `oauth.ts`, `passwordauth.ts` or `session.ts`, which is the seam they sit behind — in particular why the placeholder password must never reach SAP, and which failures are latched because retrying them would lock a SAP user. |

They all live in [`docs/`](docs/) and are kept accurate deliberately — treat a contradiction between a
doc and the code as a bug in one of them, and fix it rather than working around it.

**These files are served to clients at runtime**, so they are part of the product, not side notes:
as MCP resources under `abap-adt://guides/…`, and through the `readServerGuide` tool (which an agent
can call by itself — resources are usually user-attached). They are read through
[`src/lib/guides.ts`](src/lib/guides.ts); to add a guide, add one entry to `GUIDES` there and it
appears as both a resource and a tool topic. `guides.test.ts` reads the real files, so moving or
renaming a doc without updating the registry fails the tests.

The skill collections under [`skills/`](skills/) are served the same way, discovered from disk by
[`src/lib/skills.ts`](src/lib/skills.ts) and exposed by `readSkill`. They are tracked differently and
it matters:

- **`skills/ABAP` is vendored** — ordinary files in this repository. Ten of its skills are modified to
  use these tools. Edit freely.
- **`skills/Development` is a git submodule** of `mattpocock/skills`. **Do not edit it**: the changes
  belong to that repository, are not recorded here, and are lost on the next update. Add new skills to
  `skills/ABAP` instead. A plain `git clone` leaves it empty — use `--recurse-submodules`.

## Layout

```
src/
  index.ts                 entry point only: loads .env, builds the server, connects its transport
  server.ts                the MCP server: routes from getTools(), session recovery, serializeResult,
                           stdio vs. Streamable HTTP (ABAP_MCP_TRANSPORT), per-connection OAuth in HTTP mode
  session.ts               which logon this server uses, and the seam its four adapters sit at
  sso.ts                   SPNEGO/Kerberos session bootstrap (curl --negotiate) and injection
  certauth.ts              X.509 client-certificate mode, for users with no Kerberos identity
  oauth.ts                 OAuth 2.0 bearer tokens, for BTP ABAP and systems published via SOAUTH2
  passwordauth.ts          user and password over HTTP Basic - the last resort, and the only one
                           whose failures can lock a SAP user
  reachability.ts          the two-layer ping behind healthcheck, and the startup diagnosis
  handlers/                one class per tool family, all extending BaseHandler
  handlers/BaseHandler.ts  the ToolSpec contract: dispatch, timing, envelope, error mapping
  types/tools.ts           ToolDefinition / ToolProperty — the inputSchema contract
  lib/logger.ts            structured logging; every level goes to stderr
  lib/guides.ts            the guide registry served as MCP resources and by readServerGuide
  lib/profiles.ts          which tools ABAP_MCP_PROFILE lists, and therefore routes
  lib/responseBudget.ts    the ceiling on one answer, enforced in serializeResult
  lib/collectionGate.ts    tools dropped because this system's ADT discovery lacks them
  lib/toolDocs.ts          renders docs/Tool-Reference.md from the tool definitions
  lib/systemIdentity.ts    which SAP system/client this server is bound to, declared and observed
  lib/skills.ts            filesystem discovery of skills/, served as resources and by readSkill
  __tests__/               vitest suites, all offline
skills/ABAP                vendored ABAP skills - ours, edit freely
skills/Development         git submodule of mattpocock/skills - do NOT edit, changes are lost
scripts/live-jsonrpc-check.mjs   end-to-end check against a real system (needs a Kerberos ticket)
scripts/generate-tool-docs.mjs   writes docs/Tool-Reference.md; run after changing any getTools()
```

## Conventions that matter

- **Never write to stdout.** The server speaks MCP over stdio; anything on stdout that is not a
  protocol frame corrupts the stream. Use the logger, which writes to stderr. This has broken every
  tool at once before.
- **A tool returns its payload; `BaseHandler` does everything else.** Each tool is one `ToolSpec` —
  a `ToolDefinition` plus a `run(args)` that returns plain data — and
  [`BaseHandler.handle()`](src/handlers/BaseHandler.ts) owns dispatch, timing, the MCP envelope and
  the error mapping. Do not build `{content:[{type:'text',…}]}` in a handler; `serializeResult()`
  passes the envelope through, so doing it twice nests JSON inside JSON.
  - `status:'success'` is added for you. Return your own `status` to override it (`dropSession`
    does), and return an array to be serialised as-is (the activation tools do).
  - Throw to fail. An `McpError` passes through with its code intact; anything else becomes an
    `InternalError` prefixed with the spec's `onFailure`, keeping SAP's detail when there is one.
  - The envelope is compact, never pretty-printed. Indentation costs response budget and buys a
    model nothing.
- **Adding a tool is a one-file change.** Add a `ToolSpec` to `toolSpecs()`; `getTools()`, the router
  and `tools/list` are all derived from it, so a listed tool is always callable. A tool that belongs
  in a small profile is the exception — name it in [`src/lib/profiles.ts`](src/lib/profiles.ts) too.
- **Every tool declares its `annotations`.** `title`, `readOnlyHint` and `openWorldHint` always;
  `destructiveHint` and `idempotentHint` only when the tool writes, because the specification defines
  them as meaningless otherwise. Omitting them is not neutral: a client then falls back to the
  defaults — not read-only, destructive, open-world — and treats a new search tool like
  `deleteObject`. The conventions each flag follows here are in
  [§2.1.1 of `docs/MCP-Tools.md`](docs/MCP-Tools.md), and `handlerContract.test.ts` fails on a tool
  that has none.
- **Answers have a ceiling, enforced centrally.** `serializeResult()` is the single funnel every
  answer passes through, so [`src/lib/responseBudget.ts`](src/lib/responseBudget.ts) covers a tool
  added tomorrow without being told about it. Over-budget answers are replaced by valid JSON that
  states the original size and the next step — never by a cut-off fragment, which would not parse and
  which a model responds to by retrying the same call. Treat the ceiling as a runaway guard: a tool
  that overruns _routinely_ should grow a real argument (row limit, summary mode) instead, the way
  `adtDiscovery` takes `full`.
- **The system decides what it can serve; ask it, do not hard-code it.** On first use the server
  reads the ADT discovery document once and withholds tools whose collection is absent — 10 `git*`
  and 3 service-binding tools on DEV, which has neither. This runs before `tools/list` answers, so no
  client needs `tools/list_changed`, and it is memoised per process. **Every failure path leaves the
  gate empty and the list complete**: hiding a tool that would have worked is worse than offering one
  that errors, because the first is invisible. `ABAP_MCP_GATE=off` skips the round trip.
- **The profile decides what is listed _and_ what is routed.** `ABAP_MCP_PROFILE` defaults to `all`;
  `core` lists 9 tools instead of 129, which is ~2,700 tokens instead of ~17,800 on every turn for a
  client that cannot fetch schemas on demand. A tool outside the profile is not callable, so `analyst`
  genuinely cannot edit source. Renaming or removing a tool named by a profile fails at **startup**,
  not silently — `applyProfile` throws, and `profiles.test.ts` catches it first.
- **The tool reference is generated; regenerate it.** After changing any `getTools()`, run
  `npm run build && npm run docs:tools`. `toolDocs.test.ts` re-renders and compares against the
  committed file, so a stale reference fails the build instead of shipping a document that lies
  about the code. The **router** ([`docs/Tool-Router.md`](docs/Tool-Router.md)) is the opposite —
  hand-written intent phrases a generator cannot infer. Add a row there when a new tool answers a
  question someone would ask in their own words.
- **Errors must be `McpError`.** A raw `Error` reaching the client becomes an opaque "Internal error".
- **Declare argument types honestly.** An argument the underlying API wants as an object must be
  declared `type: 'object'`, not `'string'`. There is no `optional` marker — omit the name from
  `required`.
- **A status code is not a diagnosis.** 401 and 403 arrive at the same place and mean different
  layers: SAP sends 403 _before_ offering a logon, so no credential was examined and the ticket cannot
  be the cause. Handling them together is how "the ADT ICF node is switched off" was reported as "no
  valid Kerberos ticket, check klist" on two systems for two days. When a message names a cause, the
  code has to have evidence for that cause — [`src/reachability.ts`](src/reachability.ts) gets it by
  pinging `/sap/public/ping` (no logon) and `/sap/bc/ping` (logon) and reading the pair, and
  `healthcheck` and the startup failure path both report what it found.
- **`searchObject`'s two traps are handled in the tool, not in a warning.** It adds a trailing `*`
  when the caller passes no wildcard and upper-cases the query (the repository search is case
  sensitive on older systems), and it never forwards `objType` to abap-adt-api — which truncates it to
  its first segment, so `FUGR/FF` asked for function _groups_. The type filter is applied to
  `adtcore:type` in the handler, with a x10 over-fetch so filtering cannot starve the result set.
  `handlerContract.test.ts` records this as a deliberate exception to argument pass-through.

## Working on this repo

```bash
npm install
npm run build          # tsc -> dist/
npm test               # vitest, fully offline
npx tsc --noEmit       # type check only
```

Before you call something done: `npx tsc --noEmit` clean and `npm test` green. If you changed
anything on the RFC path, also run the live check — it needs a reachable system and a ticket:

```bash
npm run build
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/live-jsonrpc-check.mjs
```

`handlerContract.test.ts` holds every tool to the same contract using arguments generated from its
`inputSchema`, so a new tool is covered as soon as it is listed. If it fails for a legitimate design
decision, encode the exception there with a comment — do not weaken the assertion.

**A green suite does not mean a write path works.** The fake `ADTClient` accepts any order of calls,
so it cannot know SAP's own rules. `editAbapSource` shipped with 16 passing tests and failed on the
first real object twice: it activated while still holding the lock, which SAP refuses with `User
<you> is currently editing <OBJECT>`, and it resolved objects only by name, which cannot find a
freshly created one because the repository search indexes only _active_ objects. Both are invisible
to a fake. **Anything that locks, writes, activates or deletes has to be run against a real system
once** — a throwaway object in `$TMP`, created and deleted in the same session, is enough and costs
nothing. Then encode what you learned as an assertion, so the fake enforces it from then on.

## Testing against the live MCP client

The registered client entry runs `dist/index.js`, so a change is only visible there after
`npm run build` **and** a client reconnect. `scripts/live-jsonrpc-check.mjs` spawns its own server and
needs neither.

## Care with a real SAP system

This server writes. When working against a real system:

- Prefer read-only function modules; treat anything not demonstrably read-only as a write.
- A JSON-RPC **batch shares one LUW**, so a `BAPI_TRANSACTION_ROLLBACK` as the last member undoes the
  earlier ones — that is the safe way to probe a write. A rollback sent as a _separate_ call cannot
  reach the earlier request. See [`docs/JSON-RPC.md` §5](docs/JSON-RPC.md).
- Locks are session-bound: always `unLock` what you `lock`, including after a failure.
- Ask before writing to objects you do not own.
