#!/bin/sh
#
# Gets a Kerberos credential into the container, then hands over to the server.
#
# Everything here prints to **stderr**. stdout is the MCP frame stream, and one
# stray line on it corrupts every tool at once - the same rule the server itself
# follows (AGENTS.md, "Never write to stdout").
#
# In certificate, oauth and password mode this does nothing at all but exec: a
# certificate travels in the TLS handshake, a password and a bearer token in a
# header, all of which Node does natively and none of which needs help from the
# container. Kerberos is the mode that needs all of the below, because a ticket
# is a session the container is not part of and has to be reconstructed inside
# it. OAuth is the opposite extreme - the credential is fetched over the network,
# so there is nothing to mount at all.

set -eu

say() { printf 'krb5: %s\n' "$*" >&2; }
die() { printf '%s\n' "$*" >&2; exit 1; }

# Which credential this server logs on with - decided by the server's own
# resolveAuthMode() rather than by a second copy of its rules here, and loading
# .env the way index.ts does, so a mounted /app/.env cannot make the two
# disagree about the mode. An unusable SAP_AUTH_MODE is rejected here too, in
# the server's own wording, before anything else is attempted.
mode=$(node -e '
try {
  require("dotenv").config({ path: "/app/.env" });
  process.stdout.write(require("/app/dist/certauth.js").resolveAuthMode());
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
') || die "Could not decide which authentication mode to use (see above)."

# In Streamable HTTP mode (ABAP_MCP_TRANSPORT=http) the mode above describes
# nothing real: every session logs on with the SAP OAuth token its own client
# supplied on `initialize`, never with resolveAuthMode()'s pick. Skip the
# Kerberos setup below in that case - without it, a container started with
# ABAP_MCP_TRANSPORT=http and no SAP_CERT_FILE/SAP_OAUTH_*/SAP_PASSWORD set
# would trip resolveAuthMode()'s kerberos default and fail on a missing
# SAP_KRB_REALM it will never use.
if [ "$mode" = "kerberos" ] && [ "${ABAP_MCP_TRANSPORT:-stdio}" != "http" ]; then

  # Node cannot do SPNEGO, so both the logon (src/sso.ts) and the two-layer probe
  # behind healthcheck (src/reachability.ts) shell out to curl. It has to be one
  # linked against GSS-API. This is checked rather than assumed because it is
  # invisible otherwise: a curl without it does not fail, it simply never sends a
  # token, and SAP answers the 401 that looks exactly like an expired ticket.
  curl -V 2>/dev/null | grep -qi 'SPNEGO' || die \
"The curl in this image was built without SPNEGO support, so no Kerberos token
can ever be sent and every logon will fail as if the ticket were missing.

This image is Debian (node:22-bookworm-slim) with the curl and krb5-user
packages for exactly this reason. If the Dockerfile has been moved back to
node:22-alpine, that is the cause: Alpine's curl is built without GSS-API."

  # MIT krb5 needs a realm before it can find a KDC, and this container has none
  # of the host's configuration. Three ways in, most explicit first. The image
  # deletes the placeholder /etc/krb5.conf that krb5-user installs, which is what
  # makes the second test mean "the operator mounted one" rather than "the
  # package is installed".
  if [ -n "${KRB5_CONFIG:-}" ]; then
    say "using the krb5 configuration at $KRB5_CONFIG"
  elif [ -f /etc/krb5.conf ]; then
    say "using the /etc/krb5.conf mounted into this container"
  elif [ -n "${SAP_KRB_REALM:-}" ]; then
    # Written to /tmp, not /etc: this runs as 'node' and owns nothing else.
    #
    # rdns = false is the line that matters. With reverse DNS on - the default -
    # the service principal is built from whatever PTR the container's resolver
    # returns for SAP's address rather than from the host name in SAP_URL, and
    # the ticket is then requested for a name SAP holds no key for. On a
    # developer machine the two usually agree; inside Docker they often do not.
    KRB5_CONFIG=/tmp/krb5.conf
    export KRB5_CONFIG
    {
      echo "[libdefaults]"
      echo "    default_realm = ${SAP_KRB_REALM}"
      echo "    dns_lookup_kdc = true"
      echo "    dns_lookup_realm = false"
      echo "    rdns = false"
      if [ -n "${SAP_KRB_KDC:-}" ]; then
        echo ""
        echo "[realms]"
        echo "    ${SAP_KRB_REALM} = {"
        echo "        kdc = ${SAP_KRB_KDC}"
        echo "    }"
      fi
    } > "$KRB5_CONFIG"
    say "generated $KRB5_CONFIG for realm ${SAP_KRB_REALM}"
  else
    die \
"Kerberos mode, but this container has no krb5 configuration, so there is no
realm to ask for a ticket in.

Either mount the host's:
    -v /etc/krb5.conf:/etc/krb5.conf:ro

or name the realm and let DNS find the KDC:
    -e SAP_KRB_REALM=CORP.EXAMPLE.COM

For Active Directory the realm is the domain name in upper case. Add
SAP_KRB_KDC=dc01.corp.example.com when the KDC has no DNS SRV record."
  fi

  # The credential itself. A container cannot borrow a ticket the way an
  # interactive session does, so there are exactly two ways in - and only one of
  # them works unattended.
  if [ -n "${SAP_KRB_KEYTAB:-}" ]; then
    [ -r "${SAP_KRB_KEYTAB}" ] || die \
"SAP_KRB_KEYTAB points at '${SAP_KRB_KEYTAB}', which this container cannot read.

The server runs as uid 1000 ('node'), and a bind mount keeps the host's
ownership - so a keytab that is root-owned and 0600 on the host is unreadable
in here even though it is plainly mounted. Give it a group the container can
read, or relax the file and restrict the directory around it instead."

    # kinit needs to be told which principal in the keytab to use; without one it
    # falls back to host/<hostname>, which in a container is a name nothing has a
    # key for. Reading the first entry is right far more often than that default.
    principal="${SAP_KRB_PRINCIPAL:-$(klist -k "${SAP_KRB_KEYTAB}" 2>/dev/null | awk '/@/ { print $2; exit }')}"
    [ -n "${principal}" ] || die \
"Could not read a principal out of '${SAP_KRB_KEYTAB}', and SAP_KRB_PRINCIPAL
is not set. Name it explicitly:
    -e SAP_KRB_PRINCIPAL=SVC_AGENT@CORP.EXAMPLE.COM"

    # KRB5_CLIENT_KTNAME is what keeps a long-lived container alive past the
    # ticket lifetime: with a client keytab set, GSS acquires a new TGT by itself
    # once the cached one expires, so a server running for days does not stop
    # working after ten hours with a 401 that reads like a mapping problem.
    KRB5_CLIENT_KTNAME="${SAP_KRB_KEYTAB}"
    export KRB5_CLIENT_KTNAME

    # kinit as well, immediately, so a keytab for the wrong principal or with a
    # stale KVNO fails here and says which - rather than on the first tool call,
    # as a 401 the server can only report as a rejected token.
    kinit -k -t "${SAP_KRB_KEYTAB}" "${principal}" || die \
"kinit could not get a ticket for '${principal}' from '${SAP_KRB_KEYTAB}'
(the reason is on the line above).

In the order this is usually wrong:
  1. The principal is not in this keytab - 'klist -k' on it lists what is.
  2. The key is stale: the account's password changed after the keytab was
     written, so the KVNO no longer matches and the KDC refuses it.
  3. The realm or KDC is wrong, or this container cannot reach the KDC on
     port 88. That is a network problem, not a credential one."

    say "obtained a ticket for ${principal} from ${SAP_KRB_KEYTAB}"

  elif klist -s 2>/dev/null; then
    say "using the ticket already in ${KRB5CCNAME:-the default cache}"

  else
    die \
"Kerberos mode, but this container holds no credential.

A container cannot borrow a ticket the way an interactive session does, so
there are two ways in:

  A keytab. The only one that works unattended, and the only one that outlives
  the ticket lifetime, because GSS re-acquires from it:
      -v /host/agent.keytab:/krb5/agent.keytab:ro
      -e SAP_KRB_KEYTAB=/krb5/agent.keytab
      -e SAP_KRB_PRINCIPAL=SVC_AGENT@CORP.EXAMPLE.COM

  A ticket cache the host already holds. Read-only, and it expires with the
  host's ticket:
      -v /tmp/krb5cc_1000:/krb5/ccache:ro
      -e KRB5CCNAME=FILE:/krb5/ccache

The second is Linux hosts only. Windows keeps its TGT in the LSA cache, which
cannot be written out to a file - so from a Windows host, use certificate mode
(SAP_CERT_FILE), which needs none of this."
  fi
fi

# A command given to 'docker run' replaces the server but keeps everything above
# it, so 'docker run ... abap-adt-mcp klist' asks the container which credential
# it actually ended up with. That is the cheapest way to tell a Kerberos problem
# from a SAP one without starting a session.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node ./dist/index.js
