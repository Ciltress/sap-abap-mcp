<div align="center">

[![main](https://github.com/Ciltress/sap-abap-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ciltress/sap-abap-mcp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Ciltress/sap-abap-mcp/blob/main/LICENSE)
[![M8ven Score](https://m8ven.ai/badge/mcp/ciltress-sap-abap-mcp-19n9t6?v=0cef00330b477e3d88d6d9c8c7662539)](https://m8ven.ai/mcp/ciltress-sap-abap-mcp-19n9t6)
[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/ciltress/sap-abap-mcp.git)

</div>

# SAP ABAP MCP Server (ADT and JSON RPC)

An [MCP](https://modelcontextprotocol.io) server that gives an AI agent full read/write access to an
SAP ABAP system through **ADT** (ABAP Development Tools), authenticated with **SPNEGO/Kerberos single
sign-on**, an **X.509 client certificate** or an **OAuth 2.0 bearer token** — no password anywhere in
the configuration. User and password is still available as fallback but not recommended!

It wraps [`abap-adt-api`](https://github.com/marcellourbani/abap-adt-api) and adds one thing ADT itself
cannot do: **calling RFC-enabled function modules**, over the SAP Gateway JSON-RPC 2.0 service.

**128 tools** — object CRUD, source editing, locks, transports, activation, syntax checks, code
completion, ABAP Unit, ATC, DDIC, abapGit, refactoring, traces, the debugger, and RFC calls.

How many a client actually sees is smaller, twice over. **Profiles** (`ABAP_MCP_PROFILE`) trade surface
for context: `core` lists 9 tools where `all` lists 129, which is ~2,700 tokens against ~17,800 on
every turn for a client that cannot fetch tool schemas on demand. And the server **asks the system what
it supports** before listing anything, so a release without the abapGit plugin is never offered the 10
tools that would answer 400. On DEV that leaves 116.

> This is the SSO fork of [`mcp-abap-abap-adt-api`](https://github.com/mario-andreschak/mcp-abap-abap-adt-api)
> by mario-andreschak. The main differences: Kerberos SSO instead of Basic Auth, the JSON-RPC/RFC
> tools, a router derived from the tool definitions, and a documented tool reference.

---

## Documentation

| Document                                                   | What it covers                                                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`AGENTS.md`](AGENTS.md)                                   | Working **on** this repository: layout, conventions, how to test. Read this before changing code.                                                                                                            |
| [`docs/Tool-Router.md`](docs/Tool-Router.md)               | **What you want to do → the tool that does it.** Hand-written, in the words people use. Start here if you know the job but not the tool.                                                                     |
| [`docs/Tool-Reference.md`](docs/Tool-Reference.md)         | All 128 tools with their arguments, grouped by family. Generated from the tool definitions, so it cannot drift from the code.                                                                                |
| [`docs/MCP-Tools.md`](docs/MCP-Tools.md)                   | **How the server behaves.** The profiles, golden-path workflows, ADT URI and lock semantics, the response/error model, and a troubleshooting matrix. Written for humans _and_ for agents driving the server. |
| [`docs/ABAP-Skills.md`](docs/ABAP-Skills.md)               | The 20 SAP/ABAP skills and how they map onto these tools.                                                                                                                                                    |
| [`docs/Development-Skills.md`](docs/Development-Skills.md) | The 35 bundled general engineering skills.                                                                                                                                                                   |
| [`docs/JSON-RPC.md`](docs/JSON-RPC.md)                     | Design and protocol notes for the JSON-RPC / RFC tools, read from the ABAP source of `/IWBEP/CL_JSRPC_*`: the wire protocol, the LUW guarantee behind batches, and the traps.                                |
| [`docs/Authentication.md`](docs/Authentication.md)         | The two password-less logon modes: Kerberos SSO, and X.509 certificates for service and technical users. What SAP needs configured, and why this is mutual TLS rather than SNC.                              |

---

## Features

- **Two password-less logon modes** — SPNEGO/Kerberos with the logged-on Windows user's ticket, or an
  X.509 client certificate for a service or technical user that has no Kerberos identity. No SAP
  password is stored or sent either way, and both self-heal when the session expires.
- **Streamable HTTP transport, for a team sharing one container** — set `ABAP_MCP_TRANSPORT=http` and
  each connecting MCP client authenticates with its own SAP OAuth 2.0 bearer token, so every session
  gets its own SAP logon rather than everyone sharing one technical user. stdio remains the default
  for a single, locally-started client. See [§12](docs/Authentication.md#12-streamable-http-transport-and-per-connection-sessions)
  and [Running over HTTP](#running-over-http) below.
- **Read any object by name** — `readAbapObject` resolves a name to its source in one call; no ADT URL
  to discover or hand-craft.
- **Describe a table** — `describeAbapTable` returns fields, DDIC types, key flags and check tables.
- **Object management** — search, read, create, modify, delete and activate ABAP objects.
- **Survey a naming convention** — `searchPackages` finds packages by pattern (`["ZPP_*","Z_PP*"]`)
  and expands each into its objects grouped by type, in one call.
- **Source workflow** — lock → edit → syntax check → activate → unlock, with transport handling.
- **Code intelligence** — completion, definitions, usage references, ABAP Doc, pretty printer, ATC,
  ABAP Unit, refactoring (rename, extract method).
- **Call RFC function modules** — `callFunctionViaJsonRpc` executes an RFC-enabled function module and
  validates the request against its real signature, read from the system.
- **Batch RFC calls in one LUW** — `callFunctionsViaJsonRpc` sends several function modules in a single
  request, which is what lets an update BAPI and its `BAPI_TRANSACTION_COMMIT` share one LUW.
- **Data access** — `tableContents` and ad-hoc `runQuery` SELECTs.
- **See the running system** — `listLoggedOnUsers` answers "who is logged on" from `TH_USER_LIST`, the
  data behind `SM04`; `readProfileParameters` reads RZ11 values in one round trip; and
  `checkLogonConfiguration` says which authentication the system actually accepts.
- **Bundled agent skills** — 54 skills under [`skills/`](skills), for ABAP (Clean ABAP, RAP, CDS, ATC,
  abapGit…) and general engineering (TDD, code review, diagnosing bugs), served as resources and via
  `readSkill`.
- **Self-documenting** — the guides below are served by the server itself, as MCP resources
  (`abap-adt://guides/…`) and through the `readServerGuide` tool, so an agent can look up a workflow or
  an argument mid-task without leaving the session.

## Prerequisites

- **An SAP ABAP system reachable over ADT.** `/sap/bc/adt` must be active in `SICF`. For the RFC tools,
  `/sap/gw/jsonrpc` must be active as well (`SAP_GWFND`), and your user needs `S_RFC` for the function
  groups you call.
- **A way to log on without a password**, one of:
  - **A working Kerberos login** — the SAP system must accept SPNEGO and you must hold a valid ticket
    (`klist`). This is the default, and it needs **Windows** as shipped: the bootstrap shells out to
    `C:\Windows\System32\curl.exe --negotiate`, which needs curl's Schannel/SSPI backend. On other
    platforms point `SSO_CURL_PATH` at a curl built with GSS-API support.
  - **An X.509 client certificate** — for a service or technical user that has no Kerberos identity.
    Needs neither curl nor Windows. SAP has to be set up for it: the ICM port must request a
    certificate (`VCLIENT` in `icm/server_port_<n>`, which overrides `icm/HTTPS/verify_client`), the
    issuing CA trusted in `STRUST`, and a `CERTRULE` mapping to the user. Full setup — including how
    to check those from this server — in [`docs/Authentication.md`](docs/Authentication.md).
  - **An OAuth 2.0 client** — for an SAP BTP ABAP environment, where there is no Kerberos realm and
    no ICM to configure, or for an on-premise system that publishes ADT through `SOAUTH2`. A BTP
    service key is already one of these. See [§11](docs/Authentication.md).
- **Node.js** (LTS) and npm — verify with `node -v` and `npm -v`.

## Installation

```bash
git clone --recurse-submodules https://github.com/Ciltress/sap-abap-mcp.git
cd sap-abap-mcp
npm install
npm run build
```

> `--recurse-submodules` matters: the general engineering skills live in a submodule, and without it
> that directory is empty and the server offers 35 fewer skills. Already cloned? Run
> `git submodule update --init --recursive`.

> The `npx mcp-abap-abap-adt-api` package on npm is the **upstream** server and does _not_ include the
> SSO bootstrap or the RFC tools. Build this repository from source instead.

### Configure

Copy [`.env.example`](.env.example) to `.env` and fill in your system:

```env
SAP_URL=https://your-sap-server.example.com:44301
SAP_USER=YOUR_SAP_USER
SAP_CLIENT=100
SAP_LANGUAGE=EN
```

`SAP_URL` and `SAP_USER` are required; `SAP_CLIENT` and `SAP_LANGUAGE` are optional but recommended.
Three of the four logon modes need **no** `SAP_PASSWORD` at all.

Never commit `.env`; it is already in `.gitignore`.

| Optional variable                | Effect                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SAP_SYSTEM_ID`                  | The system id, as in `sy-sysid` (e.g. `DEV`). Announced at connect time so a client can pick between several servers by name. See [More than one system](#more-than-one-system). |
| `NODE_TLS_REJECT_UNAUTHORIZED=0` | Accept a certificate from an internal/unknown CA. Development only.                                                                                                              |
| `SSO_CURL_PATH`                  | Path to a curl binary with SPNEGO support, if not the Windows system one.                                                                                                        |
| `SAP_JSONRPC_PATH`               | Override the JSON-RPC ICF path when the node is published under an alias.                                                                                                        |
| `ABAP_MCP_PROFILE`               | Which tools this server lists — and therefore which it will answer. See below.                                                                                                   |
| `ABAP_MCP_MAX_RESPONSE_BYTES`    | Ceiling on a single answer, in bytes. `0` removes it.                                                                                                                            |
| `ABAP_MCP_GATE`                  | `off` skips the startup capability check that withholds tools this release cannot serve.                                                                                         |
| `ABAP_MCP_RFC_FALLBACK`          | Start even when SAP refuses this user the ADT node, keeping the RFC tools. See [docs/Authentication.md](docs/Authentication.md).                                                 |
| `SAP_FALLBACK_BOOTSTRAP_PATH`    | Which ICF node that fallback logs on to. Only needs to issue a session cookie and a CSRF token.                                                                                  |
| `ABAP_MCP_TRANSPORT`             | `stdio` (default) or `http`. See [Running over HTTP](#running-over-http).                                                                                                        |
| `ABAP_MCP_HTTP_PORT`             | Port for the Streamable HTTP endpoint. Default `3000`. Only read in `http` mode.                                                                                                 |
| `ABAP_MCP_HTTP_HOST`             | Address to bind in `http` mode. Default `0.0.0.0`.                                                                                                                               |
| `ABAP_MCP_HTTP_ALLOWED_ORIGINS`  | Browser origins allowed to call `/mcp`, comma-separated; `*` allows any. Empty (the default) serves none. Clients that send no `Origin` are unaffected.                          |
| `ABAP_MCP_HTTP_ALLOWED_HOSTS`    | `Host` values this server answers to in `http` mode, comma-separated. Empty accepts any.                                                                                          |
| `ABAP_MCP_HTTP_RATE_LIMIT`       | Requests per minute per MCP session in `http` mode. `0` (the default) is off.                                                                                                     |

#### Sizing the server for its client

The three `ABAP_MCP_*` variables exist for one reason: **a client that cannot fetch tool schemas on
demand pays for the entire tool list on every single turn.** Claude Code defers schemas and should stay
on the default; an 8B model with a 128k window is spending a sixth of its context before the
conversation starts, and that is where "the same prompt works half the time" comes from.

**`ABAP_MCP_PROFILE`** — unset means `all`, so an existing setup is unchanged.

| profile   | `tools/list` | cost per turn  | for                                                                    |
| --------- | ------------ | -------------- | ---------------------------------------------------------------------- |
| `core`    | 9            | ~2,737 tokens  | reading a system and completing one edit                               |
| `analyst` | 18           | ~3,982 tokens  | read-only: dictionary, table data, RFC calls                           |
| `rfc`     | 10           | ~2,900 tokens  | a user with RFC rights but no `S_DEVELOP`, where ADT tools cannot work |
| `dev`     | 49           | ~8,034 tokens  | the edit cycle plus tests, ATC, transports, refactoring                |
| `all`     | 129          | ~17,759 tokens | the default; right for clients that fetch schemas on demand            |

Counts include `healthcheck`, which sits outside every profile because it is the tool that answers
"which profile am I running?".

A profile is **not** a convenience filter. A tool outside the active profile is not listed _and_ not
routed, so it cannot be called — which is what makes `analyst` a guarantee that nothing edits source
rather than a smaller menu. Out-of-profile calls get an error that says so, instead of "unknown tool",
so there is no point retrying. An unrecognised profile name stops the server at startup rather than
falling back to `all` — silently serving 129 tools to something that asked for 9 is the exact failure
profiles exist to prevent.

`core` is small because one tool, `editAbapSource`, _is_ the write cycle: lock, write, activate, unlock,
releasing the lock even when a step fails. The four separate steps stay in `dev` and `all`.

**`ABAP_MCP_MAX_RESPONSE_BYTES`** — the tool list is a fixed cost a profile can shrink; an answer is
unbounded. On `core` the whole tool list is ~11KB while one `adtDiscovery` is ~42KB. Unset follows the
profile (`core` 24,000 bytes, `analyst` 32,000, `dev` 48,000, `all` no ceiling); `0` removes it.

An over-budget answer is **withheld and replaced by valid JSON** — `status:"truncated"`, the original
`bytes`, the `budget`, a 2,000-byte `preview` and a `nextStep` — never by a cut-off fragment, which
would not parse and would just invite the identical retry.

**`ABAP_MCP_GATE`** — before listing anything the server asks the system what it supports, and withholds
the tools whose ADT collections are absent. On DEV that is the 10 abapGit tools and the 3
service-binding tools, which would otherwise answer HTTP 400. It costs one discovery round trip per
process, can only ever shorten the list, and any failure leaves every tool listed. `ABAP_MCP_GATE=off`
skips it.

`healthcheck` reports all three: the active profile, `responseBudgetBytes`, and anything withheld.

#### A certificate instead of Kerberos

For a service or technical user, add a certificate — that alone switches the mode:

```env
SAP_USER=CLAUDEAGENT                                 # the user CERTRULE maps the certificate to
SAP_CERT_FILE=C:\Users\svc_agent\SNC\sec\claudeagent.p12
SAP_CERT_PASSPHRASE=<PKCS#12 password / PSE PIN>
```

| Optional variable   | Effect                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `SAP_AUTH_MODE`     | `kerberos`, `certificate`, `oauth` or `password`. Only needed to force one mode while another is configured. |
| `SAP_CERT_KEY_FILE` | The private key, when it is not in `SAP_CERT_FILE`.                                                          |
| `SAP_CA_FILE`       | CA bundle for verifying SAP's own certificate, instead of disabling TLS verification.                        |

> This is **mutual TLS, not SNC** — ADT is HTTPS. A certificate that already works for RFC/SNC can be
> reused and its `CERTRULE` mapping carries over, but the `SNC0` ACL plays no part and the ICM needs
> `icm/HTTPS/verify_client`. [`docs/Authentication.md`](docs/Authentication.md) covers the differences,
> the `sapgenpse export_p12` / OpenSSL 3 trap, and how to read a rejected certificate.

#### An OAuth 2.0 client, for BTP and for SOAUTH2

For an SAP BTP ABAP environment, or an on-premise system that publishes ADT behind an authorisation
server. Setting the client id switches the mode:

```env
SAP_OAUTH_TOKEN_URL=https://your-tenant.authentication.eu10.hana.ondemand.com/oauth/token
SAP_OAUTH_CLIENT_ID=sb-abap-agent!t1234              # 'clientid' in a BTP service key
SAP_OAUTH_CLIENT_SECRET=<'clientsecret'>
```

On-premise the endpoint is on the SAP host itself — `https://<host>:<port>/sap/bc/sec/oauth2/token` —
and the client is the one registered in `SOAUTH2`.

| Optional variable         | Effect                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| `SAP_OAUTH_GRANT`         | `client_credentials` (default), `refresh_token`, `password` or `static`.         |
| `SAP_OAUTH_SCOPE`         | Scopes to request. Unset asks for the client's defaults, which is usually right. |
| `SAP_OAUTH_REFRESH_TOKEN` | For the `refresh_token` grant; selects it by itself.                             |
| `SAP_OAUTH_TOKEN`         | A token minted elsewhere, used as-is. Nothing can renew it.                      |
| `SAP_OAUTH_CLIENT_AUTH`   | `basic` (default) or `post`, when a server rejects a secret that is right.       |

> **The token logs on once.** After that the SAP session cookie carries every request, as in the
> other modes — so a token that expires in five minutes is not a problem. Note that an OAuth 2.0
> client on AS ABAP _is_ a user in `SU01`: a wrong `SAP_OAUTH_CLIENT_SECRET` counts against
> `login/fails_to_user_lock` like a password, so a refused token request is never retried. The
> authorization-code flow is not implemented — it needs a browser, which a server started over stdio
> has no way to open; complete it once by hand and pass the refresh token in.
> [`docs/Authentication.md` §11](docs/Authentication.md) has the detail, including which failures are
> latched and why.

#### A password, when there is nothing else

For a system with neither Kerberos nor certificates — a sandbox, a trial, anything off the domain:

```env
SAP_USER=CLAUDEAGENT
SAP_PASSWORD=<the password>
```

> **The last resort, and not interchangeable with the other two.** A missing ticket or an unmapped
> certificate is simply refused; a _wrong password_ counts against `login/fails_to_user_lock` and
> locks that user for every consumer of it, not just this server. The implementation refuses to retry
> a rejected password for that reason — one failed logon, latched, however many tools are called.
> Prefer a certificate for anything unattended. [`docs/Authentication.md` §10](docs/Authentication.md)
> has the detail.

### Register with an MCP client

Point the client at the built entry point with absolute paths:

```json
{
  "mcpServers": {
    "sap-abap-dev-100": {
      "command": "node",
      "args": ["C:/path/to/sap-abap-mcp/dist/index.js"],
      "env": {
        "SAP_URL": "https://your-sap-server.example.com:44301",
        "SAP_USER": "YOUR_SAP_USER",
        "SAP_SYSTEM_ID": "DEV",
        "SAP_CLIENT": "100",
        "SAP_LANGUAGE": "EN"
      }
    }
  }
}
```

The client's `env` block wins over `.env`. Run `npm run start` to launch the server by hand, or
`npm run dev` to drive it through the MCP Inspector.

For a client that carries every tool schema on every turn, add a profile to that same block:

```json
"env": { "…": "…", "ABAP_MCP_PROFILE": "core" }
```

### In Docker

By default the server speaks MCP over **stdio**, so there is no port to publish — the client starts
the container and talks to it over stdin/stdout. This section covers that default; for a container
several team members connect to over the network instead, see [Running over HTTP](#running-over-http)
below.

```bash
docker build -t abap-adt-mcp .
```

```json
{
  "mcpServers": {
    "sap-abap-dev-100": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--env-file",
        "C:/path/to/.env",
        "abap-adt-mcp"
      ]
    }
  }
}
```

**All four logon modes work in here**, but a credential is something the container has to be _given_,
and `--env-file` is not dotenv — Docker strips no quotes, reads no `export`, and drops no trailing
`# comment`, so a value dotenv would have cleaned up arrives verbatim. Windows paths in `.env` have
to be replaced by the mounted ones. Kerberos is the mode that needs the most from the container and
OAuth the least: a token is fetched over the network, so nothing has to be mounted at all.

**Certificate mode** — mount the key material read-only, and the CA that signs _SAP's_ certificate
with it:

```bash
docker run -i --rm --env-file .env \
  -v /host/certs:/certs:ro \
  -e SAP_CERT_FILE=/certs/agent.p12 \
  -e SAP_CA_FILE=/certs/corporate-root.pem \
  abap-adt-mcp
```

**Kerberos mode** — the image carries a curl built against GSS-API and `kinit`, so what is left is a
realm and a credential:

```bash
docker run -i --rm --env-file .env \
  -v /etc/krb5.conf:/etc/krb5.conf:ro \
  -v /host/agent.keytab:/krb5/agent.keytab:ro \
  -e SAP_KRB_KEYTAB=/krb5/agent.keytab \
  -e SAP_KRB_PRINCIPAL=SVC_AGENT@CORP.EXAMPLE.COM \
  abap-adt-mcp
```

**OAuth 2.0 mode** — nothing to mount; the credential is fetched:

```bash
docker run -i --rm --env-file .env \
  -e SAP_OAUTH_TOKEN_URL=https://your-tenant.authentication.eu10.hana.ondemand.com/oauth/token \
  -e SAP_OAUTH_CLIENT_ID='sb-abap-agent!t1234' \
  -e SAP_OAUTH_CLIENT_SECRET=<clientsecret> \
  abap-adt-mcp
```

**Password mode** — Last resort!

```bash
docker run -i --rm --env-file .env \
  -e SAP_USER=YourUser \
  -e SAP_PASSWORD=YourPassword \
  abap-adt-mcp
```

Three things to know before you reach for it:

- **A keytab, not your own ticket.** A container cannot borrow the session's credential the way an
  interactive logon does. On a Linux host you can mount the ticket cache you already have
  (`-v /tmp/krb5cc_1000:/krb5/ccache:ro -e KRB5CCNAME=FILE:/krb5/ccache`), but it expires with the
  host's. **From a Windows host neither works**: the TGT lives in the LSA cache and cannot be written
  to a file — use certificate mode, which needs none of this. The keytab is the only credential that
  runs unattended, and the only one that outlives the ticket lifetime.
- **Verify SAP's certificate, or know that you are not.** The image trusts only the public CA bundle,
  so an internal CA the host trusts is unknown in here and the handshake fails with
  `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Mount the root CA and point `SAP_CA_FILE` at it. Carrying a
  desktop `.env` in wholesale hides this instead: `NODE_TLS_REJECT_UNAUTHORIZED=0` is a development
  setting and has no business in a deployed image.
- **Build from a `--recurse-submodules` clone.** `skills/Development` is a submodule; without it the
  image ships 35 fewer skills.

The image is Debian rather than Alpine for one reason: Alpine's curl is built without GSS-API, and
such a curl does not fail — it simply never sends a token, and SAP answers the same 401 an expired
ticket produces. What is missing is named at startup, on stderr, before a session is attempted. To ask
the container what credential it ended up with, give it a command instead of the server:

```bash
docker run --rm --env-file .env -v /host/agent.keytab:/krb5/agent.keytab:ro \
  -e SAP_KRB_KEYTAB=/krb5/agent.keytab abap-adt-mcp klist
```

`docs/`, `skills/` and `AGENTS.md` are copied into the image on purpose — the server reads them at
runtime to serve `readServerGuide`, `readSkill` and the `abap-adt://` resources.
[`docs/Authentication.md` §7](docs/Authentication.md) has the full container setup, mode by mode.

### Running over HTTP

Everything above starts one server for one client over stdio. Set `ABAP_MCP_TRANSPORT=http` instead to
run a long-lived container that a whole team connects to over the network, using the SDK's Streamable
HTTP transport at `/mcp`.

HTTP mode changes _who logs on_, not what a session can do once logged on: none of the four modes
above — `SAP_AUTH_MODE`, `SAP_CERT_FILE`, `SAP_OAUTH_CLIENT_ID`, `SAP_PASSWORD` — apply here, because
there is no single shared logon to configure. Instead, **every MCP client authenticates with its own
SAP OAuth 2.0 bearer token**: it sends `Authorization: Bearer <token>` on `initialize`, and that token
becomes that session's own SAP identity — its own ADT logon, its own locks, its own audit trail. Two
team members connecting at once get two independent sessions, never one shared technical user.

```bash
docker build -t abap-adt-mcp .
docker run --rm -p 3000:3000 \
  -e SAP_URL=https://your-sap-server.example.com:44301 \
  -e SAP_USER=CLAUDEAGENT \
  -e SAP_CLIENT=100 \
  -e ABAP_MCP_TRANSPORT=http \
  abap-adt-mcp
```

`SAP_USER` is still required (every non-password mode needs a placeholder username to construct the
ADT client) but is never transmitted and has no bearing on who a given session actually is — SAP
decides that from each session's own token, same as in [§11](docs/Authentication.md#11-oauth-20-mode).

| Variable                        | Effect                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ABAP_MCP_TRANSPORT=http`       | Switches from stdio to Streamable HTTP.                                                             |
| `ABAP_MCP_HTTP_PORT`            | Port to listen on. Default `3000`.                                                                  |
| `ABAP_MCP_HTTP_HOST`            | Address to bind. Default `0.0.0.0`.                                                                 |
| `ABAP_MCP_HTTP_ALLOWED_ORIGINS` | Browser origins allowed to call `/mcp`, comma-separated; `*` allows any. Empty (default) serves none. |
| `ABAP_MCP_HTTP_ALLOWED_HOSTS`   | `Host` values answered to, comma-separated. Empty accepts any.                                       |
| `ABAP_MCP_HTTP_RATE_LIMIT`      | Requests per minute per session. `0` (default) is off.                                              |

Register a client the same way as any remote Streamable HTTP MCP server, pointing it at `/mcp` and
supplying that user's own SAP OAuth token:

```json
{
  "mcpServers": {
    "sap-abap-dev-100": {
      "url": "http://your-host:3000/mcp",
      "headers": { "Authorization": "Bearer <your SAP OAuth access token>" }
    }
  }
}
```

A request with no credential is rejected with `401` before any SAP traffic; a token SAP itself refuses
is also `401`, with SAP's own message. There is no separate shared secret to configure for the
transport itself — the SAP token _is_ the access control.

A client that would rather not be disconnected each time its access token expires can send its own
refresh token as `X-SAP-Refresh-Token` instead, and the session renews itself on the `refresh_token`
grant. That needs `SAP_OAUTH_TOKEN_URL` and `SAP_OAUTH_CLIENT_ID` on the container — the client
registration a refresh token is redeemed against is the deployment's, while the refresh token, and
therefore the SAP identity, stays the caller's.

Browser origins are refused unless `ABAP_MCP_HTTP_ALLOWED_ORIGINS` names them: that is the
DNS-rebinding guard the MCP spec asks the server to apply itself, since a rebinding request never
passes through the proxy in front. Allow-listed origins get the matching CORS headers. Clients that
send no `Origin` — every MCP client that is not a web page — are unaffected.

The container's `docker-entrypoint.sh` skips its Kerberos setup automatically when
`ABAP_MCP_TRANSPORT=http` is set, since `resolveAuthMode()`'s pick describes nothing real once every
session logs on with its own token. TLS termination is left to whatever sits in front of the container
(a reverse proxy or ingress), the same as for any other internal HTTP service. Full detail, including
the OAuth grant mechanics this reduces to, is in
[`docs/Authentication.md` §12](docs/Authentication.md#12-streamable-http-transport-and-per-connection-sessions).

### More than one system

A server is bound to one system and one client for its whole life — neither can be switched at
runtime. So register one entry per system/client and give each its `SAP_SYSTEM_ID`:

```json
"sap-abap-dev-100": { "env": { "SAP_SYSTEM_ID": "DEV", "SAP_CLIENT": "100", "…": "…" } },
"sap-abap-dev-200": { "env": { "SAP_SYSTEM_ID": "DEV", "SAP_CLIENT": "200", "…": "…" } },
"sap-abap-q01-100": { "env": { "SAP_SYSTEM_ID": "Q01", "SAP_CLIENT": "100", "…": "…" } }
```

Each server then announces itself in the MCP `instructions` it returns at connect time:

> This server is bound to SAP system **DEV**, client 100 (https://…:44301).
> It cannot switch system or client at runtime — both are fixed by the environment it was started
> with. If a request names a different system or client, use the MCP server configured for that one;
> if none is registered, say so rather than acting here.

That is what lets an agent route "please check this in DEV client 200" to the right server without
calling anything. `healthcheck` reports the same identity for a server that needs asking directly.

**The declaration is checked.** SAP names the system and client in the session cookie it sets at
logon (`SAP_SESSIONID_DEV_100`), so the server knows what it is really connected to. If that
disagrees with `SAP_SYSTEM_ID` — a copy-pasted entry pointing at the wrong host, say — `healthcheck`
carries a `WARNING` and it is logged loudly at startup. Worth watching for, because every tool goes
on working perfectly; just on the wrong system.

---

## Quick tour

Read any object by name — no URL discovery needed:

```jsonc
{"tool":"readAbapObject","args":{"objectName":"ZCL_MY_CLASS"}}
{"tool":"describeAbapTable","args":{"tableName":"T000"}}
```

Survey a whole naming convention — patterns are normalised for you, so `zpp_lab` becomes `ZPP_LAB*`:

```jsonc
{ "tool": "searchPackages", "args": { "patterns": ["ZPP_*", "Z_PP*"] } }
// -> each package with its objects grouped by type, sub-packages, and a `truncated` flag
```

Call a function module — the signature is read first and the request validated against it:

```jsonc
{"tool":"readAbapFunctionModule","args":{"functionModuleName":"STFC_CONNECTION"}}
{"tool":"callFunctionViaJsonRpc","args":{"functionModuleName":"STFC_CONNECTION",
                                         "inputParameters":{"REQUTEXT":"hello"}}}
```

A BAPI and its commit must travel in **one** batch, or the commit lands in its own LUW and the BAPI's
changes are lost:

```jsonc
{
  "tool": "callFunctionsViaJsonRpc",
  "args": {
    "calls": [
      {
        "functionModuleName": "BAPI_USER_LOCK",
        "inputParameters": { "USERNAME": "DEVUSER" },
      },
      {
        "functionModuleName": "BAPI_TRANSACTION_COMMIT",
        "inputParameters": { "WAIT": "X" },
      },
    ],
  },
}
```

The full write cycle (lock → modify → check → activate → unlock), the debugger, ATC and every other
workflow are in [`docs/MCP-Tools.md` §4](docs/MCP-Tools.md#4-golden-paths).

---

## Working with ABAP objects

Three tools cover most of what you need, and each takes a **name** rather than an ADT URL:

| Want                                                              | Tool                |
| ----------------------------------------------------------------- | ------------------- |
| The source of a class, program, include, function group or module | `readAbapObject`    |
| What a table, structure or view looks like                        | `describeAbapTable` |
| Everything behind a naming convention                             | `searchPackages`    |

```jsonc
{"tool":"readAbapObject",   "args":{"objectName":"ZCL_MY_CLASS"}}
{"tool":"describeAbapTable","args":{"tableName":"T000"}}
{"tool":"searchPackages",   "args":{"patterns":["ZPP_*","Z_PP*"]}}
```

`readAbapObject` returns the metadata _and_ the source in one call. When a name belongs to several
objects — `ZPP_EXT_LABEL_DATA` is both a function group and a function module — it picks the more
specific one and tells you, via `ambiguous:true` and `alternatives`; pass `objectType` to force the
choice. Objects with no source come back with `hasSource:false` and a pointer to the right tool.

`describeAbapTable` gives field names, DDIC types, lengths, key flags, data elements, domains and
**check tables** — the check table is the foreign-key target, which is the quickest way to see how two
tables join. `objectStructure` returns no fields for a table, and `tableContents` returns rows rather
than a definition, so neither answers "what does this table look like".

### Rules worth putting in your client's system prompt

- **Prefer the by-name tools.** Only fall back to `searchObject` → `objectStructure` → `getObjectSource`
  when you need the intermediate results. Never hand-craft a `/sap/bc/adt/...` path.
- **Select efficiently.** SAP tables are large. Always constrain `SELECT`s with a `WHERE` clause, and
  use `SELECT SINGLE` (all key fields known) or `UP TO n ROWS` otherwise.

```abap
SELECT vgbel FROM vbrp WHERE vbeln = @lv_vbeln INTO @DATA(lv_vgbel) UP TO 1 ROWS.
  EXIT.
ENDSELECT.
```

SAP is decoupled from your file system: reading source returns it as a tool result only, and writing a
local file changes nothing in SAP. Local copies are useful for diffing, nothing more.

> Earlier READMEs listed `GetTable`, `GetStructure` and `GetTypeInfo`. Those belong to the separate
> [`mcp-abap-adt`](https://github.com/mario-andreschak/mcp-abap-adt) project, not to this server.

---

## Development

```bash
npm run build          # tsc -> dist/
npm test               # vitest: parser, tool catalogue, JSON-RPC handler (no SAP system needed)
npx tsc --noEmit       # type check only
```

Tests live in [`src/__tests__`](src/__tests__) and run entirely offline — the JSON-RPC suite exercises
the handler end to end against a fake SAP Gateway node.

Against a **real** system (needs a Kerberos ticket), the end-to-end check is:

```bash
npm run build
node scripts/live-jsonrpc-check.mjs      # add NODE_TLS_REJECT_UNAUTHORIZED=0 for an internal CA
```

It drives the built server over MCP stdio exactly as a client would, and only calls read-only function
modules.

Adding a tool is a one-file change — see [`docs/MCP-Tools.md` §10](docs/MCP-Tools.md#10-extending-the-server).

## Troubleshooting

| Symptom                                  | Cause / fix                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HTTP 401` on every call                 | Kerberos mode: no valid ticket, or the system does not accept SPNEGO — check `klist` and your VPN/domain connection. Certificate mode: see [`docs/Authentication.md` §6](docs/Authentication.md). |
| `curl nicht gefunden`                    | The SSO bootstrap could not find curl — set `SSO_CURL_PATH`.                                                                                                                                      |
| `SAP rejected the client certificate`    | The `CERTRULE` mapping, `icm/HTTPS/verify_client`, or the CA trust in `STRUST`. The error names the subject that was presented — compare it with `CERTRULE`.                                      |
| `unable to get local issuer certificate` | Internal CA. Set `NODE_TLS_REJECT_UNAUTHORIZED=0` (development only).                                                                                                                             |
| RFC tools return `reachable:false`       | Run `checkJsonRpcEndpoint`. It separates an inactive `/sap/gw/jsonrpc` SICF node from a CSRF or authorisation problem.                                                                            |
| `-32601` from a function module          | It does not exist, is not RFC-enabled, or `S_RFC` denies its function group.                                                                                                                      |
| Client shows no tools                    | Verify the absolute path to `dist/index.js` and that `npm run build` has run.                                                                                                                     |

More in [`docs/MCP-Tools.md` §8](docs/MCP-Tools.md#8-troubleshooting-matrix).

## Contributing

1. Fork the repository
2. `git checkout -b feature/your-feature-name`
3. Make your change, keep `npm test` and `npx tsc --noEmit` green
4. `git commit -m "Add some feature"` and `git push origin feature/your-feature-name`
5. Open a pull request

## License

[MIT](LICENSE). Upstream project and original author: [mario-andreschak](https://github.com/mario-andreschak/mcp-abap-abap-adt-api).
