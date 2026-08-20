/**
 * Which SAP system and client this server is bound to.
 *
 * The point is routing. When several of these servers are registered — one per
 * system and client — an agent asked to "check something in DEV client 200" has
 * to pick the right one, and tool names alone do not say. So the identity is
 * declared in the environment and announced in the MCP `instructions`, which the
 * client sees at connect time without calling anything.
 *
 * The declaration is only half of it. SAP names the system in the session cookie
 * it sets at logon — `SAP_SESSIONID_<SID>_<CLIENT>`, e.g. `SAP_SESSIONID_DEV_100`
 * — so the true identity comes free with the session and can be checked against
 * what the configuration claims. A configuration that says DEV while the session
 * is on P01 is the one failure mode worth catching: every tool would work
 * perfectly, on the wrong system.
 */

export interface SystemIdentity {
    /** SAP_SYSTEM_ID, upper-cased. What the configuration claims. */
    declaredSystemId?: string;
    /** SAP_CLIENT. */
    declaredClient?: string;
    /** Read from the session cookie. What SAP actually said. */
    observedSystemId?: string;
    observedClient?: string;
    /** The one to use. Observed wins — it is not a claim. */
    systemId?: string;
    client?: string;
    /** Set when the declaration and the session disagree. */
    mismatch?: string;
}

/** `SAP_SESSIONID_DEV_100` — three-character system id, three-digit client. */
const SESSION_COOKIE = /^SAP_SESSIONID_([A-Za-z0-9]{3})_(\d{3})$/;

/**
 * The system and client SAP named in its session cookie.
 *
 * @param cookieNames Cookie names from the logon, in any order.
 */
export function parseSessionCookies(cookieNames: Iterable<string> | undefined): {
    systemId?: string;
    client?: string;
} {
    for (const name of cookieNames ?? []) {
        const match = SESSION_COOKIE.exec(String(name));
        if (match) return { systemId: match[1].toUpperCase(), client: match[2] };
    }
    return {};
}

/**
 * Combines what was configured with what the session revealed.
 *
 * @param env     Process environment, for SAP_SYSTEM_ID and SAP_CLIENT.
 * @param cookies Cookie names from the established session, if there is one yet.
 */
export function resolveSystemIdentity(
    env: NodeJS.ProcessEnv = process.env,
    cookies?: Iterable<string>
): SystemIdentity {
    const declaredSystemId = String(env.SAP_SYSTEM_ID ?? '').trim().toUpperCase() || undefined;
    const declaredClient = String(env.SAP_CLIENT ?? '').trim() || undefined;
    const observed = parseSessionCookies(cookies);

    const identity: SystemIdentity = {
        declaredSystemId,
        declaredClient,
        observedSystemId: observed.systemId,
        observedClient: observed.client,
        systemId: observed.systemId ?? declaredSystemId,
        client: observed.client ?? declaredClient
    };

    const problems: string[] = [];
    if (declaredSystemId && observed.systemId && declaredSystemId !== observed.systemId) {
        problems.push(`SAP_SYSTEM_ID says ${declaredSystemId} but the session is on ${observed.systemId}`);
    }
    // Clients are compared numerically: '100' and '0100' are the same client, and
    // SAP_CLIENT is often written without its leading zeros.
    if (declaredClient && observed.client && Number(declaredClient) !== Number(observed.client)) {
        problems.push(`SAP_CLIENT says ${declaredClient} but the session is on ${observed.client}`);
    }

    if (problems.length) {
        identity.mismatch =
            `${problems.join('; ')}. The session is authoritative, so the tools act on ` +
            `${describeSystem(identity)} — but anything routing by the configured name will send work ` +
            `here that was meant for somewhere else. Fix the environment of this MCP server.`;
    }

    return identity;
}

/** `DEV/100`, or as much of it as is known. */
export function describeSystem(identity: SystemIdentity): string {
    const system = identity.systemId ?? '(unknown system)';
    return identity.client ? `${system}/${identity.client}` : system;
}

/**
 * The `instructions` returned at initialize. This is the only channel that tells
 * a client which system it just connected to *before* it calls anything, which
 * is what makes picking between several of these servers possible.
 *
 * Built from the environment, because it is needed at construction time — the
 * session, and with it the observed identity, does not exist yet.
 */
export function serverInstructions(identity: SystemIdentity, baseUrl?: string): string {
    const target = identity.declaredSystemId
        ? `SAP system **${identity.declaredSystemId}**${identity.declaredClient ? `, client ${identity.declaredClient}` : ''}`
        : identity.declaredClient
            ? `client ${identity.declaredClient} of the SAP system at ${baseUrl ?? 'the configured URL'}`
            : `the SAP system at ${baseUrl ?? 'the configured URL'}`;

    const lines = [
        `This server is bound to ${target}${baseUrl && identity.declaredSystemId ? ` (${baseUrl})` : ''}.`,
        '',
        'It cannot switch system or client at runtime — both are fixed by the environment it was ' +
        'started with. If a request names a different system or client, use the MCP server ' +
        'configured for that one; if none is registered, say so rather than acting here.'
    ];

    if (!identity.declaredSystemId) {
        lines.push(
            '',
            'No SAP_SYSTEM_ID is configured, so this server cannot be matched to a system by name. ' +
            'The `healthcheck` tool reports the system id read from the session.'
        );
    }

    return lines.join('\n');
}
