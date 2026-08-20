---
name: abap-analyze-modification
description: Find and document modifications to SAP standard objects in a live system - which SAP objects were changed, by whom, in which transport, what the delta against the SAP original is, and what it costs at the next support package. Use when users ask "what has been modified in this system", "which SAP standard objects did we change", "find all modifications matching a pattern", "document our modifications", "what will show up in SPAU", "is this method modified", "show me the original SAP code", "what did transport X change", "reconstruct the delta", or mention SMODILOG, SPAU, SPDD, the Modification Assistant, modification markers, repairs, or `*{ INSERT` / `*{ REPLACE` / `*\` in ABAP source. This is about changes to SAP-owned objects, not about custom Z code - for reviewing your own code use the abap or clean-abap skills.
license: MIT
---

# Analysing SAP standard modifications

Reconstructing what was done to SAP-owned code in a system, from an ADT session. Three independent
evidence sources, in this order:

| Source | What only it can tell you | Tool |
| --- | --- | --- |
| Table `SMODILOG` | The authoritative **inventory**: every modified object and unit, the operation, user, date, transport | `runQuery` |
| **Modification Assistant markers** in the source | The **line-level delta**, inline, with the transport that made it | `readAbapObject` / `getObjectSource` |
| **ADT version database** | The **pre-modification baseline**, where one exists | `revisions` + `getObjectSource` |

None of them is sufficient alone, and the third is often missing. Say which one an assertion rests on.

---

## Step 1 — the inventory, from `SMODILOG`

`SMODILOG` is the Modification Assistant log. It is the only complete list; source markers miss whole
categories of change, and the version DB misses more.

```jsonc
{"tool":"runQuery","args":{"sqlQuery":"SELECT obj_type, obj_name, sub_type, sub_name, operation, mod_user, mod_date, mod_time, trkorr, spau, active FROM smodilog WHERE obj_name LIKE '/IW%' AND operation <> 'NOTE'","rowNumber":500}}
```

Vary the `WHERE` to the question: `obj_name LIKE 'CL_HTTP%'`, `mod_user = 'DE3190'`,
`trkorr = 'DEVK9A0YSN'`, `mod_date >= '20260101'`. `runQuery` is read-only — the Data Preview service
rejects anything but `SELECT`.

Verified field layout (`describeAbapTable` on DEV): 24 fields, key
`OBJ_TYPE / OBJ_NAME / SUB_TYPE / SUB_NAME / INT_TYPE / INT_NAME / OPERATION`.

### `OPERATION` — the twelve values, from domain `CUS_OPER`

Read them off the system rather than guessing; these are the fixed values on DEV:

| Value | Meaning | Reading |
| --- | --- | --- |
| `MOD` | Modifications to sources | Modification Assistant used — **a line-level delta exists in the source** |
| `NEW` | New unit | Method/unit added to an SAP object |
| `ALL` | Unit overlay | Whole unit replaced **without** assistant delta — the expensive kind |
| `REPA` | Modification without support | A repair. No delta, no SPAU support |
| `NOTE` | Note corrections | **SAP Note implementation, not a customer modification** — filter it out |
| `IMP` | BAdI implementation | Not a modification |
| `PRE` / `POST` | Customer exit at start/end of a unit | Enhancement, not a modification |
| `ORIG` / `TORI` | Reset to original | The modification was **withdrawn** |
| `TRSL` / `MIGR` | Translation entry / matchcode migration | Noise for this purpose |

Two filters do most of the work: `operation <> 'NOTE'` removes SAP Note corrections, which otherwise
dominate any `/IW%`-style query and are not yours. Check for `ORIG` rows before reporting an object as
modified — they mean it was reset.

### Three traps in the result set

1. **`SUB_NAME` is two fields glued together.** For `SUB_TYPE = METH` it is the class name
   **padded with blanks to exactly 30 characters**, followed by the method name. Verified on DEV:

   ```
   /IWBEP/CL_V4_REQUEST_INFO     /IWBEP/IF_V4_REQUEST_INFO~GET_SOURCE_FUNC_IMPORT_NAME
   /IWCOR/CL_DS_URI              HANDLE_RESOURCE_PATH
   /IWBEP/CL_V4_MESSAGE_CONTAINER/IWBEP/IF_V4_MESSAGE_CONTAINER~GET_LEADING_MESSAGE_FOR_USER
   ```

   A 30-character class name leaves **no separating space at all** (third line). So split at offset 30
   — do not split on whitespace, and do not `LIKE '%METHODNAME'` without allowing for the padding.
   For `SUB_TYPE = INTF`, `SUB_NAME` is simply the interface name again.

2. **One unit can appear as several rows.** The same method routinely carries both a `MOD` and a `NEW`
   row for one transport. **Rows ≠ modification units.** Count `DISTINCT obj_name, sub_name` when you
   report a number, and render the operations as a set (`MOD,NEW`).

3. **`MOD_DATE` comes back as an ISO timestamp** (`2026-07-08T00:00:00.000Z`), not as `YYYYMMDD`. The
   time is in `MOD_TIME`. Compare on dates, not on strings.

Useful columns the obvious query omits: `SPAU` / `SPAU_CODE` (adjustment status), `ACTIVE` /
`INACTIVE`, `UPGRADE` (not yet adjusted after an upgrade), `UPG_MODE` (automatic / semi / manual),
`PROT_ONLY` (logged without upgrade support), `MAIN_PROG` and `INCLUDE`.

---

## Step 2 — the transports

`SMODILOG.TRKORR` has a check table of `E070`, so the log joins straight onto the transport system.

```jsonc
{"tool":"runQuery","args":{"sqlQuery":"SELECT t.trkorr, t.trfunction, t.trstatus, t.as4user, t.as4date, x.as4text FROM e070 AS t INNER JOIN e07t AS x ON x~trkorr = t~trkorr WHERE t.trkorr IN ('DEVK9A0YSN','DEVK9A0ZQI') AND x.langu = 'E'"}}
```

`E07T` is verified as three fields — `TRKORR`, `LANGU` (key), `AS4TEXT` (60 chars). Pass the logon
language or you get an empty result rather than an error.

**Sort by date and read the transports as a narrative.** The short texts usually carry the change
number and the intent, and the chronology tells you which transports partly revert earlier ones —
which matters, because a downstream import must replay them **in order**.

This server also has first-class transport tools when the question starts from the transport rather
than from the object:

```jsonc
{"tool":"userTransports","args":{"user":"DE3190"}}
{"tool":"transportReference","args":{"pgmid":"LIMU","obj_wbtype":"METH","obj_name":"…","tr_number":"DEVK9A0YSN"}}
```

---

## Step 3 — the delta, from the markers in the source

The Modification Assistant does not delete SAP code. It comments the original out and brackets the
change. Verified verbatim on DEV, `/IWBEP/CL_V4_MED_OPER_PARAM`:

```abap
  method /IWBEP/IF_V4_MED_ACT_PARAM~IS_COLLECTION.
