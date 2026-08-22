# Authentication

This server supports four ways of proving who it is, and all four end in the same place — SAP
session cookies plus a CSRF token, injected into the ADT client before any request.

| Mode                 | For                                                                               | Needs                                                                   |
| -------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `kerberos` (default) | A domain user working interactively                                               | A Kerberos ticket (`klist`), `curl --negotiate`                         |
| `certificate`        | A **service or technical user** with no Kerberos identity                         | An X.509 client certificate and its private key                         |
| `oauth`              | An **SAP BTP ABAP environment**, or a system that publishes ADT through `SOAUTH2` | A token endpoint and an OAuth 2.0 client — see [§11](#11-oauth-20-mode) |
| `password`           | A system that offers none of the above                                            | `SAP_USER` and `SAP_PASSWORD`                                           |

Certificate mode exists because a technical user has no Windows logon to borrow a ticket from. It is
the mode to use for anything that runs unattended **on-premise**. OAuth mode is its equivalent where
there is no ICM to configure and no Kerberos realm to join — which is every ABAP system on BTP.

**Password mode is the last resort, and it is worth knowing why before choosing it.** The other two
cannot fail in a way that harms the system: a missing ticket or an unmapped certificate is refused and
nothing else happens. A password can be _wrong_, and SAP counts every wrong one against
`login/fails_to_user_lock` — so a typo in a config file locks that user for **every** consumer of it,
not just this server. On a shared technical account that is an outage, and it is caused by the client
rather than suffered by it.

The mode exists because not every system has an alternative. A sandbox, a trial, a partner system
reached over the internet, or anything outside the corporate domain has a user and a password and
nothing else. See [§10](#10-password-mode) for what the implementation does about the lock risk.

---

## 1. Certificate mode is mutual TLS, not SNC

This matters more than anything else on this page, because the SAP-side setup differs.

**SNC secures the RFC protocol.** A `sapgenpse` PSE, `snc/identity/as`, the `SNC0` ACL and
`sapcrypto.dll` are all RFC concepts. This server does not speak RFC: it speaks **ADT over HTTPS**, and
its RFC tools tunnel through the SAP Gateway JSON-RPC service — which is also HTTPS. The HTTPS
equivalent of SNC is **mutual TLS**: the certificate is presented in the TLS handshake, and the ICM
maps it to a user.

So if you followed a _SNC certificate_ runbook (for example a corporate one for the `pyrfc`-based RFC
MCP server), what carries over and what does not:

| From the SNC setup                           | Here                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| The certificate and its private key          | **Reused as-is** — same key pair, same DN                                       |
| The signing by the corporate PKI             | **Reused**                                                                      |
| `CERTRULE` mapping to the SAP user           | **Reused** — the same rule serves HTTPS logon                                   |
| `SNC0` ACL entry                             | **Not used.** That is RFC only                                                  |
| `snc_partnername` / `snc_qop` / `snc_myname` | **Not used.** No SNC handshake happens                                          |
| `SNC_LIB`, `SECUDIR`, `sapcrypto.dll`        | **Not used.** Node does TLS itself                                              |
| —                                            | The ICM port must request a certificate (`VCLIENT` / `icm/HTTPS/verify_client`) |
| —                                            | The issuing CA must be trusted in `STRUST`                                      |

The practical consequence: **a certificate that works for RFC/SNC does not automatically work for
ADT.** The user mapping is shared, the transport configuration is not.

---

## 2. What SAP needs, once

Four things, in the order they are usually missing:

1. **`CERTRULE` maps the certificate to a SAP user.** Import the certificate, choose _Explicit
   Mapping_, name the user. This is the same entry an SNC setup makes, so if RFC already works this is
   already done. Rule-based mapping needs `login/certificate_mapping_rulebased = 1`.
2. **The ICM asks for a client certificate on the port you connect to.** This is set **per port**, as
   `VCLIENT=1` (request) or `VCLIENT=2` (require) inside `icm/server_port_<n>` — and the per-port value
   **overrides** the global `icm/HTTPS/verify_client`. Checking only the global parameter is
   misleading in both directions: a system with `icm/HTTPS/verify_client = 0` can still request
   certificates on a port whose `VCLIENT=1`.
3. **The issuing CA is in the server's SSL PSE certificate list** (`STRUST` → _SSL server Standard_ →
   certificate list). Without it the ICM cannot verify the chain and drops the handshake.
4. **The ICF node allows certificate logon** (`SICF`, logon data).

Ask Basis for 2 and 3 by name — they are ICM-level and not something a developer can set.

### Checking 1 and 2 from here

There is a tool for this, so the state of a system can be established before anyone is asked to change
anything:

```jsonc
{ "tool": "checkLogonConfiguration", "args": {} }
```

It reads the profile parameters over the RFC route, finds the ICM port that matches `SAP_URL`, and
resolves `VCLIENT` against the global parameter for you:

```jsonc
"certificateLogon": {
  "possibleOnThisPort": true,
  "port": "44301",
  "mode": "requested",
  "decidedBy": "VCLIENT=1 on icm/server_port_3",
  "globalVerifyClient": "0",
  "ruleBasedMapping": true,
  "stillToVerifyManually": ["…STRUST…", "…CERTRULE…"]
}
```

That output is from DEV, and it is the case that makes the trap concrete: the global parameter says
`0` while the port this server connects to asks for a certificate anyway.

Points 3 and 4 stay manual — `STRUST` and `CERTRULE` are not profile parameters, which is what
`stillToVerifyManually` is telling you.

For anything else in the profile, `readProfileParameters` takes a list of names and reads them all in
one round trip. Both tools go through `TH_GET_PARAMETER` (function group `THFB2`), which is RFC-enabled
and read-only; it needs `S_ADMI_FCD`, and without it _every_ parameter fails at once.

---

## 3. Getting the key material into a form Node can read

The private key is in the PSE. Node cannot read a PSE, so export it once. Either shape works:

```powershell
# From the PSE the SNC setup produced. Prompts for the PSE PIN.
$env:SECUDIR = "C:\Users\<YourUser>\SNC\sec"
& $SAPGENPSE export_p12 -p "$env:SECUDIR\SAPSNCS.pse" "$env:SECUDIR\claudeagent.p12"
```

If you never had a PSE, a PKCS#12 from any source is fine, as is a PEM file holding the certificate
and the key.

> **`sapgenpse export_p12` writes a legacy PKCS#12.** It encrypts with RC2-40/3DES, which OpenSSL 3 —
> and therefore Node 18 and newer — refuses outright. The server reports this specifically rather than
> as a generic TLS error. Re-wrap it once:
>
> ```bash
> openssl pkcs12 -legacy -in claudeagent.p12 -nodes -out claudeagent.pem
> openssl pkcs12 -export -in claudeagent.pem -out claudeagent-modern.p12
> ```
>
> Or skip PKCS#12 entirely and point `SAP_CERT_FILE` at the `.pem` — this server reads both.

Whichever file you end up with, treat it as a credential: it is the private key. Keep it out of the
repository and readable only by the account running the server.

---

## 4. Configuration

```bash
SAP_URL=https://your-sap-server.example.com:44301   # https, always — TLS is what carries the certificate
SAP_USER=CLAUDEAGENT                                # the user CERTRULE maps the certificate to
SAP_CLIENT=100
SAP_LANGUAGE=EN

SAP_CERT_FILE=C:\Users\svc_agent\SNC\sec\claudeagent.p12
SAP_CERT_PASSPHRASE=<the PKCS#12 password / PSE PIN>
```

| Variable              | Meaning                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SAP_AUTH_MODE`       | `kerberos`, `certificate`, `oauth` or `password`. Optional — `SAP_CERT_FILE` already selects certificate mode, `SAP_OAUTH_CLIENT_ID` selects OAuth and `SAP_PASSWORD` selects password mode. Set it explicitly to force Kerberos while one of those is configured. |
| `SAP_PASSWORD`        | Password mode only, and the last resort — see [§10](#10-password-mode). Ignored when a certificate is configured, and read as the resource owner's password by the OAuth `password` grant.                                                                         |
| `SAP_OAUTH_*`         | OAuth 2.0 mode — see [§11](#11-oauth-20-mode).                                                                                                                                                                                                                     |
| `SAP_CERT_FILE`       | PKCS#12 (`.p12`/`.pfx`) or PEM holding the client certificate. The extension decides how it is opened.                                                                                                                                                             |
| `SAP_CERT_KEY_FILE`   | The private key, when it is not in `SAP_CERT_FILE`. A PEM usually holds both, in which case leave this unset.                                                                                                                                                      |
| `SAP_CERT_PASSPHRASE` | PKCS#12 password or PEM key passphrase. For a PSE export this is the PSE PIN.                                                                                                                                                                                      |
| `SAP_CA_FILE`         | CA bundle for verifying **SAP's own** certificate, when it comes from an internal CA. The alternative is `NODE_TLS_REJECT_UNAUTHORIZED=0`, which is development only.                                                                                              |

`SAP_USER` stays required. It is **not transmitted** in certificate mode — SAP decides the user from
the `CERTRULE` mapping — but it is what `healthcheck` and `listLoggedOnUsers` report as the current
user, so it has to agree with the mapping or those answers will be wrong. In password mode it _is_
transmitted, and is the user being authenticated.

Neither Kerberos nor certificate mode has a password. `SAP_PASSWORD` exists for the third mode only,
and setting it while a certificate is configured does nothing.

> The passphrase sits in the environment, and an unencrypted PEM has no passphrase at all — so in both
> cases what actually protects the key is **file permissions on the certificate and on the client
> configuration**. Restrict both to the account running the server. `.gitignore` already excludes
> `*.p12`, `*.pfx`, `*.pem`, `*.key` and `*.pse` so key material cannot be committed by accident.

### Client entry

```jsonc
{
  "mcpServers": {
    "sap-abap-s11-010": {
      "command": "node",
      "args": ["C:\\path\\to\\sap-abap-adt-mcp\\dist\\index.js"],
      "env": {
        "SAP_URL": "https://sapdev.example.com:44352",
        "SAP_USER": "CLAUDEAGENT",
        "SAP_CLIENT": "010",
        "SAP_LANGUAGE": "EN",
        "SAP_CERT_FILE": "C:\\Users\\svc_agent\\SNC\\sec\\claudeagent.p12",
        "SAP_CERT_PASSPHRASE": "…",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0",
      },
    },
  },
}
```

---

## 5. Checking it worked

The server writes its identity to stderr at startup — stdout is the MCP frame stream and must stay
clean:

```
[MCP] authenticated via client certificate as CLAUDEAGENT — CN=CLAUDEAGENT, OU=SAPsncClaudeCode, O=ExampleOrg, C=DE, valid to Jun 30 00:00:00 2029 GMT
```

`healthcheck` reports the same thing at any time, without establishing an ADT session:

```jsonc
{ "tool": "healthcheck", "args": {} }
```

```jsonc
"session": {
  "user": "CLAUDEAGENT",
  "authMode": "certificate",
  "certificate": {
    "subject": "CN=CLAUDEAGENT, OU=SAPsncClaudeCode, O=ExampleOrg, C=DE",
    "issuer": "CN=ExampleOrg-SubCA02, O=ExampleOrg, C=DE",
    "validTo": "Jun 30 00:00:00 2029 GMT",
    "daysUntilExpiry": 1047
  }
}
```

The `subject` is the string to compare with the `CERTRULE` entry — a mapping that does not match is by
far the most common reason for a rejected logon, and it is invisible from the SAP side.

`daysUntilExpiry` is worth watching. These certificates are issued for three years and then stop
working on a Tuesday morning, presenting as an authorisation problem rather than an expiry. The server
warns on stderr inside the last 30 days.

### The reachability probe

`healthcheck` also pings SAP at two layers and reports the result under `reachability`. It still never
establishes an ADT session — which is what lets it answer when everything else has stopped working —
but it does say whether SAP is there:

```jsonc
"reachability": {
  "checked": true,
  "ok": false,
  "layer": "icf",
  "summary": "sapdev.example.com:44304 is up — /sap/public/ping answered 200 — but will not serve /sap/bc/ping (HTTP 403), and offered no logon",
  "advice": "Nothing was authenticated here. SAP returned 403 without offering a logon, …",
  "endpoints": [
    { "path": "/sap/public/ping", "status": 200 },
    { "path": "/sap/bc/ping",     "status": 403 }
  ],
  "observed": { "systemId": "P01", "client": "200" }
}
```

The pair is the point, and one endpoint alone cannot replace it:

| `/sap/public/ping` | `/sap/bc/ping` | `layer`   | What it means                                                         |
| ------------------ | -------------- | --------- | --------------------------------------------------------------------- |
| no answer          | no answer      | `network` | DNS, routing, the port or the VPN. SAP is not involved                |
| TLS failure        | TLS failure    | `tls`     | SAP's server certificate is not trusted here — `SAP_CA_FILE`          |
| 200                | 200            | `ok`      | Host, ICF and logon all working                                       |
| 200                | 403 / 404      | `icf`     | SAP is up and will not serve the node. **No credential was examined** |
| 200                | 401            | `logon`   | The ICF serves it; SAP refused the credential                         |

`layer: "icf"` is the one worth dwelling on. SAP answers 403 _before_ offering a logon, so the ticket,
the user and the authorisations play no part — the ICF node is inactive (SICF) or something in front
of the port is filtering. Read as an authentication failure it sends you to `klist` for a problem that
`klist` cannot see, which is exactly what happened on two systems before this existed.

`observed` comes from the `SAP_SESSIONID_<SID>_<CLIENT>` cookie when the logon worked, and from the
`Basic realm="SAP NetWeaver Application Server [P01/200]"` header when it did not — so a server
pointed at the wrong system is visible even while that system is refusing it.

When the probe fails, `status` becomes `degraded` rather than `healthy`. When there is no transport to
probe with, `reachability` is `{"checked": false}` and nothing is claimed either way.

The probe proves the _host and the logon_, not ADT. To prove the ADT services themselves answer, use
`adtDiscovery` or `checkJsonRpcEndpoint`. (`adtCoreDiscovery` was removed: it answered 400 on every
system tested, which is why it made a poor liveness probe.)

---

## 6. When it fails

| Symptom                                                                 | Cause                                                         | Fix                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `SAP rejected the client certificate (HTTP 401)`                        | The four preconditions in §2 — usually the `CERTRULE` mapping | Compare the `subject` in the error with the `CERTRULE` entry, character for character |
| The same, and the port has no `VCLIENT`                                 | The ICM never asked for a certificate, so none was sent       | Read `icm/server_port_<n>` for your port — §2                                         |
| Same, and `No client certificate was loaded for this connection at all` | Certificate mode is not actually on                           | Check `SAP_CERT_FILE` reached the process; `healthcheck` shows `authMode`             |
| `uses a PKCS#12 encryption that OpenSSL … refuses`                      | `sapgenpse export_p12` legacy encryption                      | Re-wrap or use PEM — §3                                                               |
| `wrong or missing SAP_CERT_PASSPHRASE`                                  | PKCS#12 password / PSE PIN wrong                              | —                                                                                     |
| `is not readable as PEM`                                                | A PKCS#12 or DER file not named `.p12`/`.pfx`                 | Rename, or `certutil -encode` a DER to PEM                                            |
| `The *server* certificate … was not trusted`                            | SAP's own certificate is from an internal CA                  | `SAP_CA_FILE`, or `NODE_TLS_REJECT_UNAUTHORIZED=0` for development                    |
| `The TLS handshake … failed (ECONNRESET)`                               | The ICM asked for a certificate and rejected the one offered  | CA not in `STRUST`, or the certificate has expired                                    |
| `Certificate authentication needs an https URL`                         | `SAP_URL` is `http://`                                        | A certificate travels in the TLS handshake; there isn't one                           |
| `needs SAP_CERT_FILE`                                                   | Certificate mode without a certificate                        | Set it, or set `SAP_AUTH_MODE=kerberos`                                               |

And in Kerberos mode:

| Symptom                                                                               | Cause                                                                                                    | Fix                                                                                                                                           |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `SAP refused the request before offering a logon (HTTP 403)`                          | The ICF node is not active, or a Web Dispatcher is filtering the path. **Not** an authentication problem | SICF: activate `/default_host/sap/bc/adt` with its subtree. Confirm with Eclipse ADT, which fails identically                                 |
| `SAP received a Kerberos token and rejected it (HTTP 401)`, SAP falls back to `Basic` | The ticket reached SAP and could not be mapped to a user                                                 | The user must exist and be unlocked **in that client**; check the SPNEGO/`USREXTID` mapping. `klist` will look healthy and is a dead end here |
| `SPNEGO/Kerberos authentication failed … and no token was sent`                       | No ticket was offered at all                                                                             | `klist` — is there a TGT, has it expired, is the VPN up?                                                                                      |
| `curl was not found`                                                                  | No curl with GSS/Schannel support on `PATH`                                                              | Set `SSO_CURL_PATH`. Node cannot do SPNEGO, which is why curl is shelled out to                                                               |

A logon that fails at startup takes the process with it, so the client sees a server that died rather
than an error. The message is therefore the whole diagnosis: the reachability probe runs on the way
out and appends the layer that refused, both endpoint statuses, and the system SAP named for itself.

### When the certificate works and ADT still refuses

There is one failure that is neither authentication nor a dead system, and it looks like both. The
certificate logon succeeds — SAP issues a session cookie — and then every `/sap/bc/adt/*` request
comes back `403`. The give-away is that **the 403 carries a session cookie**: SAP knows who you are
and is refusing the resource.

This is what a technical user looks like when it has RFC authorisations and no `S_DEVELOP`. Such a
user is usually `USTYP = 'B'` (System) with integration roles and no developer role, and SAP serves it
`/sap/gw/jsonrpc` perfectly while refusing ADT outright.

`/sap/bc/ping` tells the two apart in one request, because it needs a logon but is not ADT:

| `/sap/bc/ping`           | `/sap/bc/adt/discovery` | What it is                                     |
| ------------------------ | ----------------------- | ---------------------------------------------- |
| 401                      | 401                     | The certificate is not mapped — `CERTRULE`, §2 |
| **200 + session cookie** | **403**                 | Mapped and logged on. Missing `S_DEVELOP`      |
| 200                      | 200                     | Working                                        |

**The fix is `S_DEVELOP`**, plus a user type of Service (`S`) or Dialog (`A`). Everything below is a
way to get value out of the system while that is being arranged — not a substitute for it.

#### Running without ADT

The RFC route needs a CSRF token, and a token only comes from a logged-on ICF node. The ADT bootstrap
is where the server normally gets one, so ADT's 403 costs the RFC tools too, even though SAP would
serve them. `ABAP_MCP_RFC_FALLBACK=1` takes the session from a node this user _does_ reach:

```jsonc
"env": {
  "…": "…",
  "ABAP_MCP_RFC_FALLBACK": "1",
  "ABAP_MCP_PROFILE": "rfc"
}
```

The server then starts, and says so on stderr before the identity line:

```
[MCP] WARNING: SAP refused this user the ADT node and the session came from
/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ instead. The RFC/JSON-RPC tools work; every ADT
tool will fail at call time. Grant S_DEVELOP to fix it properly — see docs/Authentication.md.
```

`healthcheck` reports `status: "degraded"` and names it, so an agent can tell this apart from a stale
session and stop retrying:

```jsonc
"session": {
  "adtAvailable": false,
  "loggedOnVia": "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/",
  "note": "SAP refused this user the ADT node, so the session was taken from the fallback node. …"
}
```

`ABAP_MCP_PROFILE=rfc` is the other half, and matters as much: without it the server lists all 129
tools, of which 119 cannot work, and an agent spends its turns discovering that one call at a time.
The profile lists the ten that answer — the JSON-RPC tools, `describeAbapTable` (which reads
`DDIF_FIELDINFO_GET` over RFC rather than through ADT), the Basis tools, and the two documentation
tools that need no session at all.

Two things this deliberately does not do. It is **off by default**, because a logon failure is a
diagnosis and quietly downgrading it to "some tools error later" is how the real problem goes
unnoticed for a week. And when the fallback node fails too, the **original ADT error** is what gets
thrown — that a second node also refused the credential adds nothing and points at the wrong ICF node.

`SAP_FALLBACK_BOOTSTRAP_PATH` overrides the node. It only has to be one this user reaches that issues
a session cookie and a CSRF token; the OData catalog service is the one such a user reliably has.

A bad passphrase or an unreadable certificate fails at **startup** too, not on the first tool call —
the key material is parsed while the server is coming up, so a misconfiguration shows itself
immediately.

---

## 7. In a container

Every mode runs in the Docker image, and the difference between them is the whole point of this
section: **a certificate is a file, and a Kerberos credential is a session the container is not part
of.** One is mounted, the other has to be reconstructed. OAuth is the third case and the easiest —
the credential is _fetched_, so there is nothing to mount and nothing to reconstruct; a token
endpoint the container can reach is the whole requirement.

### What the image provides

|                                     | Why it is there                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:22-bookworm-slim`, not Alpine | Debian's curl is linked against GSS-API. Alpine's is not — and that failure is invisible: such a curl does not error, it never sends a token, and SAP answers the same 401 an expired ticket produces |
| `krb5-user`                         | `kinit`, because a keytab is the only credential a container can hold unattended, and `klist`, which is the first thing to run when a logon fails                                                     |
| `docker-entrypoint.sh`              | Prepares the credential, then `exec`s the server. Everything it prints goes to **stderr** — stdout is the MCP frame stream                                                                            |
| No `/etc/krb5.conf`                 | The placeholder `krb5-config` installs names a realm that does not exist. It is deleted so that "the operator mounted a krb5.conf" is distinguishable from "the package is installed"                 |

The entrypoint does not re-implement `resolveAuthMode()` — it calls the server's own compiled copy,
loading `.env` the way `index.ts` does. The script and the process it starts therefore cannot disagree
about which credential is in play, and an unusable `SAP_AUTH_MODE` is rejected before anything else is
attempted, in the server's own wording.

### Certificate mode: two mounts

```bash
docker run -i --rm --env-file .env \
  -v /host/certs:/certs:ro \
  -e SAP_CERT_FILE=/certs/agent.p12 \
  -e SAP_CA_FILE=/certs/corporate-root.pem \
  abap-adt-mcp
```

The entrypoint does nothing here but hand over. **The second mount is the one that gets forgotten.**
The image trusts only the public CA bundle, so the internal CA that signs _SAP's own_ certificate — the
one the host has trusted since it joined the domain — is unknown inside the container, and the
handshake fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` before any of §2 comes into play. Copying a
desktop `.env` in wholesale hides that rather than fixing it: `NODE_TLS_REJECT_UNAUTHORIZED=0` is a
development setting, and an image is not development.

### Kerberos mode: a realm and a credential

```bash
docker run -i --rm --env-file .env \
  -v /etc/krb5.conf:/etc/krb5.conf:ro \
  -v /host/agent.keytab:/krb5/agent.keytab:ro \
  -e SAP_KRB_KEYTAB=/krb5/agent.keytab \
  -e SAP_KRB_PRINCIPAL=SVC_AGENT@CORP.EXAMPLE.COM \
  abap-adt-mcp
```

**The realm**, because MIT krb5 cannot look for a KDC without one. Three ways, and the entrypoint takes
the first that applies: `KRB5_CONFIG` pointing at your own file; a `/etc/krb5.conf` mounted from the
host; or `SAP_KRB_REALM`, from which it generates a minimal `/tmp/krb5.conf` that finds the KDC by DNS
SRV record (add `SAP_KRB_KDC` when there is none). For Active Directory the realm is the domain name in
upper case.

That generated file sets `rdns = false`, which is worth knowing about if you mount your own. With
reverse DNS on — the default — the service principal is built from whatever PTR the container's
resolver returns for SAP's address rather than from the host name in `SAP_URL`, so the ticket is
requested for a name SAP holds no key for. On a developer machine the two usually agree. Inside Docker
they often do not, and the resulting 401 reads exactly like a missing SPNEGO mapping.

**The credential**, of which there are two kinds:

|                                           |                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A keytab** — `SAP_KRB_KEYTAB`           | The only one that works unattended, and the only one that outlives the ticket. The entrypoint runs `kinit -k -t` immediately, so a wrong principal or a stale KVNO fails at startup and says which, and it exports `KRB5_CLIENT_KTNAME` — with a client keytab set, MIT krb5 acquires a fresh TGT by itself when the cached one expires, so a container running for days does not stop working after ten hours |
| **A mounted ticket cache** — `KRB5CCNAME` | A ticket the host already holds: `-v /tmp/krb5cc_1000:/krb5/ccache:ro -e KRB5CCNAME=FILE:/krb5/ccache`. Zero setup, and it expires when the host's does. Mounted read-only it also cannot be refreshed in place, which is the second reason it is not the unattended answer                                                                                                                                    |

`KRB5CCNAME` defaults to `FILE:/tmp/krb5cc` in the image, because the server runs as `node` (uid 1000)
and owns nothing else. A keytab mounted from a Linux host keeps that host's ownership, so one that is
root-owned and `0600` is unreadable in the container however plainly it is mounted.

When there is no credential at all the entrypoint stops there rather than starting the server. That is
the same contract as a failed logon — the process dies and the client sees a server that did not come
up — and the message names the two mounts rather than sending you to `klist`, which is the wrong advice
in a container.

### A Windows host cannot pass its ticket in

This is a property of Windows, not of this image. The TGT lives in the LSA cache, and the session key
is deliberately withheld from user space: exporting it needs the `allowtgtsessionkey` registry value
and a tool whose other users are on red teams. It is not a deployment step, and no `-v` reaches it.

So from a Windows host: **certificate mode**, which needs none of it. Kerberos in a container is for a
Linux host or CI, with a keytab issued for a service account.

### Variables this adds

| Variable            | Meaning                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SAP_KRB_KEYTAB`    | Path _inside the container_ of a read-only mounted keytab. A keytab is a password in another form — `.gitignore` and `.dockerignore` both exclude `*.keytab` so one cannot be committed or baked into a layer |
| `SAP_KRB_PRINCIPAL` | Which principal in the keytab to use. Defaults to the first one `klist -k` lists, which is right more often than `kinit`'s own default of `host/<hostname>` — a name nothing in a container has a key for     |
| `SAP_KRB_REALM`     | The realm, when no `krb5.conf` is mounted. Active Directory: the domain in upper case                                                                                                                         |
| `SAP_KRB_KDC`       | The KDC host, when it has no DNS SRV record                                                                                                                                                                   |
| `KRB5CCNAME`        | The ticket cache. Set it to a mounted one to use a ticket the host already has                                                                                                                                |
| `KRB5_CONFIG`       | Your own krb5 configuration, ahead of both `/etc/krb5.conf` and `SAP_KRB_REALM`                                                                                                                               |

### Checking it

The container reports what it did on stderr, before the server's own identity line:

```
krb5: generated /tmp/krb5.conf for realm CORP.EXAMPLE.COM
krb5: obtained a ticket for SVC_AGENT@CORP.EXAMPLE.COM from /krb5/agent.keytab
[MCP] authenticated via Kerberos as SVC_AGENT
```

A command given to `docker run` replaces the server but keeps all of that, so the container can be
asked what credential it ended up with without starting a session:

```bash
docker run --rm --env-file .env \
  -v /host/agent.keytab:/krb5/agent.keytab:ro -e SAP_KRB_KEYTAB=/krb5/agent.keytab \
  abap-adt-mcp klist
```

`healthcheck` then answers the SAP half, including the two-layer reachability probe — which in a
container is running over the same GSS-API curl as the logon, so its `layer` is trustworthy here in a
way it would not be on an image without one.

### When it fails, in here specifically

| Symptom                                                               | Cause                                                                                  | Fix                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `exec /usr/local/bin/docker-entrypoint.sh: no such file or directory` | The entrypoint was checked out with CRLF, so its shebang reads `/bin/sh\r`             | `.gitattributes` pins `*.sh` to LF; re-check-out the file after picking that up                         |
| `curl … built without SPNEGO support`                                 | The image was rebuilt on Alpine                                                        | Debian, for the reason in the table above                                                               |
| `this container has no krb5 configuration`                            | No realm to ask in                                                                     | Mount `/etc/krb5.conf`, or set `SAP_KRB_REALM`                                                          |
| `this container holds no credential`                                  | Kerberos mode with neither keytab nor ticket cache                                     | The two mounts above — or certificate mode                                                              |
| `SAP_KRB_KEYTAB points at … which this container cannot read`         | Host ownership carried across the bind mount; the server is uid 1000                   | Relax the file and restrict the directory around it                                                     |
| `kinit could not get a ticket`                                        | Wrong principal, stale KVNO after a password change, or no route to the KDC on port 88 | `klist -k` on the keytab lists what is actually in it                                                   |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`                                   | SAP's own certificate is signed by a CA the image does not know                        | Mount the root CA, `SAP_CA_FILE`                                                                        |
| Every `readServerGuide` / `readSkill` answers file-not-found          | `docs/`, `skills/` or `AGENTS.md` missing from the image                               | They are copied in deliberately; a `--recurse-submodules` clone is also needed for `skills/Development` |

---

## 8. Why the placeholder password is safe

`ADTClient` will not accept an empty password, so in the two password-less modes it is constructed
with `'unused-sso-placeholder'`. That value is never sent: the session cookies and CSRF token are
injected before the first request, which stops `AdtHTTP` from ever running its own Basic Auth logon.

This is worth stating because of what the alternative would cost. A technical user is subject to the
same `login/fails_to_user_lock` policy as anyone else, and a handful of Basic Auth attempts with a
placeholder would lock the account for every consumer of it, not just this server.

**Password mode passes the real password instead**, for the same reason rather than despite it. The
session is injected there too, so the password is not normally sent after the logon — but if
`AdtHTTP` ever did run a logon of its own, the placeholder would guarantee that it failed. Giving it
a credential that works removes the failure path rather than relying on it never being taken.

---

## 9. How it works

Kerberos mode shells out to `curl --negotiate` because Node cannot do SPNEGO. Certificate mode needs
no such help — TLS client certificates are native — so it talks to SAP directly:

1. `resolveAuthMode()` picks the mode from the environment.
2. `createCertificateAgent()` loads the key material and builds one `https.Agent`. It parses the
   certificate eagerly so failures land at startup.
3. That **same agent** is handed to `ADTClient`, so every ADT and JSON-RPC request presents the
   certificate too — not just the logon. With `icm/HTTPS/verify_client = 2` the ICM demands one on
   every handshake, and a logon-only certificate would fail on the second call.
4. `bootstrapCertificateSession()` fetches `/sap/bc/adt/compatibility/graph` with
   `x-csrf-token: fetch`, and harvests the session cookies and the token.
5. `injectSsoSession()` puts them on the ADT client — shared with the Kerberos path.

Session expiry is handled identically in both modes: the retry in `index.ts` re-runs whichever
bootstrap applies, on a CSRF rejection or a 401.

The code is [src/certauth.ts](../src/certauth.ts), tested in
[src/**tests**/certauth.test.ts](../src/__tests__/certauth.test.ts) — which includes a real mutual-TLS
exchange against a local server configured the way `verify_client = 2` configures the ICM, so the
handshake is genuinely exercised rather than stubbed.

---

## 10. Password mode

The mode to use when a system offers neither of the other two. Everything here is about one fact:
**a rejected password is not a free failure.** SAP counts it against `login/fails_to_user_lock`, and
the account it eventually locks is shared with every other consumer of that user.

### Configuration

```bash
SAP_URL=https://your-sap-server.example.com:44301   # https — Basic over http is base64, not encryption
SAP_USER=CLAUDEAGENT
SAP_PASSWORD=<the password>
SAP_CLIENT=100
SAP_LANGUAGE=EN
```

`SAP_PASSWORD` selects the mode by itself, the way `SAP_CERT_FILE` selects certificate mode. When
both are set **the certificate wins** — a configuration carrying both has been given a certificate,
and silently preferring the password would choose the mode that can lock the account over the one
that cannot. `SAP_AUTH_MODE=password` forces it either way.

`http://` is refused outright. Basic sends the credential base64-encoded, which is transport encoding
and not encryption, so a plain-http URL here would put the password on the network in a form anyone
on the path can read.

### What it does about the lock

Three things, none of them optional:

1. **A rejected password is never retried.** The session-expiry retry re-runs the logon on any 401,
   which is right for a Kerberos ticket that aged out and ruinous for a password that is wrong — each
   tool call would spend one more attempt. A 401 from this mode is marked `permanent`, latched, and
   re-thrown on every later call **without contacting SAP**. Five tool calls cost one failed logon,
   not five.
2. **401 and 403 are told apart.** A 403 means the password was accepted and an authorisation is
   missing; reading it as a bad password is what sends someone to reset a credential that was right,
   spending attempts to prove it. The 403 message names `S_DEVELOP` and points at §6.
3. **The password is not logged, not put in the URL** where an ICM trace would keep it, and not
   included in any error message.

### Checking it worked

```
[MCP] authenticated with a password as CLAUDEAGENT on DEV/100. A wrong or expired password locks
this user for everything that uses it — Kerberos (SAP_AUTH_MODE=kerberos) or a certificate
(SAP_CERT_FILE) cannot.
```

The warning is on the success path deliberately. The risk of this mode is not that it fails to start;
it is that it works today and locks an account on the morning the password expires.

### When it fails

| Symptom                                                  | Cause                                                            | Fix                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SAP rejected the password … (HTTP 401)`                 | Wrong password, or expired and needing a change in SAP GUI first | Fix it before restarting — each start costs an attempt                                                      |
| The same, and the password is definitely right           | The user does not exist **in that client**, or is locked already | `SU01`, and check `SAP_CLIENT`                                                                              |
| The same, on a user that works in SAP GUI                | A System (`USTYP = 'B'`) user cannot log on interactively        | Service (`S`) or Dialog (`A`)                                                                               |
| `accepted the logon and refused the resource (HTTP 403)` | Authenticated, missing `S_DEVELOP`                               | §6, and `ABAP_MCP_RFC_FALLBACK` if the RFC tools alone would do                                             |
| `A password sent over plain http…`                       | `SAP_URL` is `http://`                                           | https                                                                                                       |
| `The server certificate … was not trusted`               | Internal CA                                                      | `SAP_CA_FILE`. It matters more here: without it nothing proves the host being sent a password is really SAP |

The code is [src/passwordauth.ts](../src/passwordauth.ts), tested in
[src/**tests**/passwordauth.test.ts](../src/__tests__/passwordauth.test.ts). The latch that stops the
retry is tested in [src/**tests**/server.test.ts](../src/__tests__/server.test.ts), by calling five
tools against a logon that always fails and asserting SAP was contacted once.

---

## 11. OAuth 2.0 mode

The mode for a system that issues bearer tokens rather than accepting a ticket, a certificate or a
password. Two of them, and they are quite different situations:

- **An SAP BTP ABAP environment.** There is no Kerberos realm to join and no ICM to configure for
  client certificates, so the two unattended modes above simply do not exist. A service key is the
  credential the platform gives you, and it is an OAuth 2.0 client.
- **An on-premise system published through `SOAUTH2`.** Basis registers an OAuth 2.0 client so that
  integration users get a token instead of a password. Where that has been done, this is the mode to
  use: the secret is scoped to one client and can be rotated without touching the SAP user.

**The token logs on once.** After the bootstrap, the SAP session cookie carries every request exactly
as in the other three modes, and the token is not sent again. Two consequences worth having in mind:
a token whose lifetime is shorter than SAP's 30-minute session is not a problem, and a token is
minted again only when the session itself has to be re-established.

### Configuring the client

```bash
SAP_URL=https://your-system.example.com:44301   # https — a bearer token in a header, over http, is in the clear
SAP_USER=CLAUDEAGENT                            # the user behind the token; not transmitted
SAP_CLIENT=100

SAP_OAUTH_TOKEN_URL=https://your-system.example.com:44301/sap/bc/sec/oauth2/token
SAP_OAUTH_CLIENT_ID=ZADT_AGENT
SAP_OAUTH_CLIENT_SECRET=<the client secret>
```

On BTP the endpoint comes from the service key rather than from `SAP_URL`, and the two are different
hosts:

```bash
SAP_URL=https://abcd1234trial.abap.eu10.hana.ondemand.com
SAP_OAUTH_TOKEN_URL=https://abcd1234trial.authentication.eu10.hana.ondemand.com/oauth/token
SAP_OAUTH_CLIENT_ID=sb-abap-agent!t1234        # 'clientid' in the service key
SAP_OAUTH_CLIENT_SECRET=<'clientsecret'>       # 'clientsecret'
```

| Variable                  | Meaning                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SAP_OAUTH_TOKEN_URL`     | The token endpoint. `/sap/bc/sec/oauth2/token` on AS ABAP; the service key's `url` plus `/oauth/token` on BTP. https, always.                                           |
| `SAP_OAUTH_CLIENT_ID`     | The client registered in `SOAUTH2`, or `clientid` from a service key. **Setting it selects the mode.**                                                                  |
| `SAP_OAUTH_CLIENT_SECRET` | Its secret. Required for `client_credentials`, where it is the whole credential.                                                                                        |
| `SAP_OAUTH_GRANT`         | `client_credentials` (default), `refresh_token`, `password` or `static`.                                                                                                |
| `SAP_OAUTH_SCOPE`         | Space-separated scopes. Unset asks for the client's defaults, which is usually right.                                                                                   |
| `SAP_OAUTH_REFRESH_TOKEN` | The `refresh_token` grant's credential. Selects that grant by itself.                                                                                                   |
| `SAP_OAUTH_TOKEN`         | An access token minted elsewhere. Selects the `static` grant by itself.                                                                                                 |
| `SAP_OAUTH_CLIENT_AUTH`   | `basic` (default) or `post`. Only worth changing when a server rejects a secret that is right.                                                                          |
| `SAP_CA_FILE`             | As elsewhere — but here it is **added** to the public roots rather than replacing them, because the token endpoint is often a different host with a public certificate. |

`SAP_USER` stays required and is **not transmitted**, as in certificate mode: SAP decides the user
from the token. It is what `healthcheck` and `listLoggedOnUsers` report, so it has to agree with the
user the client is bound to or those answers will be wrong.

### Which grant

| Grant                | When                                                                                      | Renews itself                                 |
| -------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| `client_credentials` | The default, and the one for anything unattended. The client _is_ the identity            | Yes — a new token whenever one is needed      |
| `refresh_token`      | An authorization-code flow someone completed in a browser, whose long-lived half you hold | Until the refresh token expires or is revoked |
| `password`           | A `SOAUTH2` configuration that offers nothing else                                        | Yes, and see the warning below                |
| `static`             | A token from `cf oauth-token`, a proxy, or a test                                         | **No.** A rejection is final until restart    |

**The authorization-code flow is deliberately not implemented.** It needs a browser and a redirect
listener, and a server an MCP client starts over stdio has neither — there is no window to open and
no port to redirect to. Complete it once by hand and put the refresh token in
`SAP_OAUTH_REFRESH_TOKEN`.

> **The `password` grant carries the whole of [§10](#10-password-mode)'s hazard.** It is a password
> logon with an OAuth wrapper: a wrong password counts against `login/fails_to_user_lock` in exactly
> the same way, and locks the same shared account. Prefer `client_credentials`, which cannot.

### Two credentials, two different failures

This is the part worth reading before the first token is issued, because the two failures look
similar and are not:

|                        | Refused by the **token endpoint**                                | Refused by **SAP**                                          |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| What it means          | The client could not authenticate, or is not allowed this grant  | The token is valid; SAP will not turn it into a user        |
| Typically              | Wrong `SAP_OAUTH_CLIENT_SECRET`, wrong tenant, grant not enabled | Scope does not cover the ICF node, no user in this client   |
| Retried?               | **No.** Latched after one attempt                                | Yes — once with a fresh token, and by every later tool call |
| Costs a logon attempt? | **Yes**, and see below                                           | No                                                          |

**An OAuth 2.0 client on AS ABAP is a user in `SU01`.** A wrong client secret is therefore a failed
logon against `login/fails_to_user_lock` in exactly the way a wrong password is, and three of them
lock the client for every consumer of it. So a refused _token request_ is latched and re-thrown on
every later call **without contacting SAP**, the same rule password mode follows.

A token SAP refuses is the opposite case. No SAP user record is touched by it, minting another costs
nothing, and the fix — a scope, a user in the right client — is usually applied while this server is
running. So it is retried: once immediately with a freshly minted token, in case the cached one was
revoked or the clocks disagree, and again on any later call.

### Checking the logon worked

```text
[MCP] authenticated with an OAuth 2.0 access token as CLAUDEAGENT on DEV/100 — client_credentials
grant from https://sapdev.example.com:44301/sap/bc/sec/oauth2/token, valid for another 60 min
```

`healthcheck` reports the same, and never the token itself:

```jsonc
"session": {
  "user": "CLAUDEAGENT",
  "authMode": "oauth",
  "oauth": {
    "grant": "client_credentials",
    "tokenEndpoint": "https://sapdev.example.com:44301/sap/bc/sec/oauth2/token",
    "scope": "ZADT",
    "expiresAt": "2026-08-20T15:41:07.000Z"
  }
}
```

`expiresAt` describes the token this session was established with. It is **not** a countdown to
anything breaking — the token is not sent after the bootstrap, and a new one is minted when the
session has to be re-established — so an `expiresAt` in the past on a long-running server is normal.

The reachability probe works in this mode too, and carries a live token rather than the one the
server booted with. It has one verdict the other modes cannot produce: when no token can be obtained
at all, `layer` is `logon` and the summary says SAP _was never asked_. That distinction matters here
more than anywhere else, because the token endpoint is frequently not the SAP host — reported as an
unreachable SAP it would send you to the wrong system entirely.

### When OAuth fails

| Symptom                                                  | Cause                                                          | Fix                                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `rejected the client credentials … invalid_client`       | Wrong secret, wrong tenant, or the client does not exist       | Check `SAP_OAUTH_CLIENT_SECRET` and the tenant in the URL. It will not be retried — each attempt is a failed logon |
| The same, and the secret is definitely right             | The server wants the credentials in the body                   | `SAP_OAUTH_CLIENT_AUTH=post`                                                                                       |
| `will not let it use the … grant`                        | `unauthorized_client`: grant types are per client in `SOAUTH2` | Enable it there, or use a grant the client has                                                                     |
| `refused the requested scope`                            | `invalid_scope`                                                | Leave `SAP_OAUTH_SCOPE` unset, or name a scope assigned to this client                                             |
| `rejected the refresh token … invalid_grant`             | Expired, revoked, or already rotated away                      | Run the authorization-code flow again. BTP rotates on every use                                                    |
| `answered HTTP 404`                                      | `SAP_OAUTH_TOKEN_URL` is not the token endpoint                | `/sap/bc/sec/oauth2/token`, and that ICF node has to be active in `SICF`                                           |
| `answered … with a body that is not JSON`                | The URL reaches an ICF logon page or a proxy                   | Same as above                                                                                                      |
| `SAP refused the OAuth 2.0 access token (HTTP 401)`      | SAP will not map the token to a user                           | Scope covering this node, a user in this client, OAuth logon allowed on the node                                   |
| `accepted the token and refused the resource (HTTP 403)` | Authenticated, missing `S_DEVELOP`                             | [§6](#6-when-it-fails), and `ABAP_MCP_RFC_FALLBACK` if the RFC tools alone would do                                |
| `can only present a bearer token`                        | The endpoint issued a non-bearer token                         | Not supported: the token is presented in an `Authorization` header                                                 |
| `The server certificate … was not trusted`               | Internal CA on either host                                     | `SAP_CA_FILE` — it covers both, since it is added to the public roots here                                         |

The code is [src/oauth.ts](../src/oauth.ts), tested in
[src/**tests**/oauth.test.ts](../src/__tests__/oauth.test.ts) — which includes a live round trip
against a local HTTPS server playing both the token endpoint and SAP, so the form encoding, the
`Basic` client authentication and the bearer header are genuinely exercised rather than stubbed. The
token cache and the single retry after a revoked token are tested there too.

## 12. Streamable HTTP transport, and per-connection sessions

Everything above describes **stdio** — one process, started by one client, with one SAP logon for
its whole life. Set `ABAP_MCP_TRANSPORT=http` to run this server as a long-lived container that
several team members' MCP clients connect to over the network instead, using the SDK's Streamable
HTTP transport.

HTTP hosting changes _how a session is established_, not what a session is once established: the ADT
tools, the RFC/JSON-RPC path, locking, everything in [docs/MCP-Tools.md](MCP-Tools.md) works
identically. What changes is who logs on. In stdio mode this server picks one of the four modes above
from the environment and logs on once, at startup, as one identity shared by whoever is on the other
end of the pipe — which is fine, because there is exactly one client. A container reachable by a
whole team cannot make that assumption without collapsing everyone into one shared SAP user and one
shared set of locks. So HTTP mode does not use `resolveAuthMode()` at all: **every MCP session
authenticates with its own SAP OAuth 2.0 access token**, supplied by that client, and gets its own SAP
logon built from it — the OAuth `static` grant from [§11](#11-oauth-20-mode), one per connection
rather than one for the process.

Concretely: each MCP client sends `Authorization: Bearer <token>` on every HTTP request to `/mcp`,
where `<token>` is an access token that client obtained from SAP's own OAuth 2.0 authorization server
(or BTP's), scoped and issued the same way any OAuth client in [§11](#11-oauth-20-mode) would be. On
the first request (`initialize`, no `Mcp-Session-Id` yet) this server takes that token, builds a
fresh ADT session from it exactly as `SAP_OAUTH_TOKEN` (the `static` grant) would in stdio mode, and
mints an `Mcp-Session-Id` the client repeats on every later request for that session. A missing or
malformed `Authorization` header is rejected before any SAP traffic — the token is this transport's
only credential, and there is no separate shared secret to fall back on.

**This is real per-user isolation, not a shared technical account with an HTTP front door bolted on.**
Two team members connecting at the same time get two independent SAP sessions, two independent sets
of locks, and two independent identities in whatever `SU53`/audit trail SAP keeps — because each is a
distinct ADT logon built from a distinct token, not two MCP clients sharing one. The `SAP_OAUTH_*` and
`SAP_AUTH_MODE` variables from the sections above are irrelevant to a container run this way; nothing
at the container level decides who a session logs on as, so there is no shared logon to configure in
the first place.

The `static` grant this reduces to does not renew itself ([§11](#11-oauth-20-mode)'s grant table): a
session whose token has expired fails outright rather than silently minting a replacement, and the
client is expected to reconnect with a fresh one — the same way any OAuth client would after a token
expires, and consistent with the fact that this server was never handed a client secret or a refresh
token it could use to mint one on that session's behalf.

### Configuration

```bash
ABAP_MCP_TRANSPORT=http      # default: stdio
ABAP_MCP_HTTP_PORT=3000      # default: 3000
ABAP_MCP_HTTP_HOST=0.0.0.0   # default: 0.0.0.0 — all interfaces, the usual choice in a container
```

| Variable             | Meaning                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ABAP_MCP_TRANSPORT` | `stdio` (default) or `http`. Everything else in this section applies only to `http`.                                                |
| `ABAP_MCP_HTTP_PORT` | The port the Streamable HTTP endpoint listens on, at `/mcp`.                                                                        |
| `ABAP_MCP_HTTP_HOST` | The address to bind. `0.0.0.0` for a container; `127.0.0.1` to restrict to loopback (e.g. behind a reverse proxy on the same host). |

`SAP_URL`, `SAP_CLIENT`, `SAP_LANGUAGE`, `SAP_CA_FILE` and `NODE_TLS_REJECT_UNAUTHORIZED` still apply
— they describe the SAP _system_, which is the same for every session. `SAP_USER` is still required to
construct the underlying ADT client (as in every non-password mode, it is a placeholder never
transmitted; SAP decides the real user from each session's own token) but has no bearing on who any
given session actually is.

This mode still runs `docker-entrypoint.sh`, but its Kerberos setup is skipped when
`ABAP_MCP_TRANSPORT=http` is set — `resolveAuthMode()`'s pick describes nothing real once every
session logs on with its own token, so there is nothing for it to prepare.

### What is deliberately not here

CORS handling, DNS-rebinding host/origin allow-listing, TLS termination, rate limiting and token
refresh are left to the deployment: put a reverse proxy or ingress in front that terminates TLS and
enforces network access, the same as any other internal service. Nothing about the SAP side of this
server changes if one is added later.
