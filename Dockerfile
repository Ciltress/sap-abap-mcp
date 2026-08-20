# syntax=docker/dockerfile:1

# This server speaks MCP over **stdio**, not HTTP. There is no port to publish
# and nothing to health-probe: a client starts it with `docker run -i --rm` and
# talks to it over the container's stdin/stdout.
#
# Both logon modes work in here. A certificate needs nothing from the image —
# it is presented in the TLS handshake, which Node does natively. Kerberos needs
# three things the image has to provide, and ./docker-entrypoint.sh wires them
# up: a curl built against GSS-API, a krb5 configuration, and a credential.
# See docs/Authentication.md §7.

FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Dependencies first, from the lockfile, so a source-only change does not
# reinstall them. `npm ci` rather than `npm install`: it fails on a lockfile that
# disagrees with package.json instead of quietly resolving something else.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Prune in the same layer, so the devDependencies never reach the runner.
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

# Debian, not Alpine, and this is the reason. Node cannot do SPNEGO, so the
# Kerberos logon (src/sso.ts) and the two-layer probe behind healthcheck
# (src/reachability.ts) both shell out to curl — and it has to be a curl linked
# against GSS-API. Debian's is; Alpine's is built without it, and the difference
# is invisible at run time: such a curl does not fail, it simply never sends a
# token, and SAP answers with the same 401 an expired ticket produces.
#
# krb5-user brings kinit — a keytab is the only credential a container can hold
# unattended — and klist, which is the first thing to run when a logon fails.
#
# The placeholder /etc/krb5.conf that krb5-config installs is removed on the way
# out. It names a realm that does not exist, and leaving it there would make
# "the operator mounted a krb5.conf" indistinguishable from "the package is
# installed" — a test the entrypoint depends on.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        curl \
        krb5-user \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/krb5.conf

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Not optional, and the reason this stage is longer than it looks. `guides.ts`
# and `skills.ts` resolve their content from the image root (`dist/lib/../..`),
# so an image without these three answers every readServerGuide, readSkill and
# `abap-adt://` resource with a file-not-found while the rest of the server looks
# perfectly healthy.
#
# `skills/Development` is a git submodule: build from a `--recurse-submodules`
# clone or the image ships 35 fewer skills.
COPY docs ./docs
COPY skills ./skills
COPY AGENTS.md ./

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

# Where kinit writes and where curl looks. /tmp because the server runs as `node`
# and owns nothing else. Override it to point at a ticket cache mounted from the
# host: `-e KRB5CCNAME=FILE:/krb5/ccache`.
ENV KRB5CCNAME=FILE:/tmp/krb5cc

USER node

# The entrypoint prepares the credential and then execs the server, so this is
# still one process talking MCP on stdout. Everything it says goes to stderr,
# for the same reason the server never writes to stdout: a stray line there is
# not a protocol frame and corrupts every tool at once.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
