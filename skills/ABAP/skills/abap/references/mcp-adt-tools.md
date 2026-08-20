# Checking ABAP against a live system (ABAP ADT MCP server)

abaplint is a static analyser that runs over **serialized files** — an abapGit working copy. It is the
right tool in CI, or when there is no system to talk to. But when the ABAP ADT MCP server is connected,
you have the system itself, and the system is authoritative: it knows the DDIC, the enhancements, the
release, and what will actually activate.

**Prefer the system's own checks. Use abaplint when there is no system, or in CI.**

Check which is available before choosing: if the tools below are present, you have a system.

---

## 1. Get the code

You do not need an ADT URL — ask by name.

```jsonc
{"tool":"readAbapObject","args":{"objectName":"ZCL_MY_CLASS"}}
// -> {name, type, package, description, objectUrl, sourceUrl, hasSource, source, includes?}
```

- Works for classes, interfaces, programs, includes, function groups and function modules.
- When a name belongs to several objects it picks the more specific one and reports `ambiguous:true`
  with `alternatives`; pass `objectType` (e.g. `FUGR/FF`) to force the choice.
- Objects with no source — tables, structures, transactions — come back `hasSource:false`. For a table
  use `describeAbapTable`, which returns fields, types, key flags and check tables.
- For a class, `includes` gives the URLs of `definitions`, `implementations`, `macros` and
  `testclasses`; read a test include with `getObjectSource`.

To review a whole area rather than one object:

```jsonc
{"tool":"searchPackages","args":{"patterns":["ZPP_*"],"objectTypes":["CLAS/OC","PROG/P","FUGR/F"]}}
```

## 2. Syntax check — authoritative, and free

```jsonc
{"tool":"syntaxCheckCode","args":{
  "code":"<the full source>",
  "url":"/sap/bc/adt/oo/classes/zcl_my_class/source/main"
}}
// -> [] when clean, else [{uri, line, offset, severity, text}]
```

This compiles the buffer against the real system, so it catches everything abaplint can only guess at:
unknown fields, wrong types, missing interfaces, release restrictions.

> **Trap — a wrong `url` produces a false "clean".** The URL is the compilation context. If it points
> at an object that does not exist, the check returns `[]`, which looks exactly like success. Always
> use the `sourceUrl` that `readAbapObject` gave you, and be suspicious of an empty result on code you
> know to be broken.

For an include, pass `mainProgram` as well — get it from `mainPrograms`. For CDS use
`syntaxCheckCdsUrl`.

## 3. ATC — SAP's own static analysis

ATC is what actually gates a transport, and it enforces the checks your organisation configured, which
is a much stronger statement than a generic lint pass.

```jsonc
{"tool":"atcCustomizing","args":{}}
// -> properties[].systemCheckVariant is the variant to use, e.g. "DEFAULT"

{"tool":"createAtcRun","args":{"variant":"DEFAULT","mainUrl":"/sap/bc/adt/oo/classes/zcl_my_class"}}
// -> {id, timestamp}

{"tool":"atcWorklists","args":{"runResultId":"<id>","timestamp":<timestamp>}}
// -> objects[].findings[] with priority, check title and location
```

- Take the variant from `atcCustomizing` rather than assuming `DEFAULT_REMOTE`; it varies per system.
- `mainUrl` may be a **package**, so one run can cover an entire area.
- Findings carry a priority — report those first.
- A finding that is a false positive can be exempted with `atcExemptProposal` → `atcRequestExemption`;
  both reasons on a stock system (`FPOS`, `OTHR`) require a justification.

## 4. Formatting

Do not hand-argue about indentation — the system has a formatter, configured per system:

```jsonc
{"tool":"prettyPrinterSetting","args":{}}
{"tool":"prettyPrinter","args":{"objectUrl":"…","code":"<source>"}}
```

## 5. Tests

Clean ABAP's Testing section is checkable rather than reviewable:

```jsonc
{"tool":"unitTestRun","args":{"objectUrl":"/sap/bc/adt/oo/classes/zcl_my_class"}}
{"tool":"unitTestEvaluation","args":{"clas":<class from unitTestRun>}}
```

`createTestInclude` adds a test include to a class that has none — which is itself a Clean ABAP
finding worth raising.

---

## Which check answers which Clean ABAP category

| Category | Best check |
| --- | --- |
| Names, Comments, Booleans, Conditions, Ifs, Methods (size, count) | **Clean ABAP review** — judgement, no tool decides these |
| Language (obsolete statements), Tables (`DEFAULT KEY`), Error handling | **ATC** — the system knows what is obsolete on *this* release |
| Anything type- or DDIC-related | **`syntaxCheckCode`** |
| Formatting | **`prettyPrinter`** |
| Testing | **`unitTestRun`** — and whether a test include exists at all |
| Whole-package sweeps | **ATC on a package** `mainUrl`, or `searchPackages` then per object |

## Reporting

Keep the report structure from the skill, but say where each finding came from — a reviewer trusts
"ATC priority 1" and "syntax error at line 7" differently from "this name could be clearer". Findings
from the system carry a location; quote it.

## When there is no system

Fall back to the skill's abaplint workflow (`references/abaplint.md`) plus the Clean ABAP review. The
review sections are unchanged — only the mechanical checks differ.
