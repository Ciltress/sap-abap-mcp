---
name: basis
description: Inspect a running SAP system from an ADT session - who is logged on and in which client, how the system is configured, which authentication it accepts, what an application server is doing, short dumps, runtime traces, system identity and connectivity. Use when users ask "who is logged on", "is anyone using the system", "does USER have a session", "can I restart / lock the system", "which users are in client X", "show me the dumps", "what release is this", "is the system reachable", "what is profile parameter X", "does this system accept certificates / SNC / SSO", "why does my logon fail", or mention SM04, AL08, ST22, SM21, SM50, RZ10, RZ11, SNC0, CERTRULE or session and logon questions. This is about the running system, not the repository - for reading or checking code use the abap or clean-abap skills.
license: MIT
---

# Basis

Operational questions about a **running** system, answered from an ADT session rather than SAP GUI.

The repository skills (`abap`, `clean-abap`, `rap`, …) look at what is *in* the system. This one looks
at what the system is *doing*.

## Who is logged on

```jsonc
{"tool":"listLoggedOnUsers","args":{}}
```

Returns a summary rather than a dump: `sessionCount`, `userCount`, then `byUser` (busiest first, ties
alphabetical) and `byClient`. A busy server has hundreds of sessions, and the summary is usually the
whole answer.

```jsonc
{"tool":"listLoggedOnUsers","args":{"currentUserOnly":true,"includeSessions":true}}
{"tool":"listLoggedOnUsers","args":{"user":"SOMEUSER","includeSessions":true}}
{"tool":"listLoggedOnUsers","args":{"client":"100"}}
```

`currentUserOnly` means the user this server connects as — it resolves `SAP_USER` itself, so **do not
hard-code a name to ask "do I have a session"**. Every response also carries `currentUser`, which is
how you tell your own sessions from everyone else's.

Each session carries `tid`, `client`, `user`, `transaction`, `terminal`, `host`, `time`, `guiVersion`,
`rfcType`, the mode counts, and the raw `logonType` / `logonState` / `logonProtocol`.

### Four things to know before you answer

1. **It is one application server, not the system.** `TH_USER_LIST` reports the instance your session
   is connected to — the equivalent of `SM04`, not `AL08`. On a multi-instance system, "nobody is
   logged on" means *nobody on this instance*. Say so rather than implying the system is idle.
2. **`logonType`, `logonState` and `logonProtocol` are raw integers on purpose.** Their data elements
   (`UEXT_TYPE`, `USTATE`, `UPROTOCOL`) have no domain, so the dictionary carries no fixed values and
   any label would be invented. Use the observable fields instead: a `transaction` and a
   `guiVersion` mean a SAP GUI dialog session; an `rfcType` of `I` or `E` means an RFC connection.
3. **Most sessions are not people.** Service users (`SAPJSF_*`, `SM*AGENT*`, `BGRFCSUPER`, `SAPSYS`,
   `RFC*`, `CTMAGENT`, `FC*`) dominate the list. When asked "is anyone using the system", separate named users from
   technical ones instead of quoting the raw count.
4. **A filtered result of zero is not "nobody is on".** The response carries
   `filter.totalBeforeFilter` for exactly this reason — quote it.

### Your own session is in the list

The MCP server holds an HTTP/ICF session, so it appears too, with no `transaction`. It runs as
`currentUser`, which the response names — do not report that session as a person working on the
system.

## How the system is configured

```jsonc
{"tool":"readProfileParameters","args":{"parameters":["rdisp/max_wprun_time","login/fails_to_user_lock"]}}
```

The RZ11 values from the running instance, read in **one** round trip however many you ask for. Names
are case sensitive and spelled exactly as RZ11 spells them.

Two flags per parameter, and they are not the same question:

| | `exists` | `isSet` | Meaning |
| --- | --- | --- | --- |
| `rc: 0`, value `2400` | true | true | Set to that value |
| `rc: 0`, value `""` | true | false | The kernel knows it; it is empty |
| `rc: 4` | false | false | **No such parameter** — usually a typo, or a slot that was never configured |

So `exists:false` is the answer to "did I spell it right", and an empty `value` with `exists:true` means
the parameter is genuinely empty. Observed on DEV: `icm/server_port_4` is empty, `icm/server_port_5`
does not exist.

A parameter that cannot be read reports an `error` on its own entry — the others still come back.
`TH_GET_PARAMETER` raises `NOT_AUTHORIZED` without `S_ADMI_FCD`, and that hits *every* parameter at
once, so "all of them failed" means authorisation, not configuration.

## Which authentication does this system accept

```jsonc
{"tool":"checkLogonConfiguration","args":{}}
```

Reads the logon-relevant parameters and interprets them. Use it before configuring certificate
authentication, or to answer "can this system do X" without guessing.

It answers three things:

- **`certificateLogon`** — whether the ICM asks for an X.509 client certificate **on the port in
  `SAP_URL`**, and what decided that.
- **`ports`** — every `icm/server_port_<n>`, parsed, with `matchesSapUrl` marking yours.
- **`methods`** — certificate, SNC, SAP logon ticket, password, each with its status.

### The trap: `VCLIENT` beats `icm/HTTPS/verify_client`

Client certificates are configured **per port**, as `VCLIENT=1` (request) or `VCLIENT=2` (require)
inside `icm/server_port_<n>`, and the per-port value **overrides** the global
`icm/HTTPS/verify_client`. Reading the global parameter alone is wrong in both directions. On DEV:

