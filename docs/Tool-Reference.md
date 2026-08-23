# Tool reference

<!-- GENERATED FILE - do not edit by hand.
     Run `npm run docs:tools` after changing any getTools(). -->

Every tool this server can expose: **128 tools across 29 families**, rendered from the tool definitions themselves so it cannot drift from the code.

**How many you can actually call is smaller.** The active `ABAP_MCP_PROFILE` decides what is
listed, and the server withholds anything this system's ADT release does not expose.
`tools/list` is always the truth; `healthcheck` reports the profile and what was withheld.

Looking for the tool that does a particular job? Start with
[`Tool-Router.md`](./Tool-Router.md), which maps intent to tool. For workflows, URI rules and
the error model, see [`MCP-Tools.md`](./MCP-Tools.md).

An argument marked **\*** is required. Argument *descriptions* are not repeated here: they
reach you in the `inputSchema` of every tool you can call.

The italic line under each tool is its MCP **annotations**, sent to clients in `tools/list`:
whether it only reads, whether it *writes*, whether the write is *destructive* (it overwrites
or removes something that was there) or *idempotent* (repeating it changes nothing further),
and whether it reaches past this one SAP system — an external Git remote, a released
transport, a published OData service, or ABAP that can do any of those itself. They are hints
for deciding what needs a human, not a permission system: nothing here is enforced.

## Families

