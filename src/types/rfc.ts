/**
 * The one capability a handler needs in order to reach an RFC-enabled function
 * module, injected rather than taking a reference to
 * JsonRemoteFunctionCallHandlers.
 *
 * Keeping it to a function means a handler that needs RFC stays independent of
 * the one that implements it, and unit-tests with a stub. index.ts supplies the
 * real implementation as an arrow, so the construction order of the handlers
 * does not matter.
 */
export type RfcCaller = (
    functionModuleName: string,
    inputParameters: Record<string, any>,
    outputParameters: string[]
) => Promise<{ output: Record<string, any> }>;

/** One member of a batch. Structurally the JsonRpcCallSpec the RFC handler takes. */
export interface RfcBatchCall {
    functionModuleName: string;
    inputParameters?: Record<string, any>;
    outputParameters?: string[];
}

/** One member's outcome. A failure is reported here, not thrown. */
export interface RfcBatchEntry {
    functionModule: string;
    ok: boolean;
    output?: Record<string, any>;
    raw?: any;
    error?: { code: number; message: string; data?: any };
}

/**
 * Several function modules in one round trip. Worth injecting separately from
 * RfcCaller because a handler that reads twenty profile parameters wants one
 * HTTP request, not twenty — and because a member that fails must not take the
 * others with it.
 */
export type RfcBatchCaller = (
    calls: RfcBatchCall[]
) => Promise<{ ok: boolean; calls: RfcBatchEntry[] }>;
