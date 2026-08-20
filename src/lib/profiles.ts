import type { ToolDefinition } from '../types/tools.js';

/**
 * Which tools this server lists, chosen at startup by ABAP_MCP_PROFILE.
 *
 * The whole tool set serialises to ~68KB — about 19,000 tokens — and a client
 * that cannot fetch schemas on demand pays that on every single turn. Claude
 * Code defers them and does not care; an 8B model with a 128k window is spending
 * a sixth of its context before the conversation starts, and that is where the
 * "same prompt works half the time" problem comes from.
 *
 * A profile is therefore not a convenience filter. A tool outside the active
 * profile is not routed either, so it cannot be called — which is what makes
 * `analyst` a safety property rather than a smaller menu.
 *
 * `healthcheck` is deliberately absent from every list: it is registered outside
 * the handlers and is always available, because it is the tool that answers
 * "which profile am I even running?".
 */

export type ProfileName = 'core' | 'analyst' | 'rfc' | 'dev' | 'all';

/**
 * The complete read side of an ABAP session: find a thing, read it, look at its
 * data, and read the server's own guidance. Every profile gets these.
 */
const CORE_READ = [
    'readAbapObject',
    'searchPackages',
    'nodeContents',
    'syntaxCheckCode',
    'tableContents',
    'readServerGuide',
    'readSkill'
] as const;

/**
 * The complete write cycle in one tool.
 *
 * It used to be four — lock, setObjectSource, activateByName, unLock — and
 * dropping any one of them left a profile that could start an edit it could not
 * finish. `editAbapSource` does the whole cycle and releases the lock on every
 * path, so the ordering, the lock handle and the obligation to unlock after a
 * failure stop being things the smallest client in scope has to get right.
 *
 * The four steps stay in `dev` and `all`, for edits that genuinely need them apart.
 */
const CORE_WRITE = ['editAbapSource'] as const;

/** The steps, for profiles that may want to drive the cycle themselves. */
const STEPWISE_WRITE = ['lock', 'setObjectSource', 'activateByName', 'unLock'] as const;

/** Reading a system rather than changing it: dictionary, data, and RFC calls. */
const ANALYSIS = [
    'describeAbapTable',
    'ddicElement',
    'runQuery',
    'readAbapFunctionModule',
    'callFunctionViaJsonRpc',
    'callFunctionsViaJsonRpc',
    'checkJsonRpcEndpoint',
    'listLoggedOnUsers',
    'readShortDumps',
    'listFeeds'
] as const;

/**
 * The tools that reach SAP without going through ADT.
 *
 * This is the set that still works for a technical user with RFC authorisations
 * and no `S_DEVELOP` — SAP refuses such a user `/sap/bc/adt/*` outright while
 * serving `/sap/gw/jsonrpc` perfectly. Every entry was confirmed against a live
 * system in that state rather than reasoned about: `describeAbapTable` is here
 * because it reads `DDIF_FIELDINFO_GET` over RFC, while `tableContents` and
 * `runQuery` are not, because they go through the ADT Data Preview service.
 *
 * The two documentation tools need no SAP session at all, so they hold in any
 * state the server can start in.
 */
const RFC_ONLY = [
    'callFunctionViaJsonRpc',
    'callFunctionsViaJsonRpc',
    'checkJsonRpcEndpoint',
    'describeAbapTable',
    'listLoggedOnUsers',
    'readProfileParameters',
    'checkLogonConfiguration',
    'readServerGuide',
    'readSkill'
] as const;

/** Everything a developer reaches for beyond the bare edit cycle. */
const DEVELOPMENT = [
    'getObjectSource',
    'objectStructure',
    'classIncludes',
    'classComponents',
    'findDefinition',
    'codeCompletion',
    'abapDocumentation',
    'usageReferences',
    'describeAbapTable',
    'ddicElement',
    'createObject',
    'validateNewObject',
    'deleteObject',
    'inactiveObjects',
    'activateObjects',
    'unitTestRun',
    'createTestInclude',
    'createAtcRun',
    'atcWorklists',
    'prettyPrinter',
    'transportInfo',
    'createTransport',
    'userTransports',
    'revisions',
    'findObjectPath',
    'objectTypes',
    'mainPrograms',
    'searchObject',
    'fixProposals',
    'fixEdits',
    'renameEvaluate',
    'renamePreview',
    'renameExecute',
    'extractMethodEvaluate',
    'extractMethodPreview',
    'extractMethodExecute'
] as const;

