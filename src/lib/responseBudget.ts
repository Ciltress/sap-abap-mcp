import type { ProfileName } from './profiles.js';

/**
 * A ceiling on how large one tool response may be.
 *
 * The tool list is a fixed cost a profile can shrink; a response is unbounded.
 * On `core` the whole tool list is ~9KB, and a single `adtDiscovery` came back at
 * ~48KB — five times the entire menu, in one answer. A model with a small
 * effective context does not recover from that: the useful part of the
 * conversation is pushed out by a document it did not ask to read in full.
 *
 * The budget therefore follows the profile, because the profile is already the
 * server's statement about how much the client in front of it can carry.
 *
 * Truncating is the last resort, not the design. A tool that routinely overruns
 * should grow a real argument — a row limit, a summary mode — so the caller
 * chooses what to leave out. This only stops a runaway.
 */

/** Bytes. 0 means no ceiling. */
export const PROFILE_RESPONSE_BUDGETS: Record<ProfileName, number> = {
    // ~6,600 tokens: large enough for a class of a few hundred lines, small
    // enough to leave an 8B room to think afterwards.
    core: 24_000,
    analyst: 32_000,
    // Between analyst and dev: an RFC result can be a large table, and this
    // profile has no ADT tool to fall back on when one is truncated.
    rfc: 40_000,
    dev: 48_000,
    // Unlimited: `all` is for clients that fetch schemas on demand and handle
    // large payloads, and silently cutting one of those is worse than the cost.
    all: 0
};

export class ResponseBudgetError extends Error { }

/**
 * ABAP_MCP_MAX_RESPONSE_BYTES overrides the profile default; `0` disables the
 * ceiling entirely. An unparseable value throws at startup rather than being
 * ignored, for the same reason a bad profile name does.
 */
export function resolveResponseBudget(
    profile: ProfileName,
    env: NodeJS.ProcessEnv = process.env
): number {
    const raw = String(env.ABAP_MCP_MAX_RESPONSE_BYTES ?? '').trim();
    if (!raw) return PROFILE_RESPONSE_BUDGETS[profile];

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ResponseBudgetError(
            `ABAP_MCP_MAX_RESPONSE_BYTES='${raw}' is not a whole number of bytes. ` +
            `Use a positive integer, or 0 for no limit.`
        );
    }
    return parsed;
}

/** The text an MCP tool result carries, concatenated across its content parts. */
export function toolResultText(result: any): string {
    const parts = result?.content;
    if (!Array.isArray(parts)) return '';
    return parts
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('');
}

export function toolResultBytes(result: any): number {
    return Buffer.byteLength(toolResultText(result), 'utf8');
}

/** How much of the original answer to keep when the ceiling is hit. */
const PREVIEW_BYTES = 2_000;

/**
 * What "narrow it" means when a tool has nothing specific to say.
 *
 * The specific advice lives on each tool, as `ToolDefinition.narrowingHint`. It
 * used to be a map keyed by tool name here, and that is exactly the kind of
 * registry that goes stale without a sound: renaming a tool stopped the lookup
 * matching, and the model got this generic sentence at the moment it most needed
 * the specific move — "there is no filter, there is a section".
 */
export const GENERIC_NARROWING_HINT =
    'Narrow the request — most tools take a filter, a name, or a row limit.';

/** The narrowing advice for one tool, falling back to something generally true. */
export function narrowingHint(hint?: string): string {
    return hint?.trim() || GENERIC_NARROWING_HINT;
}

export interface CappedResult {
    result: any;
    /** Size of the original answer, whether or not it was capped. */
    bytes: number;
    truncated: boolean;
}

/**
 * Replaces an over-budget result with a valid, self-describing one.
 *
 * The replacement is JSON rather than a cut-off fragment of the original: a
 * truncated JSON document is unparseable, and a model handed one will usually
 * retry the same call rather than realise what happened. This says plainly what
 * was dropped and what to do instead, which is the difference between a capped
 * answer that costs 500 tokens and teaches the next move, and an uncapped one
 * that costs 13,000 and teaches nothing.
 */
export function capToolResult(
    toolName: string,
    result: any,
    budget: number,
    /** The tool's own `narrowingHint`, when it has one. */
    hint?: string
): CappedResult {
    const text = toolResultText(result);
    const bytes = Buffer.byteLength(text, 'utf8');

    if (budget <= 0 || bytes <= budget) return { result, bytes, truncated: false };

    const preview = Buffer.from(text, 'utf8').subarray(0, PREVIEW_BYTES).toString('utf8');

    return {
        bytes,
        truncated: true,
        result: {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    status: 'truncated',
                    tool: toolName,
                    bytes,
                    budget,
                    reason:
                        `The answer was ${bytes} bytes, over this server's ${budget} byte response ` +
                        `budget, and has been withheld rather than sent in full.`,
                    nextStep: narrowingHint(hint),
                    otherwise:
                        `Raise the ceiling with ABAP_MCP_MAX_RESPONSE_BYTES (0 removes it), or use a ` +
                        `larger profile. Retrying this exact call will produce this exact answer. ` +
                        `The first ${PREVIEW_BYTES} bytes are in 'preview', so the shape is visible.`,
                    preview
                })
            }]
        }
    };
}
