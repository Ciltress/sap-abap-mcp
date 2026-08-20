# Reviewing against a live system (ABAP ADT MCP server)

A Clean ABAP review is two different jobs wearing one name:

- **Mechanical** — facts about the code that a machine decides better than you do, and never gets
  bored of: obsolete statements, unknown types, line length, whether tests exist.
- **Judgement** — whether a name conveys meaning, whether a method does one thing, whether a comment
  earns its place. No tool decides these.

When an ADT connection is available, hand the mechanical half to the system and spend your attention
on the judgement half. That is the whole point of this reference.

---

## 1. Read the code — do not ask for it

```jsonc
{"tool":"readAbapObject","args":{"objectName":"ZCL_MY_CLASS"}}
// -> {name, type, package, description, objectUrl, sourceUrl, hasSource, source, includes?}
```

- Takes a **name**, not an ADT URL.
- `includes` on a class gives `definitions`, `implementations`, `macros` and `testclasses`. **Read the
  test include** — the Testing category cannot be reviewed without it, and its absence is itself a
  finding.
- Reviewing an area rather than one object: `searchPackages` with `objectTypes` to get the inventory.

Keep the `sourceUrl` it returns. The syntax check needs it.

## 2. Let the system decide what it can

```jsonc
{"tool":"syntaxCheckCode","args":{"code":"<source>","url":"<sourceUrl from step 1>"}}
// -> [] when clean, else [{uri, line, offset, severity, text}]

{"tool":"atcCustomizing","args":{}}                       // -> systemCheckVariant, e.g. "DEFAULT"
{"tool":"createAtcRun","args":{"variant":"DEFAULT","mainUrl":"<objectUrl>"}}
{"tool":"atcWorklists","args":{"runResultId":"<id>","timestamp":<ts>}}

{"tool":"prettyPrinter","args":{"objectUrl":"<objectUrl>","code":"<source>"}}
{"tool":"unitTestRun","args":{"objectUrl":"<objectUrl>"}}
```

> **Trap — a wrong `url` gives a false "clean".** The `url` is the compilation context. Point it at an
> object that does not exist and the check returns `[]`, which looks exactly like success. Use the
> `sourceUrl` from step 1, and disbelieve an empty result on code you suspect.

> **Trap — the variant is not `DEFAULT_REMOTE` everywhere.** Read `systemCheckVariant` from
> `atcCustomizing`; on a stock on-premise system it is often plain `DEFAULT`.

---

## 3. Which of the 15 categories the system can answer

**ATC coverage depends on the check variant your organisation configured.** Treat the middle column as
"ask ATC and see", not as a guarantee. What is certain is the last column: those are yours regardless.

| # | Category | The system can decide | Still your judgement |
| --- | --- | --- | --- |
| 1 | **Names** | Little. Some variants carry naming-convention checks. | Whether a name conveys meaning, noise words, one word per concept, Hungarian notation |
| 2 | **Language** | **Yes — this is ATC's strongest suit.** Obsolete statements are release-specific and the system knows its release | Whether procedural code *should* be object-oriented |
| 3 | **Constants** | Some variants flag literals | Whether a constant's name is descriptive, whether grouping makes sense |
| 4 | **Variables** | Unused variables, and `syntaxCheckCode` catches scope errors outright | Inline vs up-front where both compile |
| 5 | **Tables** | `DEFAULT KEY` and performance patterns are common ATC checks | Whether the table *type* suits the access pattern |
| 6 | **Strings** | Rarely | Backticks vs quotes, templates vs `&&` |
| 7 | **Booleans** | Rarely | `ABAP_BOOL` usage, `XSDBOOL`, whether a boolean is the right model at all |
| 8 | **Conditions** | Complexity metrics in some variants | Positive phrasing, decomposition, extraction |
| 9 | **Ifs** | Nesting-depth checks in some variants | `CASE` vs `ELSE IF`, empty branches |
| 10 | **Classes** | Rarely | Static vs instance, composition vs inheritance, visibility, `FINAL` |
| 11 | **Methods** | Procedure-size and parameter-count checks in some variants | Does it do one thing; `RETURNING` vs `EXPORTING`; fail fast |
| 12 | **Error handling** | Some variants flag `CATCH CX_ROOT` and empty handlers | Exception class choice, wrapping foreign exceptions |
| 13 | **Comments** | Rarely | Why-not-what, commented-out code, comments covering bad names |
| 14 | **Formatting** | **Yes — `prettyPrinter`.** Do not review this by hand | Nothing worth arguing about |
| 15 | **Testing** | **Yes — `unitTestRun`**, and whether a test include exists at all | Given-when-then structure, assertion focus, testability of the design |

Read that table as an instruction about **where to spend effort**. Categories 1, 6, 7, 10, 12 and 13
are almost entirely judgement — that is where a human reviewer, or you, adds value. Categories 2, 14
and 15 you should never review by hand when a system is reachable.

---

## 4. Reporting

Keep this skill's output format, and add the system's findings **above** the judgement ones, because
they are a different kind of claim:

```
## System Findings          (omit when no ADT connection)
### Syntax check
[line / severity / text]
### ATC — variant <name>
[grouped by priority, with check title and location]

## Clean ABAP Review
[the existing Critical / Major / Minor structure]
```

Attribute every finding. "ATC priority 1, check *Obsolete statement*, line 42" is a fact about the
system and is not negotiable. "This method name does not say what it returns" is your judgement and
the author may reasonably disagree. Presenting them in the same voice makes the report harder to act
on and quietly overstates the judgement calls.

If the syntax check reports errors, say so first and stop pretending the rest is a style review — code
that does not compile is not ready for a Clean ABAP pass.

## 5. When there is no system

Every category above is still reviewable by hand; you simply lose the mechanical half. The `abap`
skill's `references/abaplint.md` covers static analysis over serialized abapGit files, which recovers
part of categories 2, 5 and 14 in CI.
