---
name: abap
description: Check and improve ABAP code quality using the SAP system's own checks (syntax check, ATC) when an ADT connection is available, and abaplint plus Clean ABAP principles otherwise. Use this skill when users ask to check, lint, validate, review, or analyze ABAP code for syntax errors, clean code compliance, code quality, best practices, or adherence to Clean ABAP guidelines. Also use when users ask to run ATC, run a syntax check, set up abaplint, configure abaplint.json, or run abaplint on their ABAP project. Triggers include requests like "check this ABAP code", "lint my ABAP", "run abaplint", "run ATC", "syntax check", "configure abaplint", "is this clean ABAP", "review my ABAP", or "analyze ABAP code quality".
---

# ABAP

Check and improve ABAP code quality using three complementary approaches:

- **The system's own checks** — ABAP syntax check and ATC, via the ABAP ADT MCP server. Authoritative:
  they know the DDIC, the release and what will actually activate.
- **abaplint**: static analysis via CLI over serialized (abapGit) files. The right tool in CI, or when
  there is no system to talk to.
- **Clean ABAP**: manual review against the style guide, for everything no tool can decide.

## Step 0 — is there a system?

Check whether the ABAP ADT MCP server's tools are available (`readAbapObject`, `syntaxCheckCode`,
`createAtcRun`).

- **Yes** → prefer the system's checks. Read `references/mcp-adt-tools.md` and follow it: fetch the
  source by name with `readAbapObject`, run `syntaxCheckCode`, run ATC, then do the Clean ABAP review
  for the judgement calls. **Do not ask the user to paste code you can read yourself.**
- **No** → use the abaplint workflow below plus the Clean ABAP review.

Either way the Clean ABAP review still applies — only the mechanical checks differ.

## Workflow

1. **Determine check type** based on user request:
   - If the user asks to run ATC or check against the system: use **ATC** (`references/mcp-adt-tools.md`)
   - If the user asks to lint, run abaplint, or check syntax: use the **syntax check** with a system,
     **abaplint** without one
   - If the user asks for clean code review, best practices, or code quality: use **Clean ABAP review**
   - If unclear or the user asks for a full check: use **all that are available**

2. **For abaplint checks**:
   - Verify `abaplint` is installed (`npx @abaplint/cli --version` or `abaplint --version`)
   - If not installed, install with: `npm install @abaplint/cli -g`
   - Check if `abaplint.json` exists in the project root
   - If no config exists, help the user create one (see starter configs in `references/abaplint.md`)
   - Run `abaplint` in the project root directory
   - Parse and present findings to the user

3. **For Clean ABAP reviews**:
   - Read the ABAP code provided by the user
   - Check against Clean ABAP categories: Names, Language, Constants, Variables, Tables, Strings, Booleans, Conditions, Ifs, Classes, Methods, Error Handling, Comments, Formatting, Testing
   - Identify violations with specific line references
   - Provide actionable recommendations with code examples
   - Prioritize issues by impact (critical, major, minor)

## abaplint Quick Start

Run in project root:

```bash
abaplint
```

Generate default config (all rules):

```bash
abaplint -d > abaplint.json
```

For detailed abaplint configuration including starter configs for On-Premise, Steampunk/BTP, and HANA compatibility, read `references/abaplint.md`.

## Clean ABAP Check Categories

### Names

- Use descriptive names, snake*case, no Hungarian notation (iv*, lv*, lt*)
- Nouns for classes, verbs for methods, no noise words

### Language

- Prefer OO over procedural, functional over imperative
- Use modern syntax: NEW, inline declarations, table expressions

### Constants

- No magic numbers, use ENUM or grouped constants

### Variables

- Prefer inline declarations, no chained DATA

### Tables

- No DEFAULT KEY, use INSERT INTO TABLE, LINE_EXISTS, WHERE clauses

### Strings

- Backticks for literals, pipes for string templates

### Booleans

- Use ABAP_BOOL, ABAP_TRUE/ABAP_FALSE, XSDBOOL

### Conditions

- Positive conditions, IS NOT over NOT IS, predicative method calls

### Ifs

- No empty IF branches, CASE over ELSE IF, nesting depth <= 3

### Methods

- Instance over static, RETURNING over EXPORTING, <= 3 parameters, <= 20 lines

### Error Handling

- Exceptions over return codes, class-based exceptions, no catching CX_ROOT

### Comments

- Explain why not what, " over \*, no commented-out code

### Formatting

- One statement per line, <= 120 chars, consistent indentation

### Testing

- Given-when-then structure, focused assertions, dependency injection

## Output Format

Structure analysis results as:

```
# ABAP Check Results

## Syntax Check          (system; omit if no ADT connection)
[findings as line / severity / text]

## ATC Findings          (system; omit if no ADT connection)
[findings grouped by priority, with check title and location]

## abaplint Findings     (omit when the system checks ran instead)
[abaplint output, grouped by severity]

## Clean ABAP Review

### Summary
- Total Issues: [count]
- Critical: [count] | Major: [count] | Minor: [count]

### Critical Issues
#### [Category] - [Issue Title]
**Location:** Line [X] / Method [name]
**Problem:** [description]
**Recommendation:** [how to fix]

### Major Issues
[Same format]

### Minor Issues
[Same format]

### Positive Observations
- [Things done well]
```

Say where each finding came from. "ATC priority 1" and "syntax error, line 7" are facts about the
system; "this name could be clearer" is a judgement. A reviewer weighs them differently, so do not
present them in the same voice.

## References

- **Checking against a live system**: Read `references/mcp-adt-tools.md` — reading source by name, the
  authoritative syntax check, ATC runs, the pretty printer and ABAP Unit, plus which check answers
  which Clean ABAP category. **Read this first when an ADT connection exists.**
- **abaplint config & setup**: Read `references/abaplint.md` for installation, configuration options, and starter configs
- **Complete Clean ABAP guide**: Read `references/CleanABAP.md` for full style guide with rationale and examples
- **Quick patterns**: Read `references/quick-reference.md` for condensed good/bad code examples
- **Review checklist**: Read `references/checklist.md` for systematic review checklist
