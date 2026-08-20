# Tool router

**What you want to do → the tool that does it.** Written by hand, in the words people actually use,
because a generated index can only ever say a tool's own name back to you. If you know the job but not
the tool, start here.

Not all of these are callable on every server: `ABAP_MCP_PROFILE` decides what is listed, and anything
this system's ADT release does not expose is withheld. **`tools/list` is the truth.** A tool named here
but missing there is not a mistake — it is out of profile, or not supported by this system.

Arguments live in each tool's own `inputSchema`. Full list: [`Tool-Reference.md`](./Tool-Reference.md).
Workflows, URI rules and the error model: [`MCP-Tools.md`](./MCP-Tools.md).

---

## Reading code and finding things

| You want to… | Call |
| --- | --- |
| Read a class, program, include, interface or function module **by name** | `readAbapObject` — resolves the name, structure and source in one call. **Start here.** |
| Find objects when you only know part of the name | `searchObject` — a `*` is added if you pass none, and the query is upper-cased |
| See what is in a package, or survey a naming convention | `searchPackages` for one or many patterns; `nodeContents` to browse one package |
| Read one method of a big class without fetching the whole include | `mapSourceFragments`, then `getObjectSource` with the range |
| Find out where something is defined | `findDefinition` |
| Find out **who calls** or uses something | `usageReferences`; `usageReferenceSnippets` for the surrounding lines |
| See the methods, attributes and events of a class | `classComponents`; `classIncludes` for its source parts |
| Find which package an object lives in | `findObjectPath` |
| Read the ABAP language documentation for a statement or class | `abapDocumentation` |
| See earlier versions of an object, or what changed | `revisions` |
| Look up an object's raw source when you already have its URL | `getObjectSource` |

## Understanding data

| You want to… | Call |
| --- | --- |
| See a table's fields, types, keys and text | `describeAbapTable` |
| Look at the **rows** in a table | `tableContents` |
| Run a SELECT | `runQuery` |
| Look up a data element, domain or structure | `ddicElement` |
| Find what a CDS entity exposes | `ddicRepositoryAccess` |
| See the CDS annotations this system knows | `annotationDefinitions` |

## Changing code

**Use `editAbapSource` unless you need the steps apart.** It does the whole cycle — lock, write,
activate, unlock — from an object *name*, and releases the lock on every path including failure.
The four steps below are still there for edits that genuinely need them separated, and then the
cycle is **`lock` → `setObjectSource` → `unLock` → `activateByName`**: a lock is bound to the
session, so release it even when something fails — and release it *before* activating, because SAP
refuses to activate an object its own editor still holds (`User <you> is currently editing …`).

| You want to… | Call |
| --- | --- |
| Check code compiles **before** writing it | `syntaxCheckCode` — do this first, always |
| Change an object's source and activate it | `editAbapSource` — the whole cycle, by name, unlocking whatever happens |
| Fill an object you have just created | `editAbapSource` with `objectUrl` — a new object is inactive, and the repository search only finds active ones |
| Write without activating yet | `editAbapSource` with `activate:false`, e.g. when several objects must go live together |
| Write one include of a class | `editAbapSource` with `include:"testclasses"` |
| Take the lock you need in order to write | `lock` (it also reports the transport the object is already in) |
| Write source | `setObjectSource` |
| Activate what you changed | `activateByName`; `activateObjects` for several; `inactiveObjects` to see what is pending |
| Release the lock | `unLock` — even after a failure |
| Free a lock `unLock` could not release | `dropSession` — ends the session and drops every lock it holds |
| Create a new class, program or include | `validateNewObject` to check the name, then `createObject` |
| Delete an object | `deleteObject` |
| Format source to the system's style | `prettyPrinter`; `prettyPrinterSetting` to see the rules first |
| Rename something everywhere it is used | `renameEvaluate` → `renamePreview` → `renameExecute` |
| Pull a block of code out into its own method | `extractMethodEvaluate` → `extractMethodPreview` → `extractMethodExecute` |
| Apply a quick fix the system suggests | `fixProposals`, then `fixEdits` |
| Get code completion for a position in source | `codeCompletion`; `codeCompletionFull` / `codeCompletionElement` for detail |

## Transports

