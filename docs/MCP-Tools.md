# ABAP ADT MCP Server — Complete Tool Reference

> **Audience:** humans *and* LLM agents driving this server.
> **Source of truth:** the handler classes in [`src/handlers`](../src/handlers) and the router in
> [`src/index.ts`](../src/index.ts). Every schema in this document was dumped from a running server
> (`tools/list`) and every behavioural claim was checked against the `abap-adt-api` type declarations
> or verified live against a real SAP system.

This server is a typed MCP wrapper around [`abap-adt-api`](https://github.com/marcellourbani/abap-adt-api),
a client for **SAP ABAP Development Tools (ADT)** — the HTTP API under `/sap/bc/adt` that Eclipse/ADT
uses. One handler ([`JsonRemoteFunctionCallHandlers`](../src/handlers/JsonRemoteFunctionCallHandlers.ts))
bypasses ADT and talks to the **SAP Gateway JSON-RPC 2.0 service** at `/sap/gw/jsonrpc` to *call
RFC-enabled function modules*.

**129 tools** exist (128 from handlers + `healthcheck`), all names unique, and there are no aliases.
How many a client sees is smaller: the active **profile** decides what is listed, and the server
withholds anything this system's ADT release does not expose. On DEV that is 116 on `all`, 9 on
`core`. See rules 11 and 12 below.

---

## Table of contents

1. [Read this first — the rules that prevent most failures](#1-read-this-first)
2. [Architecture: contract, base handler, routing](#2-architecture)
3. [Cross-cutting concepts (URIs, locks, transports, coordinates, versions)](#3-cross-cutting-concepts)
4. [Golden paths — copy-pasteable workflows](#4-golden-paths)
5. [Tool catalogue — moved to Tool-Router.md and Tool-Reference.md](#5-tool-catalogue)
6. [The JSON-RPC / RFC tools in depth](#6-json-rpc--rfc-tools-in-depth)
7. [Response and error model](#7-response-and-error-model)
8. [Troubleshooting matrix](#8-troubleshooting-matrix)
9. [Behaviour notes, limits and history](#9-behaviour-notes-limits-and-history)
10. [Extending the server](#10-extending-the-server)

---

## 1. Read this first

1. **You never guess a URL — and mostly you never need one.**
   `readAbapObject` takes a plain object *name* and returns the metadata and the source, doing the
   resolution for you. Reach for it first. When you do need a URL, the supported way to get one is
   `searchObject` → `objectStructure` → *main include link*; hand-crafted `/sap/bc/adt/...` paths work
   only for the shapes documented in [§3.1](#31-adt-uris-object-url-vs-source-url).

2. **Arguments are still not schema-validated at the door.** `inputSchema` is now accurate — declared
   types match what the underlying API actually wants, closed value sets carry `enum`, and every
   argument has a description — but the server does not reject a wrong-shaped argument before calling
   the handler. Individual handlers validate what they can and answer with `InvalidParams`.

3. **Writing needs a lock, and the lock needs the same session.** `setObjectSource`, `deleteObject` and
   `createTestInclude` need a `lockHandle` from `lock`. The session is stateful, so the lock survives
   between calls — but `dropSession` or a restart invalidates it.

4. **Changing a non-local object needs a transport.** `transportInfo` lists usable requests;
   `createTransport` makes one. Local (`$TMP`) objects need none. `lock` also reports the request the
   object is already in, in `lock.CORRNR`.

5. **Edited source is inactive until you activate it.** `setObjectSource` → `activateByName`. Check
   **both** `success` and `messages` in the activation result: syntax errors arrive as
   `success:false` plus messages, not as an error.

6. **Line is 1-based, column is 0-based.** ADT encodes positions as `#start=<line>,<column>`. If
   "go to definition" lands one character off, adjust the column, not the line.

7. **Objects go in as objects.** Tools that continue a multi-step flow (`unitTestEvaluation`,
   `fixEdits`, `renamePreview`, `extractMethodPreview`, `pushRepo`, `atcRequestExemption`, …) take the
   **object returned by the previous call**, unchanged. Their schemas say `object`; passing a name
   string will fail.

8. **`debuggerListen` blocks for as long as it takes** — potentially hours. Set breakpoints first and
   use `debuggerDeleteListener` (from another call) to break out.

9. **Read-only vs. outward-facing.** These tools change or publish things: `setObjectSource`,
   `deleteObject`, `activate*`, `createObject`, `createTransport`, `transportRelease`,
   `renameExecute`, `extractMethodExecute`, `gitPullRepo`, `pushRepo`, `publishServiceBinding`,
   `runClass`, `callFunctionViaJsonRpc`, `debuggerSetVariableValue`, `setPrettyPrinterSetting`.
   Everything else is a read.

10. **Never log to stdout.** This server speaks MCP over stdio; `src/lib/logger.ts` writes every level
    to **stderr** for that reason. A stray `console.log` in a handler corrupts the protocol stream for
    all tools.

11. **This catalogue describes every tool; a given server may list fewer.** `ABAP_MCP_PROFILE` selects
    a **profile**, and a tool outside it is not listed *and* not callable — `analyst`, for instance,
    genuinely has no way to edit source. `tools/list` is always the truth about what you can call here;
    `healthcheck` names the active profile and reports `listed` against `available`. If a tool exists
    but is out of profile, the error says so rather than "unknown tool", so there is no point retrying.

    | profile | tools | `tools/list` cost | for |
    | --- | --- | --- | --- |
    | `core` | 9 | ~2,737 tokens | reading a system and completing one edit |
    | `analyst` | 18 | ~3,982 tokens | read-only: dictionary, table data, RFC calls |
    | `dev` | 49 | ~8,034 tokens | the edit cycle plus tests, ATC, transports, refactoring |
    | `all` | 129 | ~17,759 tokens | the default; right for clients that fetch schemas on demand |

    Counts are what `tools/list` returns, `healthcheck` included. `core` is 9 rather than 12 because
    `editAbapSource` replaced the four stepwise write tools there; they remain in `dev` and `all`.

12. **An answer can be withheld for being too large.** Each profile carries a response ceiling — `core`
    24,000 bytes, `analyst` 32,000, `dev` 48,000, `all` none — overridable with
    `ABAP_MCP_MAX_RESPONSE_BYTES`. Over it, you get valid JSON with `status:"truncated"`, the original
    `bytes`, the `budget`, a 2,000-byte `preview` and a `nextStep`; you never get a cut-off fragment.
    **Retrying the identical call will produce the identical refusal** — narrow it instead, with a
    filter, a name or a row limit. `healthcheck` reports the active ceiling as `responseBudgetBytes`,
    and per-handler `maxResponseBytes` shows which tools run large here.

---

## 2. Architecture

### 2.1 The contract — `ToolDefinition`

[`src/types/tools.ts`](../src/types/tools.ts)

```ts
export interface ToolProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  items?: ToolProperty;                       // element schema, for arrays
  properties?: Record<string, ToolProperty>;  // component schemas, for objects
  required?: string[];                        // mandatory components of an object
  enum?: readonly (string | number)[];        // closed value set
  default?: string | number | boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolProperty>;
    required?: string[];   // the only optionality marker — anything not listed is optional
  };
}
```

There is no `optional: true` flag: it was never JSON Schema, and a test now fails if one reappears.
Nested `properties`/`items` mean a structured argument can describe its own shape, which is what the
`flags`, `range`, `config` and `settings` parameters do.

### 2.2 The execution layer — `BaseHandler`

[`src/handlers/BaseHandler.ts`](../src/handlers/BaseHandler.ts)

| Member | What it does |
| --- | --- |
| `adtclient` | The one shared `ADTClient`, created in `index.ts`. |
| `logger` | `createLogger(this.constructor.name)` — **all levels go to stderr**. |
| `trackRequest(startTime, success)` | Counts requests/successes/errors and total time; logs at `info` on every call. |
| `getMetrics()` | `{requestCount, errorCount, successCount, totalTime, averageTime}`. Public, and surfaced per handler by the `healthcheck` tool. |
| `abstract getTools()` | The handler's tools. **Also builds the router** — see below. |
| `abstract handle(name, args)` | Executes one of them. Declared on the base class, so every handler is routable by construction. |

### 2.3 Request lifecycle

[`src/index.ts`](../src/index.ts)

```
tools/list  → handlers.flatMap(getTools()) + healthcheck

tools/call  → healthcheck?  → answer without establishing a session (pings SAP, never logs on)
            → toolRoutes.get(name)         (Map built from getTools(), + aliases)
            → not found?    → McpError MethodNotFound
            → !loggedin?    → ensureSsoSession()      (self-healing SSO)
            → handler.handle(name, args)
            → serializeResult()  (pass-through — handlers already return MCP shape)
            → on throw: handleError() → {content:[…], isError:true}
```

The router is **derived from `getTools()`**, so a tool cannot be listed without being callable. A
duplicate name is refused at startup with a warning on stderr (first handler wins).
`TOOL_ALIASES` in `index.ts` keeps renamed tools callable under their old name without listing them.

### 2.4 Authentication (never Basic)

Four modes, three of them without a password. `resolveAuthMode()` picks one from the environment:
**Kerberos** (the default), an **X.509 client certificate** for a service or technical user that has
no Kerberos identity, an **OAuth 2.0 bearer token** for a BTP ABAP environment or a system published
through `SOAUTH2`, and **password** as a last resort. The heuristics run from the credential that
cannot lock a SAP user to the one that can, so a certificate beats an OAuth client, which beats a
password.

The `ADTClient` is constructed with the literal placeholder password `'unused-sso-placeholder'` purely
to satisfy the constructor's non-empty check (password mode passes the real one instead). **It is
never sent** — which matters for a technical user, where a few Basic Auth attempts with it would lock
the account. The real session comes from one of the four bootstraps:

1. **Kerberos** ([`src/sso.ts`](../src/sso.ts)): `bootstrapSsoSession()` shells out to
   `curl.exe --negotiate -u :` against `/sap/bc/adt/compatibility/graph`, because Node cannot do SPNEGO.
   **Certificate** ([`src/certauth.ts`](../src/certauth.ts)): `bootstrapCertificateSession()` requests
   the same URL directly over an `https.Agent` carrying the certificate — TLS client certificates are
   native to Node.
   **OAuth** ([`src/oauth.ts`](../src/oauth.ts)): a token is fetched from `SAP_OAUTH_TOKEN_URL` and the
   same URL is requested with `Authorization: Bearer …`.
   **Password** ([`src/passwordauth.ts`](../src/passwordauth.ts)): the same URL with a `Basic` header,
   once and only once.
   All four harvest the `SAP_SESSIONID_*` cookies and `x-csrf-token`.
2. `injectSsoSession()` writes them into the live `AdtHTTP`. `AdtHTTP.loggedin` is just
   `csrfToken !== "fetch"`, so this flips the client to "logged in" and stops it from ever Basic-Auth'ing
   with the placeholder.
3. `AdtHTTP` then attaches `Cookie` and `x-csrf-token` to every request itself — **never set those
   headers by hand.**

In certificate mode the same agent is also handed to `ADTClient`, so every ADT and JSON-RPC request
presents the certificate — not just the logon. A port set to `VCLIENT=2` demands one on every
handshake. OAuth and password mode hand theirs over too, so `SAP_CA_FILE` applies to every request
rather than only to the logon.

**The credential is presented once.** After the bootstrap the session cookie carries everything, in
every mode — so an OAuth access token that expires in five minutes is not a problem, and a new one is
minted only when the session itself has to be re-established.

| Variable | Required | Meaning |
| --- | --- | --- |
| `SAP_URL` | ✅ | e.g. `https://sap.example.com:44300` |
| `SAP_USER` | ✅ | SAP logon user (session identity, not a password login). In certificate mode, the user `CERTRULE` maps the certificate to — not transmitted, but reported as the current user |
| `SAP_CLIENT` | recommended | e.g. `100` — sent as `sap-client` |
| `SAP_LANGUAGE` | recommended | e.g. `EN` — sent as `sap-language` |
| `SAP_SYSTEM_ID` | recommended with >1 server | The system id as in `sy-sysid`, e.g. `DEV`. Identification only, never sent — see [§2.6](#26-which-system-this-server-speaks-for) |
| `NODE_TLS_REJECT_UNAUTHORIZED=0` | dev only | self-signed certificates |
| `SSO_CURL_PATH` | optional | override the curl used for the SPNEGO handshake |
| `SAP_JSONRPC_PATH` | optional | override `/sap/gw/jsonrpc` |
| `SAP_AUTH_MODE` | optional | `kerberos` \| `certificate` \| `oauth` \| `password`. A configured `SAP_CERT_FILE`, `SAP_OAUTH_CLIENT_ID` or `SAP_PASSWORD` already selects its mode |
| `SAP_CERT_FILE` | certificate mode | PKCS#12 (`.p12`/`.pfx`) or PEM holding the client certificate |
| `SAP_CERT_PASSPHRASE` | optional | PKCS#12 password / PEM key passphrase (the PSE PIN, for a PSE export) |
| `SAP_CERT_KEY_FILE` | optional | the private key, when it is not in `SAP_CERT_FILE` |
| `SAP_OAUTH_TOKEN_URL` | oauth mode | the token endpoint — `/sap/bc/sec/oauth2/token`, or the BTP service key's `url` plus `/oauth/token` |
| `SAP_OAUTH_CLIENT_ID` | oauth mode | the client registered in `SOAUTH2`, or `clientid` from a service key |
| `SAP_OAUTH_CLIENT_SECRET` | oauth mode | its secret. A refusal is **never retried**: an OAuth client on AS ABAP is a user in `SU01` and locks like one |
| `SAP_OAUTH_GRANT` | optional | `client_credentials` (default) \| `refresh_token` \| `password` \| `static` |
| `SAP_OAUTH_SCOPE`, `SAP_OAUTH_REFRESH_TOKEN`, `SAP_OAUTH_TOKEN`, `SAP_OAUTH_CLIENT_AUTH` | optional | see [`Authentication.md` §11](./Authentication.md) |
| `SAP_PASSWORD` | password mode | the last resort. A wrong one counts against `login/fails_to_user_lock` |
| `SAP_CA_FILE` | optional | CA bundle for verifying SAP's *own* certificate. In oauth mode it is added to the public roots rather than replacing them |

Missing `SAP_URL` or `SAP_USER` makes the constructor throw at startup. So does an unreadable
certificate, a wrong passphrase or an OAuth configuration missing its endpoint — all of it is
resolved eagerly, so a misconfiguration shows up at startup rather than on the first tool call.

Certificate mode is **mutual TLS, not SNC**: ADT is HTTPS, so the `SNC0` ACL plays no part, while the
ICM port needs `VCLIENT` set and the issuing CA needs trusting in `STRUST`. The `CERTRULE` mapping is
shared with an SNC/RFC setup. See [`Authentication.md`](./Authentication.md).

---

### 2.5 The server documents itself

This documentation — and the bundled agent skills — are served by the server, two ways, both reading
the same files:

- **As MCP resources.** `resources/list` offers the guides as `abap-adt://guides/<id>` and every skill
  as `abap-adt://skills/<collection>/<name>`, all `text/markdown`; `resources/read` returns one whole. This is the idiomatic MCP
  primitive, and it is what lets a *user* attach a guide in their client's UI.
- **As the `readServerGuide` tool.** Resources are usually user-attached, so an agent will not discover
  them on its own — but every tool is already in its context. This is therefore the route an agent can
  take by itself, mid-task, when it is unsure which tool to use or why a call failed.

Reading a whole guide is deliberately opt-in: this file alone is ~68 kB. With no arguments the tool
answers with an index of guides and their section headings (~6 kB), and a section is then fetched by
number or title — `{"guide":"tools","section":"4.1"}` costs about 1.5 kB.

The same applies to the skills under [`skills/`](../skills), served by `readSkill`: no arguments lists
the collections and skill names (~1.3 kB), `collection` adds their descriptions, and `skill` returns
the SKILL.md. Skills are **discovered from disk on every call**, so one added or removed shows up
without a rebuild. See [`ABAP-Skills.md`](./ABAP-Skills.md) and
[`Development-Skills.md`](./Development-Skills.md).

Both are wired in [`src/index.ts`](../src/index.ts) and share
[`src/lib/guides.ts`](../src/lib/guides.ts), which owns the registry, the heading parser and the
section extractor. **Adding a guide means adding one entry to `GUIDES`** — it then appears as both a
resource and a tool topic. `guides.test.ts` reads the real files, so a guide that is renamed or moved
without updating the registry fails the build rather than a client.

---

### 2.6 Which system this server speaks for

A server is bound to **one system and one client for its whole life**. `SAP_URL` and `SAP_CLIENT` are
read once, at construction; no tool can switch either. So a landscape means one registered server per
system/client, and something has to route a request between them.

`SAP_SYSTEM_ID` is that something — the system id as in `sy-sysid`, `DEV`. It is never sent to SAP; it
exists to be announced. Three places carry it, for three different consumers:

| Where | Who reads it | When |
| --- | --- | --- |
| MCP `instructions` | the client, at `initialize` | before any call — this is what makes routing possible |
| `healthcheck` → `system` | an agent, on request | any time, without establishing a session |
| stderr at startup | a human reading logs | once |

The instructions say what the server is and, as importantly, what it is not:

> This server is bound to SAP system **DEV**, client 100 (https://…:44301).
> It cannot switch system or client at runtime … If a request names a different system or client, use
> the MCP server configured for that one; if none is registered, say so rather than acting here.

**The declaration is verified against reality.** SAP names the system and client in the session cookie
it sets at logon — `SAP_SESSIONID_DEV_100` — so the true identity arrives with the session at no
cost. `resolveSystemIdentity()` compares the two:

```jsonc
"system": {
  "id": "DEV", "client": "200", "declared": "P01", "observed": "DEV",
  "WARNING": "SAP_SYSTEM_ID says P01 but the session is on DEV. The session is authoritative, so the
              tools act on DEV/200 — but anything routing by the configured name will send work here
              that was meant for somewhere else. Fix the environment of this MCP server."
}
```

Design notes worth keeping:

- **Observed beats declared.** One is a claim, the other is what SAP said. `system.id` is the observed
  value once a session exists.
- **A mismatch warns rather than refusing to start.** The tools are not broken by it — they act on
  whatever system SAP put them on — so the damage is done by *routing*, not by execution. Failing hard
  would also brick a server after a system copy or rename.
- **`instructions` cannot be corrected afterwards.** They are built at construction, before a session
  exists, so a misdeclared server announces the wrong name for its whole life. MCP has no "instructions
  changed" notification. That is exactly why the mismatch is also in `healthcheck` and the startup log.
- **Clients compare numerically**, so `100` and `0100` are not a mismatch. `SAP_CLIENT` is commonly
  written without leading zeros.
- The client check rarely fires, because `SAP_CLIENT` *is* the client logged on to. It earns its keep
  when SAP falls back to `login/system_client` because the requested client does not exist.

---

## 3. Cross-cutting concepts

### 3.1 ADT URIs: object URL vs source URL

| Concept | Looks like | Where it comes from | Used by |
| --- | --- | --- | --- |
| **Object URL** | `/sap/bc/adt/oo/classes/zcl_foo` | `searchObject` → `adtcore:uri` | `objectStructure`, `lock`, `unLock`, `deleteObject`, `revisions`, `usageReferences`, `objectRegistrationInfo`, `findObjectPath`, `activateByName`, `classComponents` |
| **Source URL** (main include) | `/sap/bc/adt/oo/classes/zcl_foo/source/main` | the `text/plain` link inside `objectStructure`'s result | `getObjectSource`, `setObjectSource`, `syntaxCheckCode`, `codeCompletion`, `findDefinition`, `fixProposals`, `unitTestRun`, `transportInfo` |

Common shapes (verify by discovery rather than trusting the pattern):

```
/sap/bc/adt/programs/programs/<name>                       PROG/P
/sap/bc/adt/programs/includes/<name>                       PROG/I
/sap/bc/adt/oo/classes/<name>                              CLAS/OC
/sap/bc/adt/oo/classes/<name>/includes/{definitions|implementations|macros|testclasses|main}
/sap/bc/adt/oo/interfaces/<name>                           INTF/OI
/sap/bc/adt/functions/groups/<group>                       FUGR/F
/sap/bc/adt/functions/groups/<group>/fmodules/<name>       FUGR/FF
/sap/bc/adt/ddic/tables/<name>                             TABL/DT
/sap/bc/adt/ddic/ddl/sources/<name>                        DDLS/DF
/sap/bc/adt/packages/<name>                                DEVC/K
```

Names in ADT URIs are **lower case**, and namespaced names must be URL-encoded
(`/ACME/ZCL_FOO` → `%2facme%2fzcl_foo`).

> **The reliable move:** `searchObject(query)` → pick the hit whose `adtcore:type` matches → 
> `objectStructure(hit['adtcore:uri'])` → read the `text/plain` link for the source URL.
> `classIncludes` does this resolution for you when you give it a bare class name.

### 3.2 Locks

```
lock(objectUrl)                      → { lockHandle, lock: {…} }
   … setObjectSource / deleteObject / createTestInclude …
unLock(objectUrl, lockHandle)
```

- The lock is bound to the **stateful HTTP session**; `dropSession` or a restart drops it.
- The response carries the whole `AdtLock` under `lock`: `CORRNR` (the request the object is already
  in), `CORRUSER`, `CORRTEXT`, `IS_LOCAL`, `MODIFICATION_SUPPORT` — often enough to skip `transportInfo`.
- `accessMode` defaults to ADT's `MODIFY`.
- Always unlock, including on failure paths. A stranded lock blocks the object for other users.

### 3.3 Transports

| Situation | What to do |
| --- | --- |
| Object is local (`$TMP`) | No transport. Omit the parameter. |
| Object is transportable, already in an open request | `lock` → `lock.CORRNR`, or `transportInfo` → `TRANSPORTS[]`. |
| Object is transportable, no request yet | `createTransport(objSourceUrl, REQUEST_TEXT, DEVCLASS)` → returns the new number as a string. |

`transportInfo` returns `DEVCLASS`, `RESULT`, `RECORDING`, `EXISTING_REQ_ONLY`, `TRANSPORTS[]`,
`MESSAGES[]`. Read `RESULT`/`MESSAGES` before assuming success.

### 3.4 Positions (line / column)

ADT encodes a position in the URL fragment: `…/source/main#start=12,4`.

- `line` — **1-based**; `column` — **0-based** character offset within the line.
- `findDefinition` and `renameEvaluate` take `startCol`/`endCol` (`startColumn`/`endColumn`) spanning
  the **whole identifier**, not a single caret position.
- Pass the **exact source text** you are asking about (`source`) — ADT checks what you send, which is
  what makes these tools work on unsaved buffers.

### 3.5 Object versions

`objectStructure(objectUrl, version?)` and `getObjectSource(url, {version})` accept
`"active" | "inactive" | "workingArea"`. Default is active. After writing but before activating, you
need `"inactive"` to read your change back.

### 3.6 Closed value sets

All of these are declared as `enum` in the schemas, so a client can offer them directly.

| Where | Allowed values |
| --- | --- |
| `objectStructure.version`, `getObjectSource.options.version`, `syntaxCheckCode.version` | `active`, `inactive`, `workingArea` |
| `revisions.clsInclude` | `definitions`, `implementations`, `macros`, `testclasses`, `main` |
| `nodeContents.parent_type` | `DEVC/K`, `PROG/P`, `FUGR/F`, `PROG/PI` |
| `packageSearchHelp.type` | `applicationcomponents`, `softwarecomponents`, `transportlayers`, `translationrelevances` |
| `setPrettyPrinterSetting.style` | `toLower`, `toUpper`, `keywordUpper`, `keywordLower`, `keywordAuto`, `none` |
| `debugger*.debuggingMode` | `user`, `terminal` |
| `debugger*.scope` | `external`, `debugger` |
| `debuggerStep.steptype` | `stepInto`, `stepOver`, `stepReturn`, `stepContinue`, `stepRunToLine`, `stepJumpToLine`, `terminateDebuggee` |
| `tracesCreateConfiguration.config.processType` | `HTTP`, `DIALOG`, `RFC`, `BATCH`, `SHARED_OBJECTS_AREA`, `ANY` |
| `tracesCreateConfiguration.config.objectType` | `FUNCTION_MODULE`, `URL`, `TRANSACTION`, `REPORT`, `SHARED_OBJECTS_AREA`, `ANY` |

`unitTestRun.flags` / `unitTestEvaluation.flags` are an object of six booleans:
`{harmless, dangerous, critical, short, medium, long}`.

---

## 4. Golden paths

### 4.1 Read the source of any object

One call, by name — this is the normal way:

```jsonc
{"tool":"readAbapObject","args":{"objectName":"ZCL_MY_CLASS"}}
//  → {name, type, package, description, objectUrl, sourceUrl, hasSource, source, includes?}
```

It resolves the name, picks the object when several types share it (reporting `ambiguous` and
`alternatives`), and returns `hasSource:false` plus a `hint` for objects that have no source, such as
a database table. Pass `objectType` to disambiguate, `includeSource:false` for metadata only.

The long way, when you need the intermediate results:

```jsonc
{"tool":"searchObject","args":{"query":"ZCL_MY_CLASS","max":50}}
//  → results[].{adtcore:name, adtcore:type, adtcore:uri} — pick by adtcore:type

{"tool":"objectStructure","args":{"objectUrl":"/sap/bc/adt/oo/classes/zcl_my_class"}}
//  → structure.links[] — the "text/plain" entry is the source, relative to structure.objectUrl

{"tool":"getObjectSource","args":{"objectSourceUrl":"/sap/bc/adt/oo/classes/zcl_my_class/source/main"}}
```

For a class, `classIncludes` short-cuts the whole dance:

```jsonc
{"tool":"classIncludes","args":{"clas":"ZCL_MY_CLASS"}}
//  → {"definitions":"…", "implementations":"…", "macros":"…", "testclasses":"…", "main":"…/source/main"}
```

### 4.2 Modify and activate source (the full write cycle)

**The short way.** `editAbapSource` does the whole cycle from a name and releases the lock on every
path, including failure — so a failed edit cannot leave the object locked for everyone else. Prefer
it unless you need the steps apart.

```jsonc
// 0. read the current source — you must send the complete new text, there is no patch API
{"tool":"readAbapObject","args":{"objectName":"ZCL_MY_CLASS"}}

// 1. check it compiles before writing it
{"tool":"syntaxCheckCode","args":{"url":"<sourceUrl>","code":"<new source>"}}

// 2. lock, write, activate, unlock — one call
{"tool":"editAbapSource","args":{"objectName":"ZCL_MY_CLASS","source":"<new source>"}}
// → {written, activated, activation:{success,messages}, transport, local, unlocked}
```

Check `activated` and `activation.messages`: a syntax error comes back as `activated:false` with the
messages, not as an error, and the object is then inactive. `activate:false` leaves it inactive on
purpose, for objects that have to go live together. `include:"testclasses"` writes one include of a
class. A transport is only needed when the object is not local and is not already in a request —
the lock reports both, and `editAbapSource` uses what it finds.

**The steps, when you need them apart** — writing several objects under one lock, or interleaving
something between the write and the activation:

```jsonc
// 0. read the current source — you must send the complete new text, there is no patch API
{"tool":"getObjectSource","args":{"objectSourceUrl":"<sourceUrl>"}}

// 1. lock; the result already tells you the transport situation
{"tool":"lock","args":{"objectUrl":"<objectUrl>"}}        // → lockHandle, lock.CORRNR, lock.IS_LOCAL

// 1b. no usable request and the object is not local?
{"tool":"createTransport","args":{"objSourceUrl":"<sourceUrl>","REQUEST_TEXT":"ZCL_MY_CLASS refactor","DEVCLASS":"ZPKG"}}

// 2. syntax-check before writing
{"tool":"syntaxCheckCode","args":{"url":"<sourceUrl>","code":"<new source>"}}   // mainUrl defaults to url

// 3. write
{"tool":"setObjectSource","args":{"objectSourceUrl":"<sourceUrl>","source":"<new source>",
                                  "lockHandle":"<lockHandle>","transport":"DEVK900123"}}

// 4. unlock — BEFORE activating, and always, including after a failed write
{"tool":"unLock","args":{"objectUrl":"<objectUrl>","lockHandle":"<lockHandle>"}}

// 5. activate — check success AND messages
{"tool":"activateByName","args":{"objectName":"ZCL_MY_CLASS","objectUrl":"<objectUrl>"}}
```

**The unlock comes before the activation.** SAP refuses to activate an object its own editor is
still holding and answers `User <you> is currently editing <OBJECT>`. This document used to
prescribe `lock → write → activate → unlock`, which fails at the activation every time; verified on
DEV/100, where the same `activateByName` call succeeded the moment the lock was released.
`editAbapSource` does it in the right order for you.

If activation fails, the object stays inactive; fix the source and repeat. `inactiveObjects` finds
everything left dangling, and its records go straight into `activateObjects`.

### 4.3 Create a new object

```jsonc
{"tool":"validateNewObject","args":{"options":{"objtype":"CLAS/OC","objname":"ZCL_NEW",
                                               "packagename":"ZPKG","description":"My new class"}}}
{"tool":"createObject","args":{"objtype":"CLAS/OC","name":"ZCL_NEW","parentName":"ZPKG",
                               "description":"My new class","parentPath":"/sap/bc/adt/packages/zpkg",
                               "transport":"DEVK900123"}}

// then fill it — by URL, NOT by name
{"tool":"editAbapSource","args":{"objectUrl":"/sap/bc/adt/oo/classes/zcl_new","source":"<source>"}}
```

**Use `objectUrl` here, not `objectName`.** A newly created object is inactive until its first
activation, and the repository search only knows *active* objects — so resolving it by name answers
"No ABAP object named 'ZCL_NEW' was found" even though the object exists and is reachable. The URL
is the one `createObject` was given.

### 4.4 Run ABAP Unit tests

```jsonc
{"tool":"unitTestRun","args":{"url":"<objectUrl or sourceUrl>",
                              "flags":{"harmless":true,"dangerous":false,"critical":false,
                                       "short":true,"medium":true,"long":false}}}
//  → UnitTestClass[] with testmethods[].alerts[]

{"tool":"unitTestEvaluation","args":{"clas": <one element of that array> }}
```

To add a test include first: `lock` → `createTestInclude({clas:"ZCL_MY_CLASS", lockHandle})` → `unLock`.

### 4.5 Run an ATC check

```jsonc
{"tool":"atcCustomizing","args":{}}
{"tool":"atcCheckVariant","args":{"variant":"DEFAULT_REMOTE"}}
{"tool":"createAtcRun","args":{"variant":"DEFAULT_REMOTE","mainUrl":"<objectUrl>","maxResults":100}}
{"tool":"atcWorklists","args":{"runResultId":"<id>","timestamp":<ts>,"includeExempted":false}}
```

Exemptions: `atcExemptProposal(markerId)` → fill in the proposal →
`atcRequestExemption(proposal)`.

### 4.6 Query data

```jsonc
{"tool":"tableContents","args":{"ddicEntityName":"T000","rowNumber":10,"decode":true}}
{"tool":"runQuery","args":{"sqlQuery":"SELECT mandt, mtext FROM t000","rowNumber":50,"decode":true}}
```

Read-only. `tableContents` usually returns one row more than requested.

### 4.7 Call an RFC function module (JSON-RPC)

```jsonc
{"tool":"checkJsonRpcEndpoint","args":{}}
{"tool":"readAbapFunctionModule","args":{"functionModuleName":"STFC_CONNECTION"}}
{"tool":"callFunctionViaJsonRpc","args":{"functionModuleName":"STFC_CONNECTION",
                                         "inputParameters":{"REQUTEXT":"hello"}}}
```

An update BAPI and its commit must go in **one** batch, or the commit runs in its own LUW and the
BAPI's changes are lost:

```jsonc
{"tool":"callFunctionsViaJsonRpc","args":{"calls":[
  {"functionModuleName":"BAPI_USER_LOCK","inputParameters":{"USERNAME":"DEVUSER"}},
  {"functionModuleName":"BAPI_TRANSACTION_COMMIT","inputParameters":{"WAIT":"X"}}
]}}
```

Detail in [§6](#6-json-rpc--rfc-tools-in-depth).

### 4.8 Debug a running program

```jsonc
{"tool":"debuggerSetBreakpoints","args":{"debuggingMode":"user","terminalId":"<guid>","ideId":"<guid>",
   "clientId":"my-client","user":"DEVUSER",
   "breakpoints":["/sap/bc/adt/programs/programs/zfoo/source/main#start=42"]}}
{"tool":"debuggerListen","args":{"debuggingMode":"user","terminalId":"<guid>","ideId":"<guid>","user":"DEVUSER"}}
// ⚠ blocks until a breakpoint is hit
{"tool":"debuggerAttach","args":{"debuggingMode":"user","debuggeeId":"<from listen>","user":"DEVUSER"}}
{"tool":"debuggerStackTrace","args":{"semanticURIs":true}}
{"tool":"debuggerVariables","args":{"parents":["SY","LV_COUNT"]}}
{"tool":"debuggerStep","args":{"steptype":"stepOver"}}
{"tool":"debuggerStep","args":{"steptype":"terminateDebuggee"}}
```

`terminalId` and `ideId` are GUIDs you invent once and reuse — ADT identifies your debugger client by them.

---

### 4.9 Survey packages by naming convention

"Which packages start with `ZPP_` or `Z_PP`, and what is in them?" — one call:

```jsonc
{"tool":"searchPackages","args":{"patterns":["ZPP_*","Z_PP*"]}}
```

```jsonc
{
  "patterns": [
    {"requested":"ZPP_*","pattern":"ZPP_*","matches":100,"truncated":true},
    {"requested":"Z_PP*","pattern":"Z_PP*","matches":3,"truncated":false}
  ],
  "packageCount": 103,
  "packages": [{
    "name": "ZPP_LABEL",
    "uri": "/sap/bc/adt/vit/wb/object_type/devck/object_name/ZPP_LABEL",
    "matchedPatterns": ["ZPP_*"],
    "subPackages": ["ZLABEL_API"],
    "objectCount": 166,
    "objectsByType": {
      "TABL/DT": {"label":"Database Tables","objects":[{"name":"ZLABELHEAD","uri":"…","expandable":false}]},
      "CLAS/OC": {"label":"Classes","objects":[…]},
      "SRFC":    {"label":"RFC Services","objects":[{"name":"ZPP_ADD_LABEL_DATA","uri":"…"}]}
    }
  }]
}
```

Why use this instead of `searchObject` + `nodeContents` yourself:

- **It normalises the pattern**, as `searchObject` now does too; the raw repository search is case sensitive on older
  systems, so `zpp_lab` finds nothing; this tool sends `ZPP_LAB*`. Verified live: `"zpp_lab"` returns
  `ZPP_LABEL`.
- **It merges several patterns** and de-duplicates, reporting `matchedPatterns` per package.
- **`truncated` is explicit.** A capped search is never silently mistaken for a complete answer —
  raise `maxPerPattern` when you see it.
- **A package it cannot expand gets an `error` on its own entry** and the rest still come back.

Cheaper variants:

```jsonc
{"tool":"searchPackages","args":{"patterns":["ZPP_*"],"includeContents":false}}   // names only, 1 call
{"tool":"searchPackages","args":{"patterns":["ZPP_*"],"objectTypes":["CLAS/OC","FUGR/F"]}}
```

> **`SRFC` is the cheap RFC-callability check.** The `SRFC` ("RFC Services") node lists a package's
> **RFC-enabled** function modules, which is otherwise only discoverable by calling one and seeing
> whether it returns `-32601` (see [§6.2](#62-the-tools)). In `ZPP_LABEL` it holds exactly
> `ZPP_ADD_LABEL_DATA` and `ZPP_READ_LABEL_DATA`, while the package has five function groups.

### 4.10 Describe a table

```jsonc
{"tool":"describeAbapTable","args":{"tableName":"T000"}}
```

```jsonc
{
  "name": "T000", "ddObjType": "TRANSP", "kind": "Transparent table",
  "fieldCount": 17, "keyFields": ["MANDT"],
  "fields": [
    {"name":"MANDT","position":1,"key":true,"type":"CLNT","length":3,
     "text":"Client","dataElement":"MANDT","domain":"MANDT"},
    {"name":"MWAER","position":5,"key":false,"type":"CUKY","length":5,
     "text":"Standard Currency in Client","dataElement":"MWAER","checkTable":"TCURC"}
  ]
}
```

- **`checkTable` is the foreign key target** — the cheapest way to see how two tables join.
- `keyFields` is the primary key in order; `MANDT` is the client field on client-dependent tables.
- The `language` argument is the **one-character** SAP language key (`E`, `D`), not the two-letter ISO
  code. `SYST-LANGU` is `CHAR1`, so passing `EN` fails with `-32602`. Omit it to use the logon language.

It runs `DDIF_FIELDINFO_GET` over JSON-RPC, so it needs that node active and `S_RFC` — ADT itself has
no resource for a database table on 7.50. The raw dictionary rows carry ~40 screen-painter columns
each; only the ones that describe the data are kept (`ZLABELHEAD`: ~15 kB raw → ~1.9 kB).

---

### 4.11 Who is on the system

```jsonc
{"tool":"listLoggedOnUsers","args":{}}
{"tool":"listLoggedOnUsers","args":{"currentUserOnly":true,"includeSessions":true}}
{"tool":"listLoggedOnUsers","args":{"client":"100"}}
```

```jsonc
{
  "sessionCount": 81, "userCount": 13,
  "filter": {"user": null, "client": null, "totalBeforeFilter": 81},
  "sourceParameter": "USRLIST",
  "byUser":   [{"user":"SAPJSF_Q67","sessions":19,"clients":["567"],"transactions":[],"hosts":[…]}],
  "byClient": [{"client":"100","sessions":5,"users":["DEVUSER","SMDAGENT_PSM"]}],
  "currentUser": "DEVUSER"
}
```

Four things the response is shaped to prevent you getting wrong:

- **It is one application server, not the system.** `TH_USER_LIST` is the `SM04` view, not `AL08`. On a
  multi-instance system "nobody is logged on" means *nobody on this instance*.
- **`logonType` / `logonState` / `logonProtocol` stay raw.** Their data elements (`UEXT_TYPE`,
  `USTATE`, `UPROTOCOL`) are `INT4` with **no domain**, so the dictionary has no fixed values and any
  label would be invented. Use `transaction` + `guiVersion` (a SAP GUI dialog) or `rfcType` (`I`/`E`)
  instead.
- **`filter.totalBeforeFilter` is always reported**, so a filtered count of zero is not misread as
  "nobody is on".
- **`currentUserOnly` resolves `SAP_USER` for you**, and every response names `currentUser` — so "do I
  have a session" needs no hard-coded name, and this server's own session is identifiable.
- **`sourceParameter` says which TABLES parameter the rows came from.** `TH_USER_LIST` declares `LIST`
  as the non-optional parameter and `USRLIST` as optional, but on 7.50 it fills `USRLIST` and leaves
  `LIST` empty; the tool prefers whichever has rows.

Most sessions are service users (`SAPJSF_*`, `BGRFCSUPER`, `SAPSYS`, monitoring agents), and this
server's own HTTP session is in the list too — separate those from named users before answering "is
anyone using the system".

---

### 4.12 How the system is configured, and how it lets you log on

```jsonc
{"tool":"readProfileParameters","args":{"parameters":["rdisp/max_wprun_time","login/fails_to_user_lock"]}}
{"tool":"checkLogonConfiguration","args":{}}
```

`readProfileParameters` is the RZ11 values from the running instance, via `TH_GET_PARAMETER` (group
`THFB2`), **all in one round trip** however many are asked for. Names are case sensitive.

The response distinguishes two states that look identical from the value alone:

| Reply | `exists` | `isSet` | Meaning |
| --- | --- | --- | --- |
| `rc: 0`, `"2400"` | ✅ | ✅ | Set to that value |
| `rc: 0`, `""` | ✅ | ❌ | Known to the kernel, and empty |
| `rc: 4`, `""` | ❌ | ❌ | **No such parameter** — a typo, or a slot never configured |

Verified on DEV: `icm/server_port_4` answers `rc 0` with no value, `icm/server_port_5` answers `rc 4`.
A parameter that cannot be read carries its own `error` and the rest still come back — though
`NOT_AUTHORIZED` (missing `S_ADMI_FCD`) hits every one at once, so "all failed" means authorisation.

`checkLogonConfiguration` reads the logon-relevant parameters and interprets them:

```jsonc
{
  "instance": {"baseUrl":"https://sapdev…:44301","port":"44301"},
  "certificateLogon": {
    "possibleOnThisPort": true, "port": "44301", "mode": "requested",
    "decidedBy": "VCLIENT=1 on icm/server_port_3",
    "globalVerifyClient": "0", "ruleBasedMapping": true,
    "stillToVerifyManually": ["…STRUST…", "…CERTRULE…"]
  },
  "ports":   [{"parameter":"icm/server_port_3","protocol":"HTTPS","port":"44301",
               "clientCertificates":"requested","matchesSapUrl":true}],
  "methods": [{"method":"X.509 client certificate (HTTPS)","status":"requested on port 44301"}],
  "warnings": []
}
```

- **A per-port `VCLIENT` overrides the global `icm/HTTPS/verify_client`.** This is the trap the tool
  exists for: DEV reports `icm/HTTPS/verify_client = 0`, which reads as "certificates impossible",
  while `icm/server_port_3` carries `VCLIENT=1` and does request one. Quote `decidedBy`, not a raw
  parameter.
- **Only the port in `SAP_URL` matters**, and it is marked `matchesSapUrl`. When nothing matches, the
  tool warns that TLS is probably terminated by a Web Dispatcher or reverse proxy — in which case that
  host, not this instance, decides.
- **`stillToVerifyManually` is not padding.** Whether the issuing CA is trusted (`STRUST`) and whether
  the subject is mapped (`CERTRULE`) are not profile parameters, so no tool can confirm them.
- **SPNEGO/Kerberos is reported as "not determinable"**, because it lives in transaction `SPNEGO`.
  Reporting nothing would read as "unsupported".
- **Nothing read at all ⇒ no findings.** Every conclusion is suppressed, because "no `VCLIENT`" and
  "mapping off" both look true when the reads came back empty.

See [`Authentication.md`](./Authentication.md) for what to do with the answer.

## 5. Tool catalogue

**This section moved, and is now generated.** It used to be 24KB of hand-written tables restating the
names, arguments and descriptions that already live in `getTools()` — two copies of the same facts,
and the copy in prose was the one that went stale.

| What you need | Where |
| --- | --- |
| *Which tool does the job I have?* | [`Tool-Router.md`](./Tool-Router.md) — intent to tool, hand-written. `readServerGuide` id `router` |
| *What arguments does this tool take?* | Its own `inputSchema`, which you already have for every tool you can call |
| *What tools exist, and in which family?* | [`Tool-Reference.md`](./Tool-Reference.md) — generated. `readServerGuide` id `tool-reference`, and it takes a `section`, so ask for one family |

Both are served as MCP resources and through `readServerGuide`. `Tool-Reference.md` is regenerated by
`npm run docs:tools`, and `toolDocs.test.ts` fails the build if the committed file no longer matches
the tool definitions — so it cannot silently lie about the code.

The rest of *this* guide is what a generator cannot produce: the rules in [§1](#1-read-this-first),
the workflows in [§4](#4-golden-paths), the URI and lock semantics in [§3](#3-cross-cutting-concepts),
the RFC protocol in [§6](#6-json-rpc--rfc-tools-in-depth), and the error model in
[§7](#7-response-and-error-model).

## 6. JSON-RPC / RFC tools in depth

[`JsonRemoteFunctionCallHandlers.ts`](../src/handlers/JsonRemoteFunctionCallHandlers.ts) · 4 tools ·
companion design doc: [`JSON-RPC.md`](./JSON-RPC.md)

The only handler that does not go through `abap-adt-api`'s ADT wrappers. It posts JSON-RPC 2.0
envelopes to the SAP Gateway service at `/sap/gw/jsonrpc` (`SAP_GWFND`, handler class
`/IWBEP/CL_JSRPC_HTTP_HANDLER`) over the same SPNEGO/Kerberos session, to **execute RFC-enabled
function modules**. ADT can read and write code but cannot *call* a function module; this closes that gap.

### 6.1 Protocol facts that shape the API

Read from the ABAP source of `/IWBEP/CL_JSRPC_*` and confirmed live:

| Fact | Consequence |
| --- | --- |
| POST only; `Content-Type` must start with `application/json` | Handled internally. |
| `X-CSRF-Token` required for every method except `JSONRPC.INIT` | The ADT SSO token is accepted as-is; `checkJsonRpcEndpoint` is the CSRF-exempt probe. |
| `method` is upper-cased and split on the **last dot** into `namespace.name` | **A function module name containing a dot is rejected client-side.** Namespaced names (`/ACME/Z_FOO`) are fine. |
| `params` must be a JSON **object** or null | Positional arrays are rejected with `-32600`. |
| Values are read with `CALL TRANSFORMATION id` into a flat structure keyed by ABAP parameter names | **Case-sensitive, and unmatched keys are dropped silently.** A lower-case key produces no error and an empty parameter — which is why you should always go through `callFunctionViaJsonRpc`, which upper-cases and validates against the real signature. |
| `result` is that same flat structure serialised back | Keyed by **UPPERCASE** names, and it **echoes the inputs** alongside the outputs. |
| `S_RFC` is checked on the function group, then the name | `-32601` can mean "not authorised" as much as "does not exist". |
| An **array** request is answered with an array; a single request stays an object, and the members of a batch run in order inside one ABAP session | This is what `callFunctionsViaJsonRpc` uses to put a BAPI and its commit in one LUW. |
| The SLDW whitelist `SAP_JSON_RPC_FUNCTION_MODULES` is consulted where active | On such a system every callable FM must be whitelisted — expect this to be the first blocker elsewhere. |

### 6.2 The tools

#### `readAbapFunctionModule`

| Arg | Req | Notes |
| --- | --- | --- |
| `functionModuleName` | ✅ | e.g. `STFC_CONNECTION`. Trimmed and upper-cased; a name with `.` is `InvalidParams`. |

Returns `FunctionModuleMetadata`:

```jsonc
{
  "name": "STFC_CONNECTION",
  "metadataSource": "RFC_INTERFACE",        // or "ADT_SOURCE" when the fallback was used
  "objectUrl": "/sap/bc/adt/functions/groups/srfc/fmodules/stfc_connection",
  "sourceUrl": "…/source/main",
  "functionGroup": "SRFC",
  "description": "…",
  "parameters": [{ "name":"REQUTEXT", "kind":"IMPORTING", "type":"SRFCTEST", "optional":false }],
  "exceptions": ["SYSTEM_FAILURE"]
}
```

- `kind` ∈ `IMPORTING`, `EXPORTING`, `CHANGING`, `TABLES`. **Inputs** you may fill: `IMPORTING`,
  `CHANGING`, `TABLES`. **Outputs** you may request: `EXPORTING`, `CHANGING`, `TABLES`.
- Cached per function module for the process lifetime — restart after changing a signature.
- Two lookup routes: **`RFC_GET_FUNCTION_INTERFACE` over JSON-RPC** (authoritative — the dispatcher
  builds its own parameter table with it), falling back to the **ADT source** `*"` block via
  `parseFunctionInterface()`. The fallback keeps introspection alive when the JSON-RPC node is down,
  but the ADT quick search can be shadowed by a same-named DDIC object. `metadataSource` says which one
  answered; `passing`/`typing` only ever come from the ADT route.
- **A successful lookup does not mean the function module is callable.**
  `RFC_GET_FUNCTION_INTERFACE` reads the signature out of the dictionary (`RFC_FUNINT`) for *any*
  function module, RFC-enabled or not. So `readAbapFunctionModule` happily returns a full parameter
  list for something that then fails with `-32601` on the first call. Observed on DEV with
  `TH_USER_INFO` and with the generated `ENQUEUE_*` / `DEQUEUE_*` modules — all readable, none
  callable. Treat the interface as documentation, not as a capability check. To check callability
  without calling, list the owning package with
  [`searchPackages`](#49-survey-packages-by-naming-convention) and look at its **`SRFC`** ("RFC
  Services") node, which enumerates the RFC-enabled function modules.

#### `callFunctionViaJsonRpc`

| Arg | Req | Notes |
| --- | --- | --- |
| `functionModuleName` | ✅ | As above. |
| `inputParameters` | — (default `{}`) | Object keyed by ABAP parameter name, **matched case-insensitively** and normalised to upper case. `TABLES` parameters take an array of row objects. |
| `outputParameters` | — (default all) | Names to pick out of the result. Empty ⇒ every `EXPORTING`, `CHANGING`, `TABLES` parameter. |

Sequence: read the signature (cached) → `buildParams` (unknown key ⇒ hard error listing the accepted
ones; missing mandatory `IMPORTING` ⇒ hard error) → `resolveOutputParameters` (unknown name ⇒ hard error
listing the available ones) → one POST → `pickOutput` (a name absent from the result is warn-logged and
omitted, not an error).

```jsonc
{
  "functionModule": "STFC_CONNECTION",
  "output": { "ECHOTEXT": "hello", "RESPTEXT": "SAP R/3 Rel. 750 …" },
  "raw":    { "ECHOTEXT": "hello", "RESPTEXT": "…", "REQUTEXT": "hello" }
}
```

`raw` is the untouched `result` — inspect it when `output` looks wrong, since it also echoes the inputs
and therefore proves whether your values arrived.

`RFC_READ_TABLE` (TABLES in *and* out):

```jsonc
{"tool":"callFunctionViaJsonRpc","args":{
  "functionModuleName":"RFC_READ_TABLE",
  "inputParameters":{"QUERY_TABLE":"T000","DELIMITER":"|","ROWCOUNT":5,
                     "FIELDS":[{"FIELDNAME":"MANDT"},{"FIELDNAME":"MTEXT"}]},
  "outputParameters":["DATA","FIELDS"]
}}
```

#### `callFunctionsViaJsonRpc`

| Arg | Req | Notes |
| --- | --- | --- |
| `calls` | ✅ | Array of `{functionModuleName, inputParameters?, outputParameters?}`, executed **in the given order**. Each entry means exactly what it means for `callFunctionViaJsonRpc`. |

**All members run in one HTTP request, therefore in one ABAP session, therefore in one LUW.** That is
what this tool is for. `/IWBEP/CL_JSRPC_PROCESSOR->process` loops the members of a batch inside a
single roll area, so an update BAPI and its `BAPI_TRANSACTION_COMMIT` commit the *same* LUW only when
they travel together. Issued as two separate `callFunctionViaJsonRpc` calls they land in two different
LUWs and the BAPI's changes are rolled back instead of committed.

This is **verified live**, not just derived from the source: in one batch, a member that inserted rows
was read back by the next member (only possible inside the same database transaction), and a third
member's `BAPI_TRANSACTION_ROLLBACK` discarded the insert (only possible inside the same LUW). See
[`JSON-RPC.md` §5](./JSON-RPC.md).

```jsonc
{"tool":"callFunctionsViaJsonRpc","args":{"calls":[
  {"functionModuleName":"BAPI_USER_LOCK","inputParameters":{"USERNAME":"DEVUSER"}},
  {"functionModuleName":"BAPI_TRANSACTION_COMMIT","inputParameters":{"WAIT":"X"}}
]}}
```

```jsonc
{
  "ok": true,                                   // false if any member failed
  "calls": [
    {"functionModule":"BAPI_USER_LOCK",        "ok":true, "output":{"RETURN":[]}, "raw":{…}},
    {"functionModule":"BAPI_TRANSACTION_COMMIT","ok":true, "output":{"RETURN":{"TYPE":"S"}}, "raw":{…}}
  ]
}
```

Two rules that differ from the single-call tool:

- **Validation is all-or-nothing, execution is not.** Every signature is read and every member
  validated *before anything is sent*, so a typo in the last member cannot leave the first one applied
  — that raises `InvalidParams` and nothing runs. Once the request is away, a member that the *server*
  rejects does **not** abort the rest: it comes back as `{"ok":false,"error":{code,message,data}}` while
  the others report normally. Check `ok` per member; do not assume a `-31000` in member 1 stopped
  member 2. Verified live: a failing `RFC_READ_TABLE` and a succeeding `STFC_CONNECTION` in one batch
  both reported their own outcome.
- **Replies are matched on `id`, not position**, then re-ordered into the order you asked for, so
  `calls[i]` always corresponds to your `calls[i]`.

`callFunctionViaJsonRpc` is the same code path with one entry — it just throws the error instead of
reporting it, since with a single member there is nothing else to report.

> **Design decision — one path for one or many calls.** Everything above the transport is
> count-agnostic: `runCalls()` prepares and validates a list of 1..n calls, and `invokeJsonRpcBatch()`
> sends it in one round trip. Only the wire format branches, because the server branches on it: a
> single request goes out as a bare JSON object and a batch as an array, which is exactly what
> `/IWBEP/CL_JSRPC_PROCESSOR->process` distinguishes on when deciding whether to answer with an object
> or an array. Keeping the one-request form unchanged means the single-call behaviour verified against
> DEV/100 is untouched, while the batch is a genuine addition rather than a re-shaping of it.

#### `checkJsonRpcEndpoint`

No arguments. Probes with `JSONRPC.INIT` — the one CSRF-exempt method — so success proves the SICF node
is active and reachable even when a real call is rejected for CSRF or `S_RFC`.

```jsonc
{"path":"/sap/gw/jsonrpc","reachable":true,"endpoint":"…","session":{…}}
{"path":"/sap/gw/jsonrpc","reachable":false,"problem":"…"}
```

It never throws — `reachable:false` plus `problem` is the failure shape.

### 6.3 JSON-RPC error map

| Error | Mapped to | Meaning |
| --- | --- | --- |
| `-32601` | `InvalidRequest` | FM missing, not RFC-enabled, or `S_RFC` denied for its group. |
| `-32600` / `-32602` | `InvalidParams` | Malformed request / invalid params. |
| `-31000` + `data.EXCEPTION` | `InvalidRequest`, as `Function module 'X' raised exception NAME: MESSAGE.` | **A classic ABAP exception — an ordinary outcome, not a transport failure.** |
| HTTP 404 / non-JSON body | `InternalError` with the first 200 chars of the body | SICF node inactive or aliased → set `SAP_JSONRPC_PATH`. |
| HTTP 401 / 403 | retried once after re-running the SSO bootstrap | Kerberos ticket expired — check `klist` and VPN. |

---

## 7. Response and error model

### 7.1 Success

Handlers return the MCP shape directly and `serializeResult()` passes it through, so a client gets **one**
level of JSON:

```jsonc
{ "content": [ { "type": "text", "text": "{\"status\":\"success\",\"result\":{…}}" } ] }
```

Parse `content[0].text` once. (Before this revision that text contained another full envelope; that
double wrapping is gone.)

Payload shape varies by handler — most use `{status:'success', <name>: <data>}` where `<name>` is
`result`, `structure`, `source`, `revisions`, `details`, … The catalogue names it where it matters.

### 7.2 Errors

`handleError()` turns a thrown error into a **non-throwing** tool result:

```jsonc
{ "content":[{"type":"text","text":"{\"error\":\"…\",\"code\":-32602}"}], "isError": true }
```

- `McpError` → its message and code survive.
- Any other error → the **message is kept** (only the code becomes `InternalError`) and the stack is
  logged to stderr. Handlers throw `McpError` throughout, including `QueryHandlers`, so SAP messages
  reach you intact.

Codes you will see: `MethodNotFound` (unknown tool), `InvalidParams` (handler validation),
`InvalidRequest` (semantic rejections), `InternalError` (everything else, including ADT HTTP failures).

### 7.3 Logging

[`src/lib/logger.ts`](../src/lib/logger.ts) writes every level to **stderr**, because stdout is the MCP
protocol channel. `trackRequest` emits an `info` line with timing and cumulative metrics on every call;
the same counters are readable through `healthcheck`.

---

## 8. Troubleshooting matrix

Start with `healthcheck`. Its `reachability` block says which layer answered, and the first three rows
below are the ones it settles — they look identical from a tool call and have nothing in common.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The server does not start at all; the client shows no tools | The logon failed, which exits the process before the transport connects | The startup error on stderr carries the probe: the layer that refused, both endpoint statuses, and the system SAP named. Read that before anything else |
| `healthcheck` → `reachability.layer: "network"` or `"tls"` | Nothing is listening, or SAP's certificate is not trusted here | Host/port in `SAP_URL`, the VPN; for TLS, `SAP_CA_FILE` or `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `healthcheck` → `reachability.layer: "icf"` (403/404, no logon offered) | The ICF node is inactive, or a Web Dispatcher is filtering the path. **No credential was examined** | SICF: activate `/default_host/sap/bc/adt` with its subtree. Eclipse ADT fails identically, which proves it is the system |
| `healthcheck` → `reachability.layer: "logon"` (401) | SAP serves the node and refused the credential | If SAP fell back to `Basic`, the token arrived and was not mapped: user master record in **that client**, SPNEGO/`USREXTID`. Otherwise no token was sent — `klist` |
| HTTP 401 on every call | Kerberos ticket expired / missing | `klist`, re-authenticate, check VPN; the next call re-bootstraps the session by itself |
| HTTP 403 / "CSRF token validation failed" | Stale session | Handled automatically — the server re-establishes and retries once. If it persists, `dropSession` or restart |
| HTTP 403 on *every* call, from the first one | Not a session problem at all — see `reachability.layer: "icf"` above | Do not retry; the node is not being served |
| `Failed to get object structure` | Wrong URL or the object does not exist | Never hand-craft URLs — go via `searchObject` |
| `searchObject` finds nothing you can see in SE80 | The object genuinely is not on this release, or the pattern is too narrow | Case, wildcards and the type filter are all handled by the tool now — check `queryNormalised` in the answer to see what was actually searched |
| `setObjectSource` → "resource is locked" / no lock handle | Missing or stale lock | `lock` again; `dropSession` or a restart invalidates handles |
| Source written but behaviour unchanged | Not activated | `activateByName`, then check `success` **and** `messages` |
| Activation returns `success:false` | Syntax/consistency errors in `messages` | Fix the source; run `syntaxCheckCode` before writing next time |
| `syntaxCheckCode` rejected with `InvalidParams` | `url` missing | Pass the object's source URL; `mainUrl` defaults to it |
| `unitTestEvaluation` fails on a class name | It needs the `UnitTestClass` **object** | Feed it an element of the `unitTestRun` result |
| A Git tool fails on `repo` | It needs the `GitRepo` **object** | `gitRepos` first, pass the object |
| `debuggerListen` never returns | Working as designed — it long-polls | `debuggerDeleteListener` from another call |
| `debuggerSetBreakpoints` "succeeds" but nothing breaks | One entry came back as `DebugBreakpointError` | Inspect every element of the result array |
| `callFunctionViaJsonRpc` → `-32601` | FM missing, not RFC-enabled, or `S_RFC` denied | `readAbapFunctionModule` to confirm it exists, then check `S_RFC` on the group |
| `callFunctionViaJsonRpc` → non-JSON body / 404 | SICF node inactive or aliased | `checkJsonRpcEndpoint`; set `SAP_JSONRPC_PATH`; ask Basis to activate `/sap/gw/jsonrpc` |
| `Unknown tool: X` | The name is not in the catalogue | `tools/list`; the router is derived from it, so anything listed is callable |
| Duplicate-tool warning on stderr at startup | Two handlers declare the same name | Rename one — the second is ignored |
| MCP stream breaks / client reports protocol errors | Something wrote to **stdout** | Never `console.log`; use `this.logger` |
| Generic `Internal server error` | A non-`McpError` escaped a handler | The message is now preserved; the stack is on stderr |

---

## 9. Behaviour notes, limits and history

### 9.1 Corrected in this revision

Every item below was a real defect; each is fixed in code and verified (type-check, vitest, and a live
`tools/list` + `tools/call` round trip against a real system).

| Was | Now |
| --- | --- |
| Responses were wrapped twice — a JSON string inside a JSON string, for all tools | `serializeResult()` passes an MCP-shaped result through; exactly one level |
| `classIncludes` threw `clas.includes is not iterable` for a class name, and would have serialised its `Map` as `{}` | Accepts a name, URL or structure, resolves it, and returns a plain object |
| `syntaxCheckTypes` returned `{}` (a `Map` through `JSON.stringify`) | Returns the real entries |
| `syntaxCheckCode` sent `undefined` into the request URL when `url`/`mainUrl` were omitted, although only `code` was required | `url` is required, `mainUrl` defaults to it, and the error names `syntaxCheckCdsUrl` |
| ~20 parameters declared `string` where the API needs an object/array (`flags`, `clas`, `proposal`, `repo`, `staging`, `settings`, `parameters`, `config`, `range`, `options`, …) | Declared `object`/`array`, with nested `properties`/`items` where the shape is known; a test enforces it |
| 91 uses of the non-JSON-Schema `optional: true` marker | Removed; optionality is `required` only, and a test fails if one returns |
| Closed value sets were free-text strings | `enum` on versions, includes, node types, styles, debug modes/scopes/steps, trace types, package help types |
| Many tools and arguments had one-line or missing descriptions | Every tool has a real description and every argument is described; a test enforces both |
| `createTestInclude` was registered twice (131 listed for 130 unique names) | Registered once, in `UnitTestHandlers`; 130 listed, all unique |
| `adtCompatibiliyGraph` carried an upstream typo | Both names removed with the tool itself; no aliases remain |
| `debuggerSetBreakpoints` exposed `syncScupeUrl` | `syncScopeUrl`, old spelling still accepted |
| `lock` discarded everything but the handle | Returns the whole `AdtLock` under `lock` |
| `activateObjects` demanded a JSON **string** | Takes an array (string still accepted), with clearer validation errors |
| `QueryHandlers` threw plain `Error` → client saw `Internal server error` | Throws `McpError`; and non-`McpError` messages are no longer replaced |
| `BaseHandler.checkRateLimit` was dead code | Removed |
| `getMetrics()` was unreachable | Public, and reported per handler by `healthcheck` |
| A 200-line hand-maintained switch routed calls; a tool could be listed but not callable | The router is built from `getTools()`; duplicates are reported at startup |
| `healthcheck` returned only `{status, timestamp}` | Adds session state, tool counts and per-handler metrics |
| Only `parseFunctionInterface` had tests | A full suite — see [§9.3](#93-test-suites) |

### 9.2 Remaining limits

1. **No argument validation at the door.** The server does not check arguments against `inputSchema`
   before calling a handler; handlers validate what they can.
2. **Tests use fakes, not a SAP system.** Every suite runs offline against a recording stand-in for
   `ADTClient`, so they prove the *wrapper* is correct — argument mapping, envelopes, error
   translation — not that any given ADT endpoint behaves as assumed. Only
   `scripts/live-jsonrpc-check.mjs` talks to a real system, and it covers the JSON-RPC tools alone.
   Behavioural depth beyond the contract exists for the JSON-RPC, package-search and object-access
   tools; the rest have the contract only.
3. **`debuggerListen` blocks**, and there is no cancel tool other than `debuggerDeleteListener` issued
   from a second call.
4. **SSO is Windows/curl-specific.** `bootstrapSsoSession` shells out to `curl.exe --negotiate`
   (override with `SSO_CURL_PATH`).
5. **`remoteRepoInfo` is deprecated upstream** — kept for compatibility, use `gitExternalRepoInfo`.
### 9.3 Test suites

`npm test` runs everything offline — no SAP system, no Kerberos ticket.

| Suite | Covers |
| --- | --- |
| `handlerContract.test.ts` | **Every tool in the catalogue**, four properties each: returns one single-level MCP envelope; reports a backend failure as an `McpError` rather than `status:"success"`; delegates to the ADT client; survives `{}` and `undefined` arguments without a raw `TypeError`. Arguments are generated from each tool's own `inputSchema`, so a new tool is covered the moment it is listed. Plus spot checks pinning argument order for the API calls most likely to be broken by a refactor. |
| `toolDefinitions.test.ts` | The catalogue itself: unique names, routability, descriptions, valid `required`, no `optional` marker, structured argument types. |
| `jsonRpcHandlers.test.ts` | The JSON-RPC handler end to end against a fake SAP Gateway node — see [`JSON-RPC.md` §8](./JSON-RPC.md). |
| `objectAccess.test.ts` | `readAbapObject` resolution, ambiguity and no-source handling; `describeAbapTable` field condensing. |
| `searchPackages.test.ts` | Pattern normalisation, merging, truncation reporting, per-package failure isolation. |
| `parseFunctionInterface.test.ts` | The generated `*"` interface block parser. |
| `systemIdentity.test.ts` | Reading the system id and client out of the session cookie, the declared-vs-observed comparison (including a server pointed at the wrong system), and the `instructions` text. |
| `certauth.test.ts` | Certificate mode: mode resolution, configuration, DN rendering, the TLS error map — and a **real mutual-TLS exchange** against a local HTTPS server configured the way `icm/HTTPS/verify_client = 2` configures the ICM, proving both the logon and the ADT client present the certificate. Its fixtures are generated with `openssl` into a temp directory, so no key material is committed; the block skips where `openssl` is unavailable. |
| `oauth.test.ts` | OAuth 2.0 mode: grant resolution, the token-endpoint error map — in particular which refusals are latched, since an OAuth client on AS ABAP locks like a `SU01` user — and a **live round trip** against a local HTTPS server playing both the token endpoint and SAP, which exercises the form encoding, the `Basic` client authentication, the bearer header, the token cache and the single retry after a revoked token. `openssl` fixtures, same skip as `certauth.test.ts`. |
| `basisHandlers.test.ts` | `listLoggedOnUsers`: the `USRLIST`/`LIST` quirk, filtering, `currentUserOnly` resolving `SAP_USER`. Plus the profile-parameter tools: rc 4 vs an empty value, per-parameter failure isolation, and `VCLIENT` overriding `icm/HTTPS/verify_client` in both directions. |

Two exceptions are encoded explicitly in the contract suite rather than waived, because both are
deliberate design decisions:

- `dropSession` is the only session tool left; `login`/`logout` were removed because the server
  bootstraps and re-establishes its own session, so both only offered a way to break a working one
  `ADTClient` in this fork.
- `checkJsonRpcEndpoint` never throws: `{reachable:false, problem}` **is** its answer, which is what
  makes it able to tell an inactive SICF node apart from a CSRF problem.


---

## 10. Extending the server

Adding a tool to an existing handler is now a **one-file** change:

1. **Add it to `getTools()`** — the router is derived from that list, so no second registration exists
   to forget:

   ```ts
   {
     name: 'myNewTool',
     description: 'One sentence an agent can select on: what it needs, what it returns, what it changes.',
     inputSchema: {
       type: 'object',
       properties: {
         objectUrl: { type: 'string', description: 'ADT object URL from searchObject.' },
         mode:      { type: 'string', description: 'Processing mode.', enum: ['fast', 'full'] },
         payload:   {
           type: 'object',
           description: 'The XyzProposal OBJECT from myOtherTool.',
           properties: { name: { type: 'string' } }
         }
       },
       required: ['objectUrl']
     }
   }
   ```

   Use `object`/`array` whenever the underlying API wants structure, `enum` for closed sets, and give
   every argument a description — `src/__tests__/toolDefinitions.test.ts` fails otherwise.

2. **Add the `case` to that handler's `handle()`** and implement it in the house pattern:

   ```ts
   async handleMyNewTool(args: any): Promise<any> {
     const startTime = performance.now();
     try {
       const result = await this.adtclient.myNewApi(args.objectUrl, args.mode);
       this.trackRequest(startTime, true);
       return { content: [{ type: 'text', text: JSON.stringify({ status: 'success', result }) }] };
     } catch (error: any) {
       this.trackRequest(startTime, false);
       if (error instanceof McpError) throw error;
       throw new McpError(ErrorCode.InternalError, `My new tool failed: ${error.message || 'Unknown error'}`);
     }
   }
   ```

   Watch for APIs that return a `Map` — convert with `Object.fromEntries`, or `JSON.stringify` flattens
   it to `{}`.

A brand-new **handler class** additionally needs: `extends BaseHandler` (which forces `getTools` and
`handle`), an import and field in `index.ts`, and an entry in the `this.handlers` array — that array
drives both `tools/list` and routing. Renaming a tool? Put the old name in `TOOL_ALIASES`.

Then: `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, `npm run build`, and — since there is no
integration coverage — one manual call against a real system. Update this document in the same commit.
