# Calling RFC function modules over the SAP Gateway JSON-RPC service

**Scope:** [`src/handlers/JsonRemoteFunctionCallHandlers.ts`](../src/handlers/JsonRemoteFunctionCallHandlers.ts)
**Audience:** whoever maintains or extends the RFC path.

This is the design and protocol record: *why* the code looks the way it does, what the ABAP server
actually does, and which traps are load-bearing. The user-facing tool reference — arguments, response
shapes, workflows — is [`MCP-Tools.md` §6](./MCP-Tools.md#6-json-rpc--rfc-tools-in-depth).

**State:** complete and verified end to end against DEV/100. Single calls and batches both work over
`/sap/gw/jsonrpc`, through the handler API and through the built server over MCP stdio.

---

## 1. Why this exists

ADT can read and write ABAP code but cannot *execute* it. The SAP Gateway ships a **JSON-RPC 2.0
service** (`SAP_GWFND`, package `/IWBEP/JSON_RPC`, handler `/IWBEP/CL_JSRPC_HTTP_HANDLER`) that
dispatches to RFC-enabled function modules. This handler talks to it over the same SPNEGO/Kerberos
session the rest of the server uses, which closes the gap.

The flow, for every call: **read the function module's interface → build and validate the request from
it → call → unwrap.** Nothing is guessed; the signature comes from the system.

---

## 2. How the SSO session gets there

Three pre-existing steps, none of them specific to JSON-RPC:

1. [`src/index.ts`](../src/index.ts) — `ADTClient` is constructed with the literal placeholder password
   `'unused-sso-placeholder'`, purely to satisfy the constructor's non-empty check. It is never sent.
2. [`src/sso.ts`](../src/sso.ts) `bootstrapSsoSession()` — shells out to
   `C:\Windows\System32\curl.exe --negotiate -u :` against `/sap/bc/adt/compatibility/graph` and
   harvests the `SAP_SESSIONID_*` cookies + `x-csrf-token`.
3. [`src/sso.ts`](../src/sso.ts) `injectSsoSession()` — writes them into the live `AdtHTTP`: the
   private `cookie` Map and the public `csrfToken` setter.

`AdtHTTP.loggedin` is just `csrfToken !== "fetch"`. Setting the token flips it to `true`, which stops
`AdtHTTP.request()` from calling `login()` with the placeholder. Afterwards `_request()` attaches
`Cookie` and `x-csrf-token` to every call automatically — **never set those headers by hand.**

Two traps the handler works around explicitly:

- If `loggedin` is false, `AdtHTTP.request()` Basic-Auths with the placeholder → 401. So the handler
  bootstraps up front.
- The library's own re-login-on-401 is guarded by `!this.isStateful`
  (`node_modules/abap-adt-api/build/AdtHTTP.js`) and `index.ts` sets `stateful` — so the library will
  **never** retry for you here. The handler does its own single re-bootstrap retry.

**Verified:** the CSRF token harvested from the ADT bootstrap is byte-identical to the one
`JSONRPC.INIT` hands out, so the ADT session is accepted by the JSON-RPC node with no extra fetch.
`JSONRPC.INIT` reports the session as `{"STATEFUL":"enabled","VIA":"cookie","TIMEOUT":1800}`.

---

## 3. The protocol, as read from the ABAP source

From the source of `/IWBEP/CL_JSRPC_*` on DEV (dumped via ADT), then confirmed live.

| Fact | Where in the source |
| --- | --- |
| Must be **POST** | `/IWBEP/IF_JSRPC_TRANSPORT~VALIDATE` |
| `Content-Type` must start with `application/json` (checked on the first 16 chars) | same |
| `X-CSRF-Token` required for **every method except `JSONRPC.INIT`** | same, + `VALIDATE_TOKEN` |
| `method` is upper-cased by the server; split on the last dot into `namespace.name`; namespace `RFC` or none → function module | `_PARSER->read_request`, `_PROCESSOR->get_method` |
| **`params` must be a JSON object or null — positional arrays are rejected** (`-32600`) | `_PARSER->read_request`, `WHEN 'params'` |
| Parameter values are read with `CALL TRANSFORMATION id` into a flat structure whose components are the ABAP parameter names | `_FUNCTION->call` + `_UTIL->json_read` |
| `result` is that **same flat structure** serialised back — keyed by **UPPERCASE ABAP parameter names**, **echoing the inputs** alongside the outputs, with no wrapper level | `_FUNCTION->call` + `_UTIL->json_write` + `_WRITER->write_result` |
| A batch (array) request gets an array response; a single request stays an object. Members run **in order, inside one HTTP request** | `_PROCESSOR->process` |
| `S_RFC` is checked on the function group, then the function name | `_FUNCTION->check_authority` |
| The function module must pass the **SLDW whitelist `SAP_JSON_RPC_FUNCTION_MODULES`**, where active | `_FUNCTION->check_whitelist` |

### The silent trap

`CALL TRANSFORMATION id` matches component names **case-sensitively and ignores what it cannot
match — without any error**. A lower-case parameter key is therefore *dropped silently* and the
function module runs with an empty parameter:

```jsonc
// params {"requtext":"lower"} -> no error, but:
{"ECHOTEXT":"", "RESPTEXT":"SAP R/3 Rel. 750 ...", "REQUTEXT":""}
```

This is why `buildParams` normalising names to upper case is load-bearing, not cosmetic. The handler
maps caller keys onto the real ABAP names, so `{requtext: 'x'}` works through the handler.

### A request that actually works

```jsonc
POST /sap/gw/jsonrpc?sap-client=100&sap-language=EN
Content-Type: application/json
// Cookie + x-csrf-token injected by AdtHTTP from the SSO session
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "STFC_CONNECTION",       // = function module name
  "params": { "REQUTEXT": "hello" }  // by-name, UPPERCASE ABAP parameter names
}
```

```jsonc
{"jsonrpc":"2.0","result":{
   "ECHOTEXT":"hello",
   "RESPTEXT":"SAP R/3 Rel. 750   Sysid: DEV ...",
   "REQUTEXT":"hello"          // <- input echoed back
 },"id":1}
```

---

## 4. Where the signature comes from

The first draft read the signature from ADT only. **That does not work reliably**, for two reasons
found during verification:

1. `searchObject(name, 'FUGR/FF')` returns **nothing**. abap-adt-api truncates the type to `FUGR`
   (`node_modules/abap-adt-api/build/api/search.js`), and that filter matches function *groups*, not
   function modules.
2. Even unfiltered, the ADT quick search can be shadowed by a same-named object of another type —
   searching `RFC_SYSTEM_INFO` returns the DDIC structure `TABL/DS`, not the function module.

So the primary source is **`RFC_GET_FUNCTION_INTERFACE` called over JSON-RPC**. That is the very
function module `/IWBEP/CL_JSRPC_FUNCTION->init` uses to build its parameter table, so the signature
cannot disagree with the call that follows, and it reports `OPTIONAL` / `DEFAULT` directly instead of
requiring them to be parsed out of a comment.

| Source | Used when | Gives |
| --- | --- | --- |
| `RFC_GET_FUNCTION_INTERFACE` (JSON-RPC) | always tried first | authoritative parameters, kinds, optional/default, exceptions |
| ADT source `*"` block (`parseFunctionInterface`) | fallback if the above fails | same shape, plus `VALUE`/`REFERENCE` and the typing keyword |

The ADT fallback keeps introspection working when the JSON-RPC node is inactive. `metadataSource` on
the returned object says which one produced the parameters.

`RFC_FUNCTION_SEARCH` supplies the function group, which lets the ADT URI be *constructed*
(`/sap/bc/adt/functions/groups/{group}/fmodules/{name}`) instead of searched for. That enrichment
(group, ADT URIs, description) is best effort and never fails a call.

Signatures are cached per function module for the process lifetime, so a batch that calls the same one
twice reads it once.

### A readable signature is not a callable function module

`RFC_GET_FUNCTION_INTERFACE` reads `RFC_FUNINT` for *any* function module, RFC-enabled or not, so
`readAbapFunctionModule` returns a complete parameter list for things that then fail with `-32601` on
the first call. Confirmed on DEV with `TH_USER_INFO` and the generated `ENQUEUE_E_TABLEE` /
`DEQUEUE_E_TABLEE` — all three returned full signatures, none are callable. `ENQUEUE_READ`, in the
same batch, worked.

To check callability *without* calling, list the owning package with `searchPackages` and read its
**`SRFC` ("RFC Services")** node, which enumerates the package's RFC-enabled function modules. In
`ZTEST` it holds exactly `ZTEST1` and `ZTEST2`, while the package has five
function groups.

### Telling "not RFC-enabled" from "not authorised"

`-32601` covers both, but they can be separated: **`S_RFC` is checked on the function *group*, not the
module.** So if any sibling module in the same group answers, authorisation is not the problem and
`-32601` means the module itself is not RFC-enabled. On DEV, `TH_USER_LIST` works while `TH_USER_INFO`
fails with `-32601` — both in group `THFB`, so `S_RFC` for `THFB` is granted and only the RFC flag
differs. A whole group failing points the other way, at `S_RFC`.

---

## 5. One path for one or many calls

**Why batches exist:** `/IWBEP/CL_JSRPC_PROCESSOR->process` runs the members of an array request in
order, within a single HTTP request and therefore a single ABAP session and LUW. That is the only way
to make an update BAPI and its `BAPI_TRANSACTION_COMMIT` commit the *same* LUW — issued as two separate
calls they land in two LUWs and the BAPI's changes are rolled back instead of committed.

### The LUW property is observed, not inferred

Proven live on DEV/100 with one three-member batch:

```
[ ZTEST_DB_FM (MODUS 'I')   -> INSERTs into ZTEST_DB / ZTEST_DB2 / ZTEST_DB3
, RFC_READ_TABLE on ZTEST_DB     -> returned the row member 1 had just inserted
, BAPI_TRANSACTION_ROLLBACK        -> ROLLBACK WORK
]
```

Two independent findings, each of which requires a shared LUW:

1. **Member 2 read back member 1's uncommitted insert.** A separate database transaction cannot see
   uncommitted rows, so members 1 and 2 ran in the same one.
2. **Member 3's rollback discarded member 1's insert.** Reading `ZLABELHEAD` and `ZLABELTRUCK` again in
   a *separate* request afterwards returned zero rows, so the write had never been committed and the
   rollback reached it.

`ZTEST1` is a good probe because it writes with direct Open SQL rather than
`IN UPDATE TASK`, so its inserts sit in the caller's LUW where a rollback can reach them. The only
residue is a number-range gap (`ZTEST_DB1` / `ZTEST_DB2`), because `NUMBER_GET_NEXT` is deliberately
not transactional.

The corollary: **a rollback or commit sent as a later, separate call cannot reach an earlier one**,
because the earlier request's LUW closed with its implicit commit.

### How it is built

Everything above the transport is count-agnostic:

```
callFunctionViaJsonRpc(name, in, out)  ─┐
                                        ├─> runCalls(specs[])  ─> invokeJsonRpcBatch(requests[])
callFunctionsViaJsonRpc(calls[])       ─┘        │                        │
                                                 │                        └─ 1 request  -> bare object
                                     read signature (cached),             │  n requests -> array
                                     buildParams, resolveOutputParameters └─ parseJsonRpcBody -> 1 reply
                                     for every member, before sending        per request, matched on id
```

Only the wire format branches, because the *server* branches on it: a single request goes out as a bare
JSON object and a batch as an array, which is exactly what `_PROCESSOR->process` distinguishes on when
deciding whether to answer with an object or an array. Keeping the one-request form unchanged means the
single-call behaviour verified first is untouched and the batch is a genuine addition.

Two consequences worth knowing:

- **Validation is all-or-nothing; execution is not.** Every member is validated before anything is
  sent, so a typo in the last member cannot leave the first one applied. Once the request is away, a
  member the *server* rejects does not abort the rest — it comes back as `{"ok":false,"error":{…}}`
  while the others report normally. Confirmed live with a failing `RFC_READ_TABLE` next to a
  succeeding `STFC_CONNECTION`.
- **Replies are matched on `id`, not position**, then re-ordered into the caller's order, so `calls[i]`
  always corresponds to the request at `calls[i]`.

`callFunctionViaJsonRpc` is the same path with one member; it throws the error instead of reporting it,
because with a single member there is nothing else to report.

---

## 6. Public surface

| Export | Purpose |
| --- | --- |
| `readAbapFunctionModule(name)` | interface lookup, cached per FM |
| `callFunctionViaJsonRpc(name, input, output?)` | one call; throws on a JSON-RPC error |
| `callFunctionsViaJsonRpc(calls[])` | 1..n calls in one request/LUW; reports errors per member |
| `checkJsonRpcEndpoint()` | CSRF-exempt `JSONRPC.INIT` probe; **never throws** — `reachable:false` + `problem` is its failure shape |
| `parseFunctionInterface(source)` | pure, exported, unit-tested — parses the generated `*"` block |
| `FmParameter`, `FunctionModuleMetadata`, `JsonRpcCallResult`, `JsonRpcCallSpec`, `JsonRpcBatchEntry`, `JsonRpcBatchResult`, `JsonRpcEndpointStatus`, `FmParameterKind`, `FmMetadataSource` | types |

All four tools are wired into [`src/index.ts`](../src/index.ts): a field, construction with
`() => this.ensureSsoSession()`, and an entry in the `this.handlers` array — which is what `tools/list`
and the router are both built from, so there is no separate `case` list to keep in sync.

`JsonRpcCallResult.raw` / `JsonRpcBatchEntry.raw` always carry the untouched `result` member, so a
wrong `output` mapping stays diagnosable.

### Internal consumer: `describeAbapTable`

`DdicHandlers` uses this path too. ADT has no resource for a database table on NetWeaver 7.50
(`/sap/bc/adt/ddic/tables/...` does not exist and the repository search returns a SAP GUI wrapper URI),
so `describeAbapTable` reads the dictionary with `DDIF_FIELDINFO_GET` over JSON-RPC.

The coupling is deliberately thin: `DdicHandlers` takes an injected `RfcCaller` function rather than a
reference to this handler, so the two stay independent and `DdicHandlers` unit-tests with a stub.
`index.ts` passes an arrow, which also means the construction order of the two handlers does not
matter. **Anything else that needs RFC should be wired the same way.**

---

## 7. Traps worth remembering

- **Lower-case parameter keys are dropped silently** (§3). Always go through the handler, which
  upper-cases and validates against the real signature.
- **A readable signature does not mean a callable function module** (§4).
- **`SYST-LANGU` is `CHAR1`.** Forwarding the two-letter session language (`EN`) to a function module
  parameter typed `SYST-LANGU` fails with `-32602 "Error during deserialization"`. `describeAbapTable`
  omits `LANGU` entirely unless asked, so SAP uses the logon language, and truncates an explicit value
  to one character. Expect the same class of failure for any `CHAR1`/`NUMC` parameter fed a
  longer value.
- **`NUMC` comes back as a string.** `BAPIRET2-NUMBER` arrives as `"001"`, not `1`. Compare as strings.
- **Function module names containing a dot** are rejected client-side: the dispatcher reads a dot as a
  namespace separator. Namespaced names like `/ACME/Z_FOO` are fine.
- **A batch shares a LUW, so a failing member does not roll the others back.** Check `ok` per member.

### Error map

| JSON-RPC error | Meaning |
| --- | --- |
| `-32601` | function module does not exist, is not RFC-enabled, or `S_RFC` denied → `InvalidRequest`. To tell the last two apart, call a sibling in the same function group — `S_RFC` is checked per group |
| `-32600` | malformed request; e.g. `params` sent as an array → `InvalidParams` |
| `-32602` | invalid params, including a value too long for its ABAP type → `InvalidParams` |
| `-31000` + `data.EXCEPTION` | the function module raised a classic ABAP exception. Reported as `Function module 'X' raised exception NAME: MESSAGE.` — an ordinary outcome, not a transport failure |
| HTTP 404 | SICF node inactive or different path → set `SAP_JSONRPC_PATH` |
| HTTP 401 | SSO/Kerberos problem — check `klist` and VPN |
| non-JSON body | usually an ICF HTML error page; the message prints the first 200 chars |

---

## 8. Verification

### Automated, no SAP system needed

`npx tsc --noEmit -p tsconfig.json` is clean and `npx jest` passes. The suites that matter here:

- **`jsonRpcHandlers.test.ts`** — this handler end to end against a fake Gateway node: signature lookup
  and its ADT fallback, request construction (upper-casing, omitted `params`, TABLES, no hand-set
  `Cookie`/`x-csrf-token`), batches (wire format, id matching, per-member failure, up-front
  validation), response handling, the error map, session bootstrap and the single retry, the MCP
  envelope.
- **`parseFunctionInterface.test.ts`** — the generated `*"` block.
- **`handlerContract.test.ts`** — the catalogue-wide contract, which covers these tools too.

### Live against DEV/100

```bash
npm run build
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/live-jsonrpc-check.mjs
```

[`scripts/live-jsonrpc-check.mjs`](../scripts/live-jsonrpc-check.mjs) drives the **built server over
MCP stdio**, as a client would. It needs a Kerberos ticket, and `NODE_TLS_REJECT_UNAUTHORIZED=0` for an
internal CA. Everything it calls is read-only. 10/10 pass:

| Check | Result |
| --- | --- |
| `tools/list` exposes all four JSON-RPC tools | ✓ |
| `checkJsonRpcEndpoint` reaches the SICF node | `reachable:true`, stateful via cookie, timeout 1800 |
| `readAbapFunctionModule` uses the RFC route | `RFC_INTERFACE`, 3 parameters, group `STFC` |
| `callFunctionViaJsonRpc` normalises a lower-case key | `ECHOTEXT` came back filled |
| `RFC_READ_TABLE` — TABLES in and out | 3 rows from `T000` |
| `callFunctionsViaJsonRpc` runs a 2-member batch | both ran, sysid `DEV` |
| batch members come back in the order asked for | `RFC_SYSTEM_INFO,STFC_CONNECTION` |
| a failing batch member stays local | `TABLE_NOT_AVAILABLE` on member 1, member 2 still returned |
| an invalid member rejects the whole batch up front | `InvalidParams`, nothing sent |
| non-protocol output on stdout | **0 lines** |

Additionally, by hand through the MCP client (§5 has the detail):

| Check | Result |
| --- | --- |
| batch members share one LUW | member 2 read member 1's uncommitted insert; member 3's rollback discarded it; nothing persisted |
| a custom Z function module is callable | `ZTEST1` — nested `BAPIRET2` returned as an object, inputs echoed back |

---

## 9. Operating notes

- **SICF.** `/sap/gw/jsonrpc` must be active. It is, on DEV. Override with `SAP_JSONRPC_PATH` if
  aliased. `checkJsonRpcEndpoint` tells an inactive node apart from a CSRF/authorisation problem,
  because `JSONRPC.INIT` is the one method exempt from the CSRF guard.
- **`S_RFC`.** Calling arbitrary RFC-enabled function modules is subject to `S_RFC` on the function
  group. A failure there is a role issue, not a code issue.
- **SLDW whitelist.** `/IWBEP/CL_JSRPC_FUNCTION->check_whitelist` consults
  `SAP_JSON_RPC_FUNCTION_MODULES` (SAP notes 1919573 / 1922712) and raises
  `/IWBEP/CX_JSRPC_FORBIDDEN` on a miss. It is inert on DEV — the check only engages when domain
  `SLDW_ELEMENTS-SLDW_ENAME` has length 255 or 298 — but where it is active, every callable function
  module must be whitelisted. **Expect this to be the first blocker on another system.**
- **Rebuild before testing through the MCP client.** The client entry runs `dist/index.js`, so
  `npm run build` *and* a client reconnect are needed before changes are visible there.
  `scripts/live-jsonrpc-check.mjs` spawns its own server and needs no reconnect.
- **Writes.** A batch makes real writes possible in one LUW. Treat any function module that is not
  demonstrably read-only as a write, and prefer a rollback-terminated batch when probing on a system
  with real data.

---

## 10. History — bugs fixed on the way

- `readAbapFunctionModule` read `(result as any).objectUrl` from search hits. That field does not
  exist — `SearchResult` has `adtcore:uri`. It was always `undefined`, so every lookup threw.
- The `FUGR/FF` search filter returned nothing (§4).
- **`src/lib/logger.ts` wrote `info` and `debug` to stdout** via `console.info`/`console.debug`. This
  server speaks MCP over stdio, where anything on stdout that is not a protocol frame corrupts the
  stream — and `BaseHandler.trackRequest` logs at `info` on *every* request, so this affected every
  tool, not just these. All levels now go to stderr.
- `ToolDefinition` could not express an array property's `items`; widened in `src/types/tools.ts`.
- Double-wrapped tool responses: `index.ts serializeResult()` now passes a result through when it is
  already MCP-shaped (`{content:[…]}`), so clients see exactly one level of JSON.