```
icm/HTTPS/verify_client = 0                                              ← says "impossible"
icm/server_port_3       = PROT=HTTPS, PORT=44301, …, VCLIENT=1           ← but this port does ask
```

The tool resolves this for you and reports `decidedBy`, so quote that rather than a raw parameter.

### Three things it cannot tell you

1. **STRUST.** Whether the issuing CA is in the SSL server PSE certificate list is not a profile
   parameter. It is in `stillToVerifyManually` for that reason.
2. **CERTRULE.** Whether a certificate is mapped to a user, likewise. `ruleBasedMapping` only says
   whether rule-based mapping is switched on at all (`login/certificate_mapping_rulebased`); with it
   off, only explicit `USREXTID` entries count.
3. **SPNEGO/Kerberos.** Configured in transaction `SPNEGO`, not in a parameter — so it is reported as
   *not determinable* rather than as unsupported. Silence would read as "no".

And if no port matches `SAP_URL`, say so: TLS is probably terminated by a **Web Dispatcher or reverse
proxy**, in which case that host — not this instance — decides whether a certificate is requested. The
tool warns about exactly this.

> `SNC0` and SNC parameters govern **RFC and SAP GUI**. ADT is HTTPS, so a question about certificate
> logon over ADT is answered by `VCLIENT`, never by `SNC0`. See the `authentication` server guide
> (`readServerGuide`).

## Is the system reachable, and which system is it

```jsonc
{"tool":"healthcheck","args":{}}              // this server only - does NOT prove SAP is reachable
{"tool":"adtDiscovery","args":{}}             // proves ADT answers; titles only unless full:true
{"tool":"checkJsonRpcEndpoint","args":{}}     // proves the RFC route answers
{"tool":"callFunctionViaJsonRpc","args":{"functionModuleName":"RFC_SYSTEM_INFO"}}
```

`RFC_SYSTEM_INFO` gives system id, release, kernel, database, host, IP, time zone and code page —
`RFCSI_EXPORT.RFCSYSID`, `RFCSAPRL`, `RFCKERNRL`, `RFCDBSYS`, `RFCHOST`. Establish *which* system you
are on before reporting anything about it; it is easy to answer confidently about the wrong one.

## What went wrong

```jsonc
{"tool":"readShortDumps","args":{}}           // ST22 short dumps
{"tool":"listFeeds","args":{}}                // what feeds this system publishes
{"tool":"tracesList","args":{}}               // SAT/ST12 runtime traces
{"tool":"tracesHitList","args":{"id":"…"}}
{"tool":"tracesDbAccess","args":{"id":"…"}}
```

For a performance question, a trace beats speculation about the code. `tracesCreateConfiguration` sets
one up; `tracesDelete` cleans up afterwards — do that, traces accumulate.

## Users, and the two different questions

These are not the same and are easy to confuse:

| Question | Tool |
| --- | --- |
| Who is logged on **right now** | `listLoggedOnUsers` |
| Which users **exist** in the system | `systemUsers` |
| How may a user log on at all | `checkLogonConfiguration` |

`systemUsers` is the user list used for transport ownership. A user appearing there says nothing about
whether they are on the system now, and vice versa.

## Locks and sessions held by this server

Locks taken with `lock` live in this server's stateful session. If a write fails and you cannot
explain it, check whether an earlier `lock` was never released — `dropSession` ends the session and
drops every lock it holds. That is the escape hatch when `unLock` cannot release one; the next tool
call establishes a fresh session by itself.

## Going beyond these tools

Anything else in the Basis space is one RFC call away, if the function module is RFC-enabled and
`S_RFC` permits it:

```jsonc
{"tool":"readAbapFunctionModule","args":{"functionModuleName":"TH_..."}}
{"tool":"callFunctionViaJsonRpc","args":{"functionModuleName":"TH_...","inputParameters":{}}}
```

Two traps worth knowing:

- **A readable signature does not mean a callable function module.** `readAbapFunctionModule` returns
  a full interface for anything in the dictionary, RFC-enabled or not. `TH_USER_INFO` reads fine and
  fails with `-32601` when called; `TH_USER_LIST`, in the *same* function group, works.
- **That also tells you how to read `-32601`.** `S_RFC` is checked on the function *group*, so if
  another module in the same group answers, `-32601` means "not RFC-enabled" rather than "not
  authorised". To check before calling, list the owning package with `searchPackages` and read its
  `SRFC` ("RFC Services") node, which enumerates the RFC-enabled modules.

Prefer read-only modules. Anything that changes system state — locking the system, cancelling
sessions, deleting jobs — is an operational action: confirm with the user before calling it, and
remember that a JSON-RPC batch shares one LUW, so `BAPI_TRANSACTION_ROLLBACK` as a last member is the
safe way to probe a write.

`readProfileParameters` and `checkLogonConfiguration` grew out of exactly this route — they wrap
`TH_GET_PARAMETER` (group `THFB2`, RFC-enabled, read-only). Reach for the tool rather than the raw call:
it batches, and it knows that `rc: 4` means "no such parameter".

## Reporting

Answer the question that was asked, with the number that supports it:

> 81 sessions on this application server across 9 clients. Of the 13 users, only one is a named user
> — the configured `currentUser`, with 3 sessions in client 100: one SAP GUI in SE37, two HTTP (one
> of them this server). The rest are service users — `SAPJSF_*` on 501/502/503/517/567, plus
> `BGRFCSUPER`, `SAPSYS` and the monitoring agents.

Say which application server, and say when the picture is per-instance rather than system-wide.
