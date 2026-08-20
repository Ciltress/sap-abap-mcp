/**
 * Dropping tools the connected system cannot serve.
 *
 * `gitRepos` answers 400 on DEV, and the reason is not a bug: the ADT discovery
 * document for that system contains no abapGit collection at all, because the
 * plugin is not installed. Ten tools were being offered that could never work,
 * and the only way to find out was to call one and read "Request failed with
 * status code 400" — which tells an agent nothing, so it retries.
 *
 * Deleting them was the other option and it is the wrong one: abapGit is present
 * on plenty of systems, and hard-coding one system's gaps into a server meant to
 * be pointed at several turns a general tool into a local one. The system already
 * publishes the answer; ask it.
 *
 * Gating is decided once, before tools/list is served, so no client needs to
 * support tools/list_changed. When discovery cannot be read — no ticket, system
 * down, an older release that does not publish one — nothing is gated. Offering
 * a tool that might not work beats hiding one that would.
 */

import type { ToolDefinition } from '../types/tools.js';

export interface GatedFeature {
    /** Stable id, used in the message, in healthcheck, and by ToolDefinition.needsFeature. */
    id: string;
    /** Human-readable name of what is missing. */
    label: string;
    /**
     * Substring of the collection href that proves the feature is present.
     * Matched against every href in the discovery document.
     */
    hrefContains: string;
}

/**
 * The features a system may or may not offer.
 *
 * Which tools need one is declared by the tools themselves, through
 * `ToolDefinition.needsFeature`. It used to be a list of names here, and that
 * list could go stale without a sound: renaming a tool left the name behind and
 * quietly un-gated it, so the tool came back to life on a system that cannot
 * serve it and answered 400.
 */
export const GATED_FEATURES: readonly GatedFeature[] = [
    {
        id: 'abapgit',
        label: 'the abapGit ADT plugin',
        // abap-adt-api calls /sap/bc/adt/abapgit/repos and .../externalrepoinfo.
        hrefContains: '/sap/bc/adt/abapgit'
    },
    {
        id: 'businessservices',
        label: 'the ADT business services collection (service bindings)',
        hrefContains: '/sap/bc/adt/businessservices'
    }
];

/** Every collection href in a discovery document, however deeply nested. */
export function discoveryHrefs(discovery: any): string[] {
    if (!Array.isArray(discovery)) return [];
    const hrefs: string[] = [];
    for (const category of discovery) {
        for (const collection of category?.collection ?? []) {
            if (typeof collection?.href === 'string') hrefs.push(collection.href);
            for (const link of collection?.templateLinks ?? []) {
                if (typeof link?.template === 'string') hrefs.push(link.template);
            }
        }
    }
    return hrefs;
}

export interface GateResult {
    /** Tool name -> why it is not offered here. */
    unavailable: Map<string, string>;
    /** Ids of the features found missing. */
    missing: string[];
}

/**
 * Works out which tools this system cannot serve.
 *
 * An empty or unreadable discovery document gates nothing, deliberately: the
 * failure mode of a wrong "missing" verdict is a capability silently disappearing,
 * which is far harder to diagnose than a tool that returns an error.
 *
 * @param discovery The ADT discovery document.
 * @param tools     The catalogue. A tool is withheld when its `needsFeature`
 *                  names a feature this system does not have.
 */
export function evaluateGate(
    discovery: any,
    tools: readonly ToolDefinition[] = [],
    features: readonly GatedFeature[] = GATED_FEATURES
): GateResult {
    const hrefs = discoveryHrefs(discovery);
    const unavailable = new Map<string, string>();
    const missing: string[] = [];

    if (!hrefs.length) return { unavailable, missing };

    for (const feature of features) {
        if (hrefs.some(href => href.includes(feature.hrefContains))) continue;

        missing.push(feature.id);
        for (const tool of tools) {
            if (tool.needsFeature !== feature.id) continue;
            unavailable.set(
                tool.name,
                `This system does not expose ${feature.label} — its ADT discovery document has no ` +
                `${feature.hrefContains} collection, so '${tool.name}' cannot work here. This is a property ` +
                `of the system, not of your request: calling it again will not help.`
            );
        }
    }

    return { unavailable, missing };
}

/** ABAP_MCP_GATE=off skips the startup discovery round-trip entirely. */
export function gatingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const raw = String(env.ABAP_MCP_GATE ?? '').trim().toLowerCase();
    return !['off', 'false', '0', 'no'].includes(raw);
}