export interface ProfileDefinition {
    description: string;
    /** Undefined means "every tool the handlers offer" — the `all` profile. */
    tools?: readonly string[];
}

export const PROFILES: Record<ProfileName, ProfileDefinition> = {
    core: {
        description:
            'The smallest set that can still read a system and complete an edit. For small local ' +
            'models that receive every schema on every turn.',
        tools: [...CORE_READ, ...CORE_WRITE]
    },
    analyst: {
        description:
            'Reading and calling, never changing: dictionary, table data and RFC function modules. ' +
            'The write tools are absent rather than discouraged, so this profile cannot edit source.',
        tools: [...CORE_READ, ...ANALYSIS]
    },
    rfc: {
        description:
            'Only the tools that reach SAP without ADT. For a technical user that has RFC ' +
            'authorisations but no S_DEVELOP, where every ADT tool would fail at call time — ' +
            'listing them anyway leaves an agent retrying calls SAP will never serve. Pair with ' +
            'ABAP_MCP_RFC_FALLBACK, which lets such a server start at all.',
        tools: [...RFC_ONLY]
    },
    dev: {
        description:
            'Day-to-day ABAP development: the edit cycle plus navigation, tests, ATC, transports ' +
            'and refactoring.',
        tools: [...CORE_READ, ...CORE_WRITE, ...STEPWISE_WRITE, ...DEVELOPMENT]
    },
    all: {
        description:
            'Every tool. The default, and the right choice for a client that fetches tool schemas ' +
            'on demand rather than carrying them all.'
    }
};

export const PROFILE_NAMES = Object.keys(PROFILES) as ProfileName[];

/** The default. Keeping it `all` means an existing setup behaves as it always has. */
export const DEFAULT_PROFILE: ProfileName = 'all';

export class ProfileError extends Error { }

/**
 * Reads ABAP_MCP_PROFILE. An unrecognised name throws rather than falling back:
 * silently serving 138 tools to something that asked for 11 is the exact failure
 * profiles exist to prevent, and a typo would never be noticed.
 */
export function resolveProfile(env: NodeJS.ProcessEnv = process.env): ProfileName {
    const raw = String(env.ABAP_MCP_PROFILE ?? '').trim().toLowerCase();
    if (!raw) return DEFAULT_PROFILE;

    if (!PROFILE_NAMES.includes(raw as ProfileName)) {
        throw new ProfileError(
            `ABAP_MCP_PROFILE='${env.ABAP_MCP_PROFILE}' is not a known profile. ` +
            `Use one of: ${PROFILE_NAMES.join(', ')}.`
        );
    }
    return raw as ProfileName;
}

/**
 * Applies a profile to the tools the handlers offer.
 *
 * A name in a profile that no handler provides is a bug in this file — most
 * likely a tool that was renamed or removed — and throwing here turns it into a
 * startup failure rather than a capability that quietly disappears.
 */
export function applyProfile(
    profile: ProfileName,
    tools: readonly ToolDefinition[]
): ToolDefinition[] {
    const wanted = PROFILES[profile].tools;
    if (!wanted) return [...tools];

    const available = new Set(tools.map(tool => tool.name));
    const unknown = wanted.filter(name => !available.has(name));
    if (unknown.length) {
        throw new ProfileError(
            `Profile '${profile}' lists ${unknown.length} tool(s) no handler provides: ` +
            `${unknown.join(', ')}. Update src/lib/profiles.ts.`
        );
    }

    const keep = new Set(wanted);
    return tools.filter(tool => keep.has(tool.name));
}