*{   INSERT         DEVK9A0ZQI                                        1
    rv_is_collection = /iwbep/if_v4_med_act_param_r~is_collection( ).
*}   INSERT
  endmethod.
```

and for a substitution:

```abap
*{   REPLACE        DEVK9A0YSN                                        1
*\      READ TABLE ms_request_info-navigation_path INTO ls_navigation_step INDEX 1.
      READ TABLE ms_request_info-navigation_path INTO ls_navigation_step
        WITH KEY type_kind = /iwbep/if_v4_med_element=>kind_function.
*}   REPLACE
```

The grammar:

| Token | Meaning |
| --- | --- |
| `*{` + keyword + **transport** + sequence no. | Block opens. **The transport number is the join key back to `SMODILOG` and `E07T`.** |
| `*\` | The **SAP original**, now inactive |
| unprefixed line inside the block | **Customer code**, active |
| `*}` + keyword | Block closes |
| `INSERT` / `REPLACE` / `DELETE` | Pure addition · substitution · SAP code switched off |

Fetch the source by name — no URL construction, and namespaced names resolve directly:

```jsonc
{"tool":"readAbapObject","args":{"objectName":"/IWBEP/CL_V4_MED_OPER_PARAM"}}
```

Then search the returned text for `*{`, `*}` and `*\`.

### The include trap — this one will cost you an afternoon

For a class, **the method bodies with the markers are in `source/main`**, which is what
`readAbapObject` returns. The ADT paths `includes/definitions`, `includes/implementations`,
`includes/macros` and `includes/testclasses` are the **local-types sections** (CCDEF, CCIMP, CCMAC,
CCAU) — not the class implementation. Verified: `…/%2fiwbep%2fcl_v4_med_oper_param/includes/implementations`
returns nothing but the three-line generated comment, while `…/source/main` carries all eleven marker
blocks.

Read the local includes as well — SMODILOG does log modifications to them, and `CCMAC` in particular
shows up — but never mistake them for the class body.

```jsonc
{"tool":"getObjectSource","args":{"objectSourceUrl":"/sap/bc/adt/oo/classes/%2fiwbep%2fcl_v4_med_oper_param/includes/macros"}}
```

`readAbapObject` returns every include URL under `object.includes`, so take them from there rather
than assembling them. Namespaced names are URL-escaped (`/` → `%2f`) and lower-cased in ADT URLs.

### Two ways to misread a marker

- **`*` at the start of a line is an ordinary ABAP comment.** Only `*\` **inside** a `*{`…`*}` block
  is inactive SAP original. `/IWBEP/CL_V4_MED_OPER_PARAM` contains four `OBS_*` methods full of
  commented-out code with an explanatory header — that is SAP's own dead code, not a modification, and
  a naive "find commented-out code" sweep will report it as one.
- **Source is CRLF.** Split on `\r\n`; a `\n`-only split leaves a trailing `\r` on every line and
  breaks anchored patterns like `/^\*\\/`.

A weak corroborating hint, not proof: methods the Modification Assistant has rewritten tend to come
back with lowercase `method` / `endmethod`, while untouched SAP methods keep uppercase
`METHOD` / `ENDMETHOD`. Held for every modified method in the verified sample. Use it to spot
candidates, then confirm against `SMODILOG`.

### What the markers cannot show you

`OPERATION = ALL` changes carry **no markers** — whole-unit overlays, interfaces and class declaration
sections. If `SMODILOG` lists a unit and the source has no marker for it, that is expected, not a
missing read. Go to step 4.

---

## Step 4 — the baseline, from the version database

```jsonc
{"tool":"revisions","args":{"objectUrl":"/sap/bc/adt/oo/interfaces/%2fiwcor%2fif_od_proc_prim"}}
{"tool":"revisions","args":{"objectUrl":"/sap/bc/adt/oo/classes/%2fiwbep%2fcl_v4_message_container","clsInclude":"implementations"}}
```

Each revision carries `uri`, `version`, `versionTitle`, `date` and `author`. Pass the `uri` straight
to `getObjectSource` to read that version, then diff it against the active source.

**The rule that decides whether a delta is reconstructible at all:**

> A revision with `author: "SAP"` is the SAP baseline. **If no revision has `author: "SAP"`, there is
> no baseline in this system** and the delta cannot be reconstructed — only the current state
> described, plus the inferred intent. Say so explicitly.

Verified both ways on DEV:

- `/IWBEP/CL_V4_MESSAGE_CONTAINER` → one revision, `author: "SAP"`, `2015-11-20` — the SP delivery.
  Exact diff possible.
- `/IWCOR/IF_OD_PROC_PRIM` → three revisions, **all** `author: "DE3190"`. The oldest already contains
  the customer's `IT_BOUND_FUNCTION_PATH` parameter. No baseline; anything called "the SAP original"
  here would be invented.

Three more things the revision list does, that will mislead you otherwise:

1. **It is not sorted, and some entries have an empty `date` and `author`.** Order by `date` and drop
   the undated entries — they cannot be placed.
2. **The timestamp in the URI is not the version's timestamp.** All three
   `/IWCOR/IF_OD_PROC_PRIM` revisions share `versions/20260611065246/`, differing only in the counter
   (`00000` oldest → `00002` newest). Read `date`, never the URI.
3. **`version` and `versionTitle` give you the transport and its text for free** — e.g.
   `DEVK9A0YSM` / `GS:S:0017:W:CHG0000000:Example change description`. That is a second, independent
   route to the change number, and it costs no extra call.

Normalise whitespace before diffing. Version content has been reported to come back with doubled blank
lines; on DEV via `getObjectSource` it came back with ordinary CRLF. Either way, do not let whitespace
manufacture a phantom delta.

---

## Step 5 — blast radius

A modification to a released SAP object is system-wide. Two questions decide how much it matters:

```jsonc
{"tool":"usageReferences","args":{"url":"/sap/bc/adt/oo/interfaces/%2fiwcor%2fif_od_proc_prim"}}
{"tool":"usageReferences","args":{"url":"…","line":42,"column":10}}
```

Without `line`/`column` this reports usages of the whole object; with them, of the symbol at that
position — which is how you find out whether a changed method signature is called anywhere else.

For "who actually consumes this", query the application's own registry rather than guessing — e.g. the
OData V4 service list:

```jsonc
{"tool":"runQuery","args":{"sqlQuery":"SELECT service_id, service_version, mpc_name, dpc_name, created_by FROM \"/IWBEP/I_V4_MSRV\""}}
```

Then read the modified code with `readAbapObject` and judge it. **A signature change on a released SAP
interface is the worst case**: no future SAP version of that interface can be merged with a Z-typed
signature, so it is a permanent manual adjustment rather than a mergeable one.

---

## Step 6 — cost at the next support package

Every `SMODILOG` entry reappears in **SPAU** whenever a support package or SAP Note ships a new version
of that object. Classify the inventory by what SPAU will be able to do with it:

| Effort | Which entries | Why |
| --- | --- | --- |
| **None — reset** | Blocks with no functional delta | Reset to original, the modification is gone |
| **Low — auto-merge** | `MOD` / `NEW` with marker blocks | The line-level delta is known to SAP |
| **High — manual** | `OPERATION = ALL`, and `REPA` repairs | No stored delta; SPAU offers only "keep / reset" |
| **Very high — design conflict** | Changed signatures on released SAP interfaces | Cannot be merged at all |

Flag "flagged but empty" modifications specifically: a `SMODILOG` entry whose marker block turns out to
contain code identical to the original still costs an SPAU decision at every SP, forever, for nothing.
They are the cheapest thing to clean up and worth listing separately.

---

## Reporting

Write the inventory before the prose. A useful report has, in this order:

1. **Header facts** — system and client, software component and SP level, the change/ticket number,
   the developer, the period, and the counts (`objects`, `modification units`, `marker blocks`).
   Counts must say what they count: rows, distinct units and marker blocks are three different
   numbers and only distinct units matches "how many things were changed".
2. **Transport history**, chronological, with the short text from `E07T`.
3. **Per-object catalogue** — where (object → unit), why (the standard restriction that was lifted),
   what (the concrete delta), with the transport as evidence.
4. **What is *not* covered** — objects that surfaced in the query and were excluded, with the reason
   (`OPERATION = NOTE`, different application area, reset to original). A reader must be able to tell
   "not modified" from "not looked at".
5. **The reconstruction limits, prominently.** Which entries have an exact diff, and which are current
   state plus inferred intent because no SAP baseline exists. Never present the second kind as a diff.
6. **SPAU impact and clean-up candidates.**

Tag every claim with its source: `SMODILOG`, a marker block with its transport, or a version-DB diff.
An assertion that fits none of the three is an inference — mark it as one.

> Analysis is read-only. `runQuery`, `readAbapObject`, `getObjectSource`, `revisions` and
> `usageReferences` change nothing. Do not `lock`, `setObjectSource` or `activateObjects` while
> documenting, and never "clean up" a modification you were asked to describe.

---

## Tool map

The whole workflow, against the raw ADT/SQL calls it replaces:

| Step | Tool | Replaces |
| --- | --- | --- |
| Inventory | `runQuery` on `SMODILOG` | SE16 / open SQL console |
| Field layout of an unfamiliar table | `describeAbapTable` | SE11 |
| Domain fixed values (`CUS_OPER`, …) | `runQuery` on `DD07T` | SE11 → domain → value range |
| Transport texts and status | `runQuery` on `E070`/`E07T`, `userTransports`, `transportReference` | SE01 / SE09 |
| Source with markers | `readAbapObject` | `GET /sap/bc/adt/oo/classes/<n>/source/main` |
| Local include sections | `getObjectSource` on `object.includes.*` | `GET …/includes/{definitions\|implementations\|macros}` |
| Baseline versions | `revisions` → `getObjectSource` on the revision `uri` | `GET …/versions` then the `atom:content/@src` |
| Consumers | `usageReferences`, `runQuery` on the app's registry table | SE84 / where-used |
| Package inventory | `searchPackages`, `nodeContents` | SE80 |

`readAbapObject` collapses the `searchObject` → `objectStructure` → source-link → `getObjectSource`
chain into one call and handles namespaced names, so prefer it. Reach for `objectStructure` and
`classIncludes` only when you need the raw links.
