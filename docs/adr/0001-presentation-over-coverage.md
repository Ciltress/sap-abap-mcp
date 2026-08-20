# Presentation over coverage: 139 tools, not 215 collections

DEV's ADT discovery document lists **215 collections across 56 categories**; this server wraps roughly
a quarter of them. We considered reading the `SADT_MAIN` subpackages to learn each collection's wire
protocol and build toward complete coverage. We are not doing that. The tool set stays at its current
size, and ADT's remaining surface is treated as a source of **improvements to the tools we already
have** — better arguments, fewer round trips, richer results — rather than as a list of tools to build.

The reason is measured, not aesthetic. The 138 tool definitions serialise to ~68KB, about **18,900
tokens**, and every client without on-demand schema fetching pays that on every turn. Full coverage
would be roughly 350 tools, about **51,000 tokens per turn**. The smallest client in scope is an 8B
model with a 128k window, and it is the design target — reliability there has always come from better
tools rather than more of them.

## Consequences

- Coverage becomes a diagnostic rather than a target. It is worth reporting the gap against
  `adtDiscovery` so it stays visible, but a gap is not a defect.
- A capability that genuinely blocks a real task is still a good reason to add a tool. Demand is the
  evidence, not the discovery document.
- Anyone finding ~60 of 215 collections wrapped should read this as deliberate. It is not unfinished.