- [ABAP Unit](#abap-unit) — 4 tools
- [ADT discovery](#adt-discovery) — 1 tool
- [ATC (ABAP Test Cockpit)](#atc-abap-test-cockpit) — 7 tools
- [Activation](#activation) — 3 tools
- [Basis and running system](#basis-and-running-system) — 3 tools
- [Bundled skills](#bundled-skills) — 1 tool
- [Class](#class) — 2 tools
- [Code analysis and completion](#code-analysis-and-completion) — 14 tools
- [Debugger](#debugger) — 13 tools
- [Dictionary (DDIC)](#dictionary-ddic) — 5 tools
- [Feed](#feed) — 2 tools
- [Locks](#locks) — 2 tools
- [Object](#object) — 8 tools
- [Object creation and registration](#object-creation-and-registration) — 3 tools
- [Object deletion](#object-deletion) — 1 tool
- [Pretty Printer](#pretty-printer) — 3 tools
- [RFC function modules (JSON-RPC)](#rfc-function-modules-json-rpc) — 4 tools
- [Refactoring (extract method)](#refactoring-extract-method) — 3 tools
- [Rename](#rename) — 3 tools
- [Repository tree](#repository-tree) — 2 tools
- [Revision history](#revision-history) — 1 tool
- [Runtime traces](#runtime-traces) — 9 tools
- [Service bindings](#service-bindings) — 3 tools
- [Session](#session) — 1 tool
- [Source read and write](#source-read-and-write) — 2 tools
- [Table data and SQL](#table-data-and-sql) — 2 tools
- [This server's own guides](#this-servers-own-guides) — 1 tool
- [Transport](#transport) — 15 tools
- [abapGit](#abapgit) — 10 tools

---

## ABAP Unit

From `src/handlers/UnitTestHandlers.ts`.

**`unitTestRun`** — Run ABAP Unit tests for a class, program or package. Returns UnitTestClass[] whose testmethods[] carry the alerts (failures). Pass one of those class objects to unitTestEvaluation for details.

_writes · destructive · reaches outside this SAP system_

`url`**\*** string · `flags` object

**`unitTestEvaluation`** — Method-level detail for one test class. Takes the UnitTestClass OBJECT returned by unitTestRun — not a class name.

_read-only_

`clas`**\*** object · `flags` object

**`unitTestOccurrenceMarkers`** — Map test methods onto source ranges — the data behind the test markers in the ADT gutter.

_read-only_

`url`**\*** string · `source`**\*** string

**`createTestInclude`** — Create the test include (local test classes) of a class. Requires an active lock on the class: call lock first and unLock afterwards.

_writes_

`clas`**\*** string · `lockHandle`**\*** string · `transport` string

## ADT discovery

From `src/handlers/DiscoveryHandlers.ts`.

**`adtDiscovery`** — Every ADT collection this system exposes — the authoritative answer to whether a feature exists on this release. Returns category and collection titles only, which is what "does X exist here?" needs; pass full:true for the hrefs and URI templates, which is several times larger.

_read-only_

`full` boolean, default `false`

## ATC (ABAP Test Cockpit)

From `src/handlers/AtcHandlers.ts`.

**`atcCustomizing`** — System ATC settings, including the default check variant. Start an ATC workflow here.

_read-only_

_no arguments_

**`atcCheckVariant`** — Resolve and validate an ATC check variant name before starting a run.

_read-only_

`variant`**\*** string

**`createAtcRun`** — Start an ATC run over an object or package. Returns the run result id and timestamp needed by atcWorklists.

_writes_

`variant`**\*** string · `mainUrl`**\*** string · `maxResults` number

**`atcWorklists`** — Findings of an ATC run: objects[].findings[] with priority, check title and location.

_read-only_

`runResultId`**\*** string · `timestamp` number · `usedObjectSet` string · `includeExempted` boolean

**`atcUsers`** — Users available as ATC contacts or exemption approvers.

_read-only_

_no arguments_

**`atcExemptProposal`** — Start an exemption for a finding: returns the proposal object to fill in and submit.

_read-only_

`markerId`**\*** string

**`atcRequestExemption`** — Submit an exemption request. Pass the AtcProposal OBJECT from atcExemptProposal, with your justification filled in.

_writes_

`proposal`**\*** object

## Activation

From `src/handlers/ObjectManagementHandlers.ts`.

**`activateObjects`** — Activate several ABAP objects at once. Feed it the records from inactiveObjects. Check BOTH success and messages in the result: syntax errors come back as success:false with messages.

_writes · destructive · idempotent_

`objects`**\*** array · `preauditRequested` boolean

**`activateByName`** — Activate a single ABAP object by name and URL — the simple path after setObjectSource. Check BOTH success and messages in the result.

_writes · destructive · idempotent_

`objectName`**\*** string · `objectUrl`**\*** string · `mainInclude` string · `preauditRequested` boolean

**`inactiveObjects`** — List everything left inactive in the system for this user. Pass the object references straight to activateObjects to clean up.

_read-only_

_no arguments_

## Basis and running system

From `src/handlers/BasisHandlers.ts`.

**`listLoggedOnUsers`** — Who is logged on to this application server right now, from TH_USER_LIST — the data behind SM04. Answers "is anyone using the system", "does USER have a session", "what is running from that host". Summarises by user and client by default; set includeSessions for the individual sessions. Note it covers the application server this session is connected to, not the whole system, and needs the JSON-RPC node plus S_RFC for function group THFB.

_read-only_

`user` string · `currentUserOnly` boolean · `client` string · `includeSessions` boolean · `maxSessions` number

**`readProfileParameters`** — Read SAP profile parameters (the RZ11 values) from the running instance, via TH_GET_PARAMETER. Answers "how is this system configured" for anything held in a profile parameter — ICM ports and timeouts, logon and password policy, SNC, memory, work processes. Reads several in one round trip. Note a parameter that does not exist is reported as exists:false rather than as an error, which is different from one that exists and is empty.

_read-only_

`parameters`**\*** array

**`checkLogonConfiguration`** — How this system lets anyone log on: whether the ICM asks for X.509 client certificates and on which port, whether SNC is on, whether SAP logon tickets and password logon are accepted. Reads the relevant profile parameters and interprets them, including the trap that a per-port VCLIENT overrides the global icm/HTTPS/verify_client. Use it before configuring certificate authentication for this server, or to answer "what authentication does this system support".

_read-only_

`maxPorts` number · `includeParameters` boolean

## Bundled skills

From `src/handlers/SkillsHandlers.ts`.

**`readSkill`** — Bundled agent skills — reusable procedures for ABAP work (Clean ABAP review, RAP, CDS, ABAP Unit, abapGit, ATC, OData…) and for general engineering (TDD, code review, diagnosing bugs, domain modelling…). Call with no arguments to see which exist, then pass `collection` for their descriptions and `skill` to read one. Consult a skill's SKILL.md before starting a task it covers: they carry the conventions and checklists that make the result acceptable, which the tool descriptions alone do not.

_read-only_

`collection` string · `skill` string · `file` string

## Class

From `src/handlers/ClassHandlers.ts`.

**`classIncludes`** — List the source URLs of the includes of an ABAP class (definitions, implementations, macros, testclasses, main). Accepts a class name, an ADT class URL, or the structure object returned by objectStructure. Returns a plain object keyed by include type.

_read-only_

`clas`**\*** string

**`classComponents`** — List the components (methods, attributes, types, events) of an ABAP class, with their ADT links. Takes the class OBJECT url, not the source url.

_read-only_

`url`**\*** string

## Code analysis and completion

From `src/handlers/CodeAnalysisHandlers.ts`.

**`syntaxCheckCode`** — Run an ABAP syntax check against source code you supply (typically an unsaved buffer). Returns an array of findings; an empty array means the code is clean.

_read-only_

`code`**\*** string · `url`**\*** string · `mainUrl` string · `mainProgram` string · `version` string, one of active/inactive/workingArea

**`syntaxCheckCdsUrl`** — Run a syntax check on a stored CDS/DDL source by URL (no source payload — the server checks what is saved).

_read-only_

`cdsUrl`**\*** string

**`codeCompletion`** — Code completion proposals at a position. Returns entries with PREFIXLENGTH (how many characters the proposal replaces) and IDENTIFIER.

_read-only_

`sourceUrl`**\*** string · `source`**\*** string · `line`**\*** number · `column`**\*** number

**`findDefinition`** — Go to definition of the symbol at a position. startCol/endCol must span the whole identifier, not a single caret position.

_read-only_

`url`**\*** string · `source`**\*** string · `line`**\*** number · `startCol`**\*** number · `endCol`**\*** number · `implementation` boolean · `mainProgram` string

**`usageReferences`** — Find all references. Without line/column it reports usages of the whole object; with them, of the symbol at that position.

_read-only_

`url`**\*** string · `line` number · `column` number

**`syntaxCheckTypes`** — List the syntax checker types this system supports, as checkType -> supported types.

_read-only_

_no arguments_

**`codeCompletionFull`** — Expand a pattern proposal (e.g. a full METHOD ... ENDMETHOD skeleton) into source text. patternKey comes from a previous codeCompletion proposal.

_read-only_

`sourceUrl`**\*** string · `source`**\*** string · `line`**\*** number · `column`**\*** number · `patternKey`**\*** string

**`runClass`** — Execute a class that implements IF_OO_ADT_CLASSRUN and return its console output. This RUNS CODE on the SAP system.

_writes · destructive · reaches outside this SAP system_

`className`**\*** string

**`codeCompletionElement`** — Detailed information (documentation, signature, components) about the element at a position. Fails on older systems that answer with HTML instead of XML.

_read-only_

`sourceUrl`**\*** string · `source`**\*** string · `line`**\*** number · `column`**\*** number

**`usageReferenceSnippets`** — Fetch the code snippets around usage references. Pass the UsageReference objects returned by usageReferences unchanged.

_read-only_

`references`**\*** array

**`fixProposals`** — Quick-fix candidates at a position. Feed one of them to fixEdits.

_read-only_

`url`**\*** string · `source`**\*** string · `line`**\*** number · `column`**\*** number

**`fixEdits`** — Turn a fix proposal into concrete source deltas. Returns the edits — it does NOT write them; apply them yourself and use setObjectSource.

_read-only_

`proposal`**\*** object · `source`**\*** string

**`mapSourceFragments`** — Find where one method, form or other sub-object starts and ends in its source, without parsing the code yourself. Use it to read or change a single method of a large class rather than fetching the whole include.

_read-only_

`url`**\*** string · `type`**\*** string · `name`**\*** string

**`abapDocumentation`** — ABAP Keyword Documentation for the token at a position. Returns an HTML string.

_read-only_

`objectUri`**\*** string · `body`**\*** string · `line`**\*** number · `column`**\*** number · `language` string

## Debugger

From `src/handlers/DebugHandlers.ts`.

**`debuggerListeners`** — Check whether a debug listener is already active. Returns undefined when nobody is listening.

_read-only_

`debuggingMode`**\*** string, one of user/terminal · `terminalId`**\*** string · `ideId`**\*** string · `user`**\*** string · `checkConflict` boolean

**`debuggerListen`** — Wait for a breakpoint to be hit. WARNING: this call BLOCKS — it only returns when a breakpoint is reached, a timeout expires, or another client stops the listener, which can take hours. Set breakpoints first, and use debuggerDeleteListener to break out.

_writes_

`debuggingMode`**\*** string, one of user/terminal · `terminalId`**\*** string · `ideId`**\*** string · `user`**\*** string · `checkConflict` boolean · `isNotifiedOnConflict` boolean

**`debuggerDeleteListener`** — Stop a debug listener - yours or another client's. This is how you break out of a blocked debuggerListen.

_writes · destructive · idempotent_

`debuggingMode`**\*** string, one of user/terminal · `terminalId`**\*** string · `ideId`**\*** string · `user`**\*** string

**`debuggerSetBreakpoints`** — Set debugger breakpoints. Returns one entry per breakpoint, which may be a DebugBreakpointError instead of a DebugBreakpoint — check each one.

_writes · idempotent_

`debuggingMode`**\*** string, one of user/terminal · `terminalId`**\*** string · `ideId`**\*** string · `clientId`**\*** string · `breakpoints`**\*** array · `user`**\*** string · `scope` string, one of external/debugger · `systemDebugging` boolean · `deactivated` boolean · `syncScopeUrl` string

**`debuggerDeleteBreakpoints`** — Delete one breakpoint. Pass the DebugBreakpoint object returned by debuggerSetBreakpoints.

_writes · destructive · idempotent_

`breakpoint`**\*** object · `debuggingMode`**\*** string, one of user/terminal · `terminalId`**\*** string · `ideId`**\*** string · `requestUser`**\*** string · `scope` string, one of external/debugger

**`debuggerAttach`** — Attach to a debuggee reported by debuggerListen. Returns the reached breakpoint and the initial stack.

_writes_

`debuggingMode`**\*** string, one of user/terminal · `debuggeeId`**\*** string · `user`**\*** string · `dynproDebugging` boolean

**`debuggerSaveSettings`** — Persist the debugger settings (system debugging, update debugging, exception objects, ...).

_writes · destructive · idempotent_

`settings`**\*** object

**`debuggerStackTrace`** — Call stack of the attached debuggee. semanticURIs:true returns ADT URIs you can feed to getObjectSource.

_read-only_

`semanticURIs` boolean

**`debuggerVariables`** — Read variables of the current stack frame by name. Use ["SY"] for the system fields.

_read-only_

`parents`**\*** array

**`debuggerChildVariables`** — Expand a structure, internal table or object one level deeper.

_read-only_

`parent` array

**`debuggerStep`** — Step the attached debuggee. stepRunToLine and stepJumpToLine need url; terminateDebuggee ends the session.

_writes · destructive · reaches outside this SAP system_

`steptype`**\*** string, one of stepInto/stepOver/stepReturn/stepContinue/stepRunToLine/stepJumpToLine/terminateDebuggee · `url` string

**`debuggerGoToStack`** — Switch the active stack frame, so variable reads apply to that frame.

_writes · idempotent_

`urlOrPosition`**\*** string

**`debuggerSetVariableValue`** — Overwrite a variable in the running debuggee.

_writes · destructive · idempotent_

`variableName`**\*** string · `value`**\*** string

## Dictionary (DDIC)

From `src/handlers/DdicHandlers.ts`.

**`describeAbapTable`** — Field list of a database table, structure or view: names, DDIC types, lengths, KEY flags, data elements, domains and check tables, condensed into a readable summary. Use this for "what does this table look like" — objectStructure returns no fields for a table, and tableContents returns rows rather than a definition. Runs over the SAP Gateway JSON-RPC service, so it needs that node active and S_RFC.

_read-only_

`tableName`**\*** string · `language` string

**`annotationDefinitions`** — The full CDS annotation vocabulary of this system, as a string. Large.

_read-only_

_no arguments_

**`ddicElement`** — Semantic model (fields, types, annotations) of a table, view or CDS entity.

_read-only_

`path`**\*** string · `getTargetForAssociation` boolean · `getExtensionViews` boolean · `getSecondaryObjects` boolean

**`ddicRepositoryAccess`** — Where-used / lineage information at data dictionary level.

_read-only_

`path`**\*** string

**`packageSearchHelp`** — Value help for package attributes (application/software components, transport layers, translation relevance).

_read-only_

`type`**\*** string, one of applicationcomponents/softwarecomponents/transportlayers/translationrelevances · `name` string

## Feed

From `src/handlers/FeedHandlers.ts`.

**`listFeeds`** — ADT feeds available on this system - short dumps, ATC results and whatever else this release publishes - with the queries each one accepts. Call it to find out what is subscribable here before reaching for a specific feed.

_read-only_

_no arguments_

**`readShortDumps`** — Recent ABAP short dumps - the ST22 list. The fastest way to find out why something you just ran failed, and the first thing to check after a runtime error, a failed activation or an RFC call that died without a message.

_read-only_

`query` string

## Locks

From `src/handlers/ObjectLockHandlers.ts`.

**`lock`** — Lock an ABAP object for editing and return the lock handle. The lock lives in the stateful session — dropSession or a server restart invalidates it. Always unLock when done. The result also reports the transport the object is already in (CORRNR) and whether it is local.

_writes · idempotent_

`objectUrl`**\*** string · `accessMode` string

**`unLock`** — Release a lock. Call this even when the operation in between failed.

_writes · idempotent_

`objectUrl`**\*** string · `lockHandle`**\*** string

## Object

From `src/handlers/ObjectHandlers.ts`.

**`objectStructure`** — Metadata and links of an ABAP object. The link with type "text/plain" is the SOURCE url (relative to objectUrl) that getObjectSource and the code-intelligence tools need.

_read-only_

`objectUrl`**\*** string · `version` string, one of active/inactive/workingArea

**`searchObject`** — Find ABAP objects by name or name pattern — the general search, for when you do not know an exact name. A trailing * is added when you supply no wildcard, and the query is upper-cased, so "zcl_foo" finds ZCL_FOO_BAR. objType matches the full ADT type (FUGR/FF really does select function modules). Reports truncation explicitly. To read one object you already know the name of, use readAbapObject instead.

_read-only_

`query`**\*** string · `objType` string · `max` number

**`readAbapObject`** — Read an ABAP object by NAME — no URL needed. Resolves the name, picks the right object when several types share it, and returns the metadata together with the source in one call. This replaces the searchObject -> objectStructure -> source-link -> getObjectSource sequence: prefer it for reading classes, interfaces, programs, includes, function groups and function modules. Objects that have no source (tables, structures, transactions) come back with hasSource:false and a pointer to the tool that does describe them.

_read-only_

`objectName`**\*** string · `objectType` string · `includeSource` boolean · `version` string, one of active/inactive/workingArea

**`searchPackages`** — Find packages by name pattern and list what is in them, in one call. Takes several patterns at once (e.g. ["ZPP_*","Z_PP*"]), normalises each one the way the repository search needs it (upper case, trailing * added when missing), merges and de-duplicates the hits, then expands every package into its objects grouped by type. Use this instead of searchObject + nodeContents per package when surveying a naming convention. Reports truncation explicitly, so a capped result is never mistaken for a complete one.

_read-only_

`patterns`**\*** array · `includeContents` boolean · `objectTypes` array · `maxPerPattern` number

**`editAbapSource`** — Change the source of an ABAP object by NAME and activate it, in one call. Performs the whole cycle — lock, write, activate, unlock — and releases the lock on every path, including failure, so a failed edit cannot leave the object locked. This is a FULL REPLACE of the source: read it with readAbapObject first, edit the text, and send it complete. Prefer this over driving lock / setObjectSource / activateByName / unLock yourself; those remain for edits that need the steps apart. Check `activation.success` in the answer — a syntax error comes back as success:false with messages, not as an error.

_writes · destructive_

`objectName` string · `objectUrl` string · `source`**\*** string · `objectType` string · `include` string, one of definitions/implementations/macros/testclasses/main · `transport` string · `activate` boolean

**`findObjectPath`** — Package hierarchy (breadcrumb) leading to an object - where it lives in the repository tree.

_read-only_

`objectUrl`**\*** string

**`objectTypes`** — All object types this system knows, with their ADT URI templates. Useful for mapping a type id to a URL shape.

_read-only_

_no arguments_

**`reentranceTicket`** — Short-lived SSO ticket for handing the current session to a browser or SAP GUI.

_writes_

_no arguments_

## Object creation and registration

From `src/handlers/ObjectRegistrationHandlers.ts`.

**`objectRegistrationInfo`** — Namespace / SSCR registration information for an ABAP object.

_read-only_

`objectUrl`**\*** string

**`validateNewObject`** — Check a new object name, package and type before creating it — catches name clashes and missing authorisations.

_read-only_

`options`**\*** object

**`createObject`** — Create a new, EMPTY ABAP object. Fill it afterwards with lock -> setObjectSource -> activateByName -> unLock.

_writes_

`objtype`**\*** string · `name`**\*** string · `parentName`**\*** string · `description`**\*** string · `parentPath`**\*** string · `responsible` string · `transport` string

## Object deletion

From `src/handlers/ObjectDeletionHandlers.ts`.

**`deleteObject`** — Delete an ABAP object. IRREVERSIBLE - requires an active lock handle, and a transport for non-local objects.

_writes · destructive · idempotent_

`objectUrl`**\*** string · `lockHandle`**\*** string · `transport` string

## Pretty Printer

From `src/handlers/PrettyPrinterHandlers.ts`.

**`prettyPrinterSetting`** — Current pretty printer settings (indentation and casing style) of the logged-on user.

_read-only_

_no arguments_

**`setPrettyPrinterSetting`** — Change the pretty printer settings. These are USER-LEVEL settings on the SAP system - read them first with prettyPrinterSetting and restore them if you only needed a one-off format.

_writes · destructive · idempotent_

`indent`**\*** boolean · `style`**\*** string, one of toLower/toUpper/keywordUpper/keywordLower/keywordAuto/none

**`prettyPrinter`** — Format ABAP source server-side with the current settings and return it. Writes nothing - use setObjectSource to persist.

_read-only_

`source`**\*** string

## RFC function modules (JSON-RPC)

From `src/handlers/JsonRemoteFunctionCallHandlers.ts`.

**`readAbapFunctionModule`** — Read the interface (parameters, exceptions, defaults) of an RFC-enabled ABAP function module. Uses RFC_GET_FUNCTION_INTERFACE over the SAP Gateway JSON-RPC service, which is the same signature the dispatcher validates calls against, and falls back to parsing the generated interface block in the ADT source. Call this before callFunctionViaJsonRpc to find out which parameters exist.

_read-only_

`functionModuleName`**\*** string

**`callFunctionViaJsonRpc`** — Execute an RFC-enabled ABAP function module through the SAP Gateway JSON-RPC 2.0 service. The interface is read first and the request validated against it. Parameter names are ABAP names and are matched case-insensitively. Requires S_RFC authorisation for the function module's group, and the function module must pass the SLDW whitelist SAP_JSON_RPC_FUNCTION_MODULES where that whitelist is active.

_writes · destructive · reaches outside this SAP system_

`functionModuleName`**\*** string · `inputParameters` object · `outputParameters` array

**`callFunctionsViaJsonRpc`** — Execute several RFC-enabled ABAP function modules in ONE JSON-RPC request, in the given order. All members run in the same ABAP session and therefore the same LUW, which is what makes update BAPIs work: put the BAPI and its BAPI_TRANSACTION_COMMIT (or _ROLLBACK) in a single batch, because a separate call would run in its own LUW and never commit the first. Every signature is read and every member validated before anything is sent. A member that fails does not abort the others: each entry reports ok, output and error separately.

_writes · destructive · reaches outside this SAP system_

`calls`**\*** array

**`checkJsonRpcEndpoint`** — Probe the SAP Gateway JSON-RPC service with the CSRF-exempt JSONRPC.INIT method. Use this to tell an inactive/misrouted SICF node apart from an authorisation or CSRF problem when callFunctionViaJsonRpc fails.

_read-only_

_no arguments_

## Refactoring (extract method)

From `src/handlers/RefactorHandlers.ts`.

**`extractMethodEvaluate`** — Step 1 of 3 of an extract-method refactoring: propose a method for a source range. Feed the result to extractMethodPreview, then extractMethodExecute.

_read-only_

`uri`**\*** string · `range`**\*** object

**`extractMethodPreview`** — Step 2 of 3: turn the proposal into a concrete refactoring with the resulting source deltas. Set the method name and visibility on the proposal object first.

_read-only_

`proposal`**\*** object

**`extractMethodExecute`** — Step 3 of 3: apply the refactoring. This WRITES source code.

_writes · destructive_

`refactoring`**\*** object

## Rename

From `src/handlers/RenameHandlers.ts`.

**`renameEvaluate`** — Step 1 of 3 of a rename refactoring: propose a rename for the symbol at a position. Feed the result to renamePreview, then renameExecute.

_read-only_

`uri`**\*** string · `line`**\*** number · `startColumn`**\*** number · `endColumn`**\*** number

**`renamePreview`** — Step 2 of 3: compute every affected source change. Set the new name on the proposal object before calling, and show the result to a human before executing.

_read-only_

`renameRefactoring`**\*** object · `transport` string

**`renameExecute`** — Step 3 of 3: apply the rename. This WRITES source code across every affected object.

_writes · destructive_

`refactoring`**\*** object

## Repository tree

From `src/handlers/NodeHandlers.ts`.

**`nodeContents`** — Browse the ABAP repository tree, e.g. list a package with {parent_type:"DEVC/K", parent_name:"ZPKG"}.

_read-only_

`parent_type`**\*** string, one of DEVC/K/PROG/P/FUGR/F/PROG/PI · `parent_name` string · `user_name` string · `parent_tech_name` string · `rebuild_tree` boolean · `parentnodes` array

**`mainPrograms`** — Which main programs an include belongs to. You need one of these as mainProgram for syntaxCheckCode and findDefinition on includes.

_read-only_

`includeUrl`**\*** string

## Revision history

From `src/handlers/RevisionHandlers.ts`.

**`revisions`** — Version history of an object. Each revision carries a uri you can pass to getObjectSource to diff versions.

_read-only_

`objectUrl`**\*** string · `clsInclude` string, one of definitions/implementations/macros/testclasses/main

## Runtime traces

From `src/handlers/TraceHandlers.ts`.

**`tracesList`** — Trace results available for a user. Their ids feed the hit list, DB access and statement tools.

_read-only_

`user` string

**`tracesListRequests`** — Scheduled trace requests (configurations) that have not produced a result yet.

_read-only_

`user` string

**`tracesHitList`** — Hit list of a trace: which statements consumed the runtime.

_read-only_

`id`**\*** string · `withSystemEvents` boolean

**`tracesDbAccess`** — Database accesses recorded in a trace, with their times and row counts.

_read-only_

`id`**\*** string · `withSystemEvents` boolean

**`tracesStatements`** — Statement-level detail of a trace, optionally drilled down automatically past a time threshold.

_read-only_

`id`**\*** string · `options` object

**`tracesSetParameters`** — Define what a trace records and its size/time limits. Returns the parametersId used by tracesCreateConfiguration.

_writes_

`parameters`**\*** object

**`tracesCreateConfiguration`** — Schedule a trace for a user, process type and object type.

_writes_

`config`**\*** object

**`tracesDeleteConfiguration`** — Delete a scheduled trace configuration, so it stops producing new traces.

_writes · destructive · idempotent_

`id`**\*** string

**`tracesDelete`** — Delete a trace result and the runtime data behind it.

_writes · destructive · idempotent_

`id`**\*** string

## Service bindings

From `src/handlers/ServiceBindingHandlers.ts`.

**`publishServiceBinding`** — Publish a service binding - this EXPOSES an OData service. Check the returned severity: an HTTP success does not mean it published.

_writes · idempotent · reaches outside this SAP system_

`name`**\*** string · `version`**\*** string

**`unPublishServiceBinding`** — Take a published OData service offline. Check the returned severity.

_writes · destructive · idempotent · reaches outside this SAP system_

`name`**\*** string · `version`**\*** string

**`bindingDetails`** — Service URLs and metadata of a binding. Use index to pick one of several services in it.

_read-only_

`binding`**\*** object · `index` number

## Session

From `src/handlers/AuthHandlers.ts`.

**`dropSession`** — End the stateful session, releasing every lock it holds. The escape hatch for a lock that unLock could not release; the next tool call establishes a new session by itself. Locks are session-bound, so anything you locked and did not unlock is freed by this.

_writes · destructive · idempotent_

_no arguments_

## Source read and write

From `src/handlers/ObjectSourceHandlers.ts`.

**`getObjectSource`** — Read the source code of an ABAP object. Takes the SOURCE url (…/source/main), which you get from objectStructure — not the object url.

_read-only_

`objectSourceUrl`**\*** string · `options` object

**`setObjectSource`** — Write the source code of an ABAP object. This is a FULL REPLACE — read the source first, edit it, and send the complete text. Requires a lock handle, and does NOT activate: call activateByName afterwards.

_writes · destructive_

`objectSourceUrl`**\*** string · `source`**\*** string · `lockHandle`**\*** string · `transport` string

## Table data and SQL

From `src/handlers/QueryHandlers.ts`.

**`tableContents`** — Read the contents of a DDIC table or view (ADT Data Preview). Read-only. Note that the service usually returns one row more than requested.

_read-only_

`ddicEntityName`**\*** string · `rowNumber` number · `decode` boolean · `sqlQuery` string

**`runQuery`** — Run a SELECT statement through the ADT Data Preview SQL console. Read-only — the service rejects DML. Returns {columns, values}.

_read-only_

`sqlQuery`**\*** string · `rowNumber` number · `decode` boolean

## This server's own guides

From `src/handlers/DocsHandlers.ts`.

**`readServerGuide`** — This server's own documentation. Call with no arguments for an index of the available guides and their sections, then request one section by number or title. Use it when you are unsure which tool to use, what an argument means, how a workflow fits together (read source, edit and activate, run ATC, call a function module), or why a call is failing — the guides carry the ADT and SAP-specific rules that are easy to get wrong.

_read-only_

`guide` string, one of router/tool-reference/tools/json-rpc/authentication/abap-skills/development-skills/agents · `section` string

## Transport

From `src/handlers/TransportHandlers.ts`.

**`transportInfo`** — Ask which transport requests can take a change to this object, and whether it is local. Call this BEFORE writing: TRANSPORTS[] lists usable requests, MESSAGES[] carries warnings.

_read-only_

`objSourceUrl`**\*** string · `devClass` string · `operation` string

**`createTransport`** — Create a workbench transport request. Returns the new request number as a plain string.

_writes_

`objSourceUrl`**\*** string · `REQUEST_TEXT`**\*** string · `DEVCLASS`**\*** string · `transportLayer` string

**`hasTransportConfig`** — Whether this system uses the newer transport-configuration feature (which the transportConfigurations tools build on).

_read-only_

_no arguments_

**`transportConfigurations`** — List the transport configurations, each with the uri and etag the get/set tools need.

_read-only_

_no arguments_

**`getTransportConfiguration`** — Read one transport configuration, including its etag.

_read-only_

`url`**\*** string

**`setTransportsConfig`** — Update a transport configuration. Uses optimistic locking: a stale etag is rejected, so re-read with getTransportConfiguration first.

_writes · destructive · idempotent_

`uri`**\*** string · `etag`**\*** string · `config`**\*** object

**`createTransportsConfig`** — Create a new, empty transport configuration.

_writes_

_no arguments_

**`userTransports`** — Transport requests owned by a user, split into workbench and customizing.

_read-only_

`user`**\*** string · `targets` boolean

**`transportsByConfig`** — Transport requests visible through a transport configuration, split into workbench and customizing.

_read-only_

`configUri`**\*** string · `targets` boolean

**`transportDelete`** — Delete a transport request. Only works while it is unreleased.

_writes · destructive · idempotent_

`transportNumber`**\*** string

**`transportRelease`** — Release a transport request - starts promotion to the next system and cannot be undone. Read the returned TransportReleaseReport[]: an HTTP success does not mean the release succeeded.

_writes · destructive · idempotent · reaches outside this SAP system_

`transportNumber`**\*** string · `ignoreLocks` boolean · `IgnoreATC` boolean

**`transportSetOwner`** — Hand a transport request over to another user.

_writes · destructive · idempotent_

`transportNumber`**\*** string · `targetuser`**\*** string

**`transportAddUser`** — Add a co-developer task for another user to a transport request.

_writes · idempotent_

`transportNumber`**\*** string · `user`**\*** string

**`systemUsers`** — Users known to the system - for validating transportSetOwner and transportAddUser.

_read-only_

_no arguments_

**`transportReference`** — Resolve a TADIR triple (pgmid, object type, object name) to the ADT URI of that object inside a transport.

_read-only_

`pgmid`**\*** string · `obj_wbtype`**\*** string · `obj_name`**\*** string · `tr_number` string

## abapGit

From `src/handlers/GitHandlers.ts`.

**`gitRepos`** — List the abapGit repositories linked in this system. Start here: the GitRepo objects returned are what the other tools need, and GitRepo.key is the repoId.

_read-only_

_no arguments_

**`gitExternalRepoInfo`** — Retrieves information about an external Git repository.

_read-only · reaches outside this SAP system_

`repourl`**\*** string · `user` string · `password` string

**`gitCreateRepo`** — Link an ABAP package to a Git repository and pull it for the first time.

_writes · destructive · reaches outside this SAP system_

`packageName`**\*** string · `repourl`**\*** string · `branch` string · `transport` string · `user` string · `password` string

**`gitPullRepo`** — Pull a repository into the ABAP system. OVERWRITES the ABAP objects of the linked package with the repository content.

_writes · destructive · reaches outside this SAP system_

`repoId`**\*** string · `branch` string · `transport` string · `user` string · `password` string

**`gitUnlinkRepo`** — Remove the link between a package and its repository. The ABAP objects stay.

_writes · destructive · idempotent_

`repoId`**\*** string

**`stageRepo`** — Compute the staging area for a repository. Returns GitStaging with staged/unstaged/ignored; move entries and set comment/author/committer, then pass it to pushRepo.

_read-only · reaches outside this SAP system_

`repo`**\*** object · `user` string · `password` string

**`pushRepo`** — Push staged changes to the remote. This PUBLISHES code to an external repository.

_writes · reaches outside this SAP system_

`repo`**\*** object · `staging`**\*** object · `user` string · `password` string

**`checkRepo`** — Consistency check of a linked repository - run it before a pull or push.

_read-only · reaches outside this SAP system_

`repo`**\*** object · `user` string · `password` string

**`remoteRepoInfo`** — DEPRECATED (duplicate of gitExternalRepoInfo, which takes a URL instead of a repo object) — retrieves information about the remote of a linked repository.

_read-only · reaches outside this SAP system_

`repo`**\*** object · `user` string · `password` string

**`switchRepoBranch`** — Switches the branch of a Git repository.

_writes · destructive · idempotent · reaches outside this SAP system_

`repo`**\*** object · `branch`**\*** string · `create` boolean · `user` string · `password` string
