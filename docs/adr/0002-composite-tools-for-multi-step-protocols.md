# Composite tools where the protocol is the hard part

`editAbapSource` was added: one tool that locks an object, writes its source, activates it and
releases the lock, with the unlock in a `finally` so it runs on every path. The four steps —
`lock`, `setObjectSource`, `activateByName`, `unLock` — stay, and `dev` and `all` still list them.
`core` lists the composite instead, and drops from 11 tools to 8.

[ADR-0001](0001-presentation-over-coverage.md) caps the tool set and says ADT's remaining surface is
a source of improvements to the tools we already have, not a list of tools to build. It also says a
capability that genuinely blocks a real task is still a good reason to add a tool, and that **demand
is the evidence**. This is that case, and the demand was explicit: the four-step cycle was reviewed
as the clearest remaining example of a shallow interface in the server, and adding the composite was
asked for directly.

The argument is about what the interface contains. Everything a caller had to know to drive the
cycle correctly was outside the schemas: the order of the four calls, the lifetime of a lock handle,
that the lock is bound to the stateful session, and that a failure halfway through still obliges an
`unLock`. None of that could be typed. It lived as prose in `AGENTS.md` ("always `unLock` what you
`lock`, including after a failure") and as a warning in `profiles.ts` that dropping any one of the
four "leaves a profile that can start an edit it cannot finish". A rule a model has to remember
across four calls is a rule it will sometimes not remember, and the failure is not local: an orphaned
lock on a shared system blocks other developers until `dropSession` or a restart.

`readAbapObject` and `searchPackages` are the precedent. Both collapse a multi-call dance into one
tool, both left the parts in place, and both were added for the same reason — first-try success from
a cold session, which is the measure this server is judged by.

## Consequences

- The tool count rises by one, to 128. That is within what ADR-0001 allows and does not reopen it.
- `core` gets smaller, not larger: one tool replaces four, so the smallest client in scope carries
  less and has less to get wrong.
- A composite tool must leave the system no worse than it found it. `editAbapSource` releases the
  lock on every path and reports an unlock it could not perform rather than throwing over it — an
  unlock failure must not turn a successful write into an error, nor mask the failure that caused it.
- This is not a licence to wrap every sequence. The test is whether the *ordering and obligations*
  are the hard part, not whether several calls happen to be adjacent. Where the steps genuinely vary
  — writing several objects under one lock, leaving a change inactive to activate as a group — the
  steps stay available and are the right tool.
