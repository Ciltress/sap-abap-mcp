# SAP ABAP ADT MCP

An MCP server that gives an AI agent read/write access to an SAP ABAP system over ADT, so the agent
can act as a working ABAP colleague rather than a code generator that has never seen the system.

## Language

### What the server offers

**Tool**:
One operation this server exposes to an MCP client, with a name, a description and an argument schema.
_Avoid_: command, function, endpoint, API

**Guide**:
One of this server's own documents, written for an agent that is *using* the server against an ABAP
system. Served both as an MCP resource and through a tool, because the two reach different consumers.
_Avoid_: doc, manual, readme, reference

**Skill**:
A packaged set of instructions for an agent, served by this server but not authored as part of it.
A skill tells an agent *how to approach a kind of work*; a guide tells it *what this server can do*.
_Avoid_: prompt, playbook, template, instruction set

### What the server wraps

**Collection**:
A group of ADT endpoints as named by a system's own discovery document — ADT's unit for describing
what it offers. The denominator for coverage: DEV lists 215 of them across 56 categories.
_Avoid_: endpoint, resource, service, category

**Coverage**:
How much of what ADT offers on a given system is reachable through this server, measured against that
system's discovery document rather than against any library that also wraps ADT. A diagnostic, not a
target — the server deliberately wraps a fraction of what ADT exposes.
_Avoid_: parity, completeness, feature set

**Profile**:
A named subset of the tools a server process lists, chosen by the operator at startup to fit a client
tier. A tool outside the active profile is not merely hidden — it is not callable, which is what makes
the choice of profile a real one.
_Avoid_: preset, mode, config, toolset

**Gating**:
The server dropping tools at startup because the connected system does not offer what they need,
established from that system's own discovery document. Distinct from a profile: a profile is what the
operator chose to see, gating is what the system can actually do.
_Avoid_: filtering, feature flag, capability check

**Router**:
The hand-written map from the words a person uses to the tool that does the job — "short dump" to
`readShortDumps`, "who calls this" to `usageReferences`. An intent vocabulary, deliberately not
generated, because the generated form can only ever restate the tools' own names back at the reader.
_Avoid_: index, glossary, table of contents, catalogue

**System binding**:
The fixed pairing of one running server process to exactly one SAP system and client, decided at
startup and not changeable while it runs.
_Avoid_: connection, target, environment

### How the server is judged

**Client tier**:
A class of consuming model, distinguished by how much tool description it can afford to carry and how
well it recovers from a wrong turn. Three are in scope: an agent harness that fetches tool schemas on
demand, a small local model that receives every schema on every turn, and a cloud model in between.
_Avoid_: model, consumer, user agent

**Cold session**:
A fresh conversation carrying no prior knowledge of this server beyond what the server itself supplies.
The only condition under which reliability is judged, because it is the condition every real task
starts in.
_Avoid_: new chat, fresh context, first run

**First-try success**:
A task completed from a cold session without the model retrying, choosing a wrong tool, or asking for
information the server could have supplied. The measure of quality here — not tool count, not
token cost, both of which only matter through their effect on this.
_Avoid_: accuracy, success rate, reliability