| You want to… | Call |
| --- | --- |
| Find out which request an object can go into | `transportInfo` |
| Create a request | `createTransport` |
| See my own requests | `userTransports` |
| Release a request | `transportRelease` |
| Add a colleague to a request | `transportAddUser` (`systemUsers` to find the user id) |
| Delete or reassign a request | `transportDelete`, `transportSetOwner` |
| See what is configured for transports here | `hasTransportConfig`, `transportConfigurations`, `getTransportConfiguration` |

## Testing and quality

| You want to… | Call |
| --- | --- |
| Run the unit tests of a class or package | `unitTestRun`; `unitTestEvaluation` for the detail of one result |
| Add a test include to a class that has none | `createTestInclude` |
| Run a static check (ATC) | `createAtcRun`, then `atcWorklists` for the findings |
| See which ATC variants exist | `atcCheckVariant`, `atcCustomizing` |
| Ask for an exemption from an ATC finding | `atcExemptProposal` → fill it in → `atcRequestExemption` |

## When something went wrong

| You want to… | Call |
| --- | --- |
| Find out why something just failed at runtime | `readShortDumps` — **the first thing to check** after a runtime error, a failed activation or an RFC call that died silently |
| See which feeds this system publishes | `listFeeds` |
| Step through code | `debuggerListen` (blocks) with `debuggerSetBreakpoints` set first; `debuggerStep`, `debuggerVariables`, `debuggerStackTrace` while stopped |
| Stop a debugger that is blocking | `debuggerDeleteListener`, from another call |
| Find out why something is slow | `tracesCreateConfiguration` → run it → `tracesList` → `tracesHitList`, `tracesDbAccess`, `tracesStatements` |

## Calling function modules (RFC)

ADT cannot do this; it goes over the SAP Gateway JSON-RPC service. See [`JSON-RPC.md`](./JSON-RPC.md).

| You want to… | Call |
| --- | --- |
| See a function module's parameters before calling it | `readAbapFunctionModule` |
| Call one function module | `callFunctionViaJsonRpc` |
| Call several in **one LUW**, so a rollback undoes them together | `callFunctionsViaJsonRpc` |
| Check the RFC route works at all | `checkJsonRpcEndpoint` |

## The system itself

| You want to… | Call |
| --- | --- |
| Find out which system and client this server is bound to | `healthcheck` — also reports the active profile and anything withheld |
| Work out **why** SAP is not answering | `healthcheck` → `reachability` — names the layer that refused: network, TLS, an ICF node that is not served, or a logon SAP would not accept |
| Tell "my ticket is broken" from "the service is switched off" | `healthcheck` → `reachability.layer` — `logon` is the credential, `icf` is SICF and has nothing to do with the credential |
| Prove the ADT services themselves answer | `adtDiscovery` (titles only unless `full:true`), or `checkJsonRpcEndpoint` for the RFC route |
| Check whether a feature exists on this release | `adtDiscovery` — the system's own list of what it exposes |
| See who is logged on | `listLoggedOnUsers` |
| Read a profile parameter | `readProfileParameters` |
| Understand how logon is configured (SSO, certificates, SNC) | `checkLogonConfiguration` |

## Guidance

| You want to… | Call |
| --- | --- |
| Read this server's own documentation mid-task | `readServerGuide` — takes a `section`, so you need not read a whole guide |
| Get a worked approach to an ABAP topic (RAP, CDS, ATC, testing, Clean ABAP…) | `readSkill` — ask for one file, not the whole skill |

---

## Words that lead people astray

| If you are thinking… | The tool is |
| --- | --- |
| "short dump", "ST22", "runtime error" | `readShortDumps` |
| "where-used", "cross-reference", "who calls this" | `usageReferences` |
| "SE16", "table entries", "show me the data" | `tableContents` |
| "SE11", "what fields does it have" | `describeAbapTable` |
| "SE80", "browse the package" | `nodeContents` or `searchPackages` |
| "open the class", "show me the code" | `readAbapObject` |
| "SE09", "SE10", "my transports" | `userTransports` |
| "check it compiles" | `syntaxCheckCode` |
| "activate", "generate" | `activateByName` |
| "SM04", "who is on the system" | `listLoggedOnUsers` |
| "RZ11", "parameter value" | `readProfileParameters` |
| "SE37", "call the BAPI" | `readAbapFunctionModule`, then `callFunctionViaJsonRpc` |
| "ST05", "SAT", "why is it slow" | the trace tools, starting at `tracesCreateConfiguration` |
