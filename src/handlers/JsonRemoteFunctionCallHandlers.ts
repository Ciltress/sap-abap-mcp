
import { BaseHandler } from "./BaseHandler";
import type { ToolSpec } from "./BaseHandler";
import { ADTClient, isAdtException, isLoginError, isAdtError } from 'abap-adt-api';
import type { HttpClientResponse, RequestOptions } from 'abap-adt-api/build/AdtHTTP';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from '../types/tools.js';

/**
 * ICF path of the SAP Gateway JSON-RPC 2.0 service (SAP_GWFND, package
 * /IWBEP/JSON_RPC, handler class /IWBEP/CL_JSRPC_HTTP_HANDLER).
 * The node must be active in SICF. Overridable for systems that publish the
 * handler under a different alias.
 *
 * Protocol facts below were read from the ABAP source of the handler classes
 * on DEV/100 and confirmed against the live endpoint:
 *
 *  - `/IWBEP/IF_JSRPC_TRANSPORT~VALIDATE` requires POST and a Content-Type
 *    whose first 16 characters are `application/json`.
 *  - It requires the `X-CSRF-Token` header for every method except
 *    `JSONRPC.INIT`, validated against the session cookie via the ICF
 *    VALIDATE_XSRF_TOKEN service. The token harvested by the ADT SSO
 *    bootstrap is the same one INIT hands out, so it is accepted here.
 *  - `/IWBEP/CL_JSRPC_PARSER` upper-cases the `method` and accepts `params`
 *    only as a JSON *object* or null — positional arrays are rejected with
 *    -32600.
 *  - `/IWBEP/CL_JSRPC_PROCESSOR` splits the method on the last dot into
 *    namespace + name; namespace `RFC` or none dispatches to a function
 *    module, so a bare (dot-free) function module name is the method.
 *  - `/IWBEP/CL_JSRPC_FUNCTION` builds one flat structure holding *every*
 *    non-exception parameter, fills it from `params` via
 *    `CALL TRANSFORMATION id`, CALL FUNCTIONs it, and serialises the same
 *    structure back as `result`. So `result` is a flat object keyed by
 *    UPPERCASE ABAP parameter names and echoes the inputs back alongside the
 *    outputs.
 */
const JSONRPC_PATH = process.env.SAP_JSONRPC_PATH ?? '/sap/gw/jsonrpc';

/** ADT object type of a function module. */
const FM_OBJECT_TYPE = 'FUGR/FF';

/**
 * The function module the JSON-RPC dispatcher itself uses to build a call
 * (`/IWBEP/CL_JSRPC_FUNCTION->init`). Asking it for the signature therefore
 * yields exactly the interface the call will be validated against.
 */
const FM_INTERFACE_FUNCTION = 'RFC_GET_FUNCTION_INTERFACE';
/** Resolves a function module name to its function group. */
const FM_GROUP_FUNCTION = 'RFC_FUNCTION_SEARCH';

export type FmParameterKind = 'IMPORTING' | 'EXPORTING' | 'CHANGING' | 'TABLES';

/** Where a signature came from — the two sources can disagree on a stale system. */
export type FmMetadataSource = 'RFC_INTERFACE' | 'ADT_SOURCE';

/** PARAMCLASS values of RFC_GET_FUNCTION_INTERFACE (table RFC_FUNINT). */
const PARAMCLASS_KINDS: Record<string, FmParameterKind> = {
    I: 'IMPORTING',
    E: 'EXPORTING',
    C: 'CHANGING',
    T: 'TABLES'
};
/** PARAMCLASS of a classic exception. */
const PARAMCLASS_EXCEPTION = 'X';

export interface FmParameter {
    /** ABAP parameter name, as declared (upper case). */
    name: string;
    kind: FmParameterKind;
    /** Pass by VALUE(...) or REFERENCE(...). Only known from the ADT source. */
    passing?: 'VALUE' | 'REFERENCE';
    /** The typing keyword used in the generated interface. Only from the ADT source. */
    typing?: 'TYPE' | 'LIKE' | 'STRUCTURE';
    /** The ABAP type / structure the parameter refers to. */
    type?: string;
    optional: boolean;
    /** Literal after DEFAULT, if any (implies optional). */
    defaultValue?: string;
    /** Short text of the parameter, when the system has one. */
    description?: string;
}

export interface FunctionModuleMetadata {
    name: string;
    /** Which of the two lookups produced `parameters`. */
    metadataSource: FmMetadataSource;
    /** ADT URI, e.g. /sap/bc/adt/functions/groups/srfc/fmodules/rfc_system_info. */
    objectUrl?: string;
    /** ADT URI of the main source. */
    sourceUrl?: string;
    functionGroup?: string;
    description?: string;
    parameters: FmParameter[];
    /** Classic EXCEPTIONS and class based RAISING entries. */
    exceptions: string[];
}

export interface JsonRpcCallResult {
    functionModule: string;
    /** The requested output parameters, picked out of the JSON-RPC result. */
    output: Record<string, any>;
    /**
     * The full `result` member. Contains every parameter of the function
     * module, inputs included, so a wrong `output` mapping stays diagnosable.
     */
    raw: any;
}

/** One function module call, as the caller describes it. */
export interface JsonRpcCallSpec {
    functionModuleName: string;
    inputParameters?: Record<string, any>;
    outputParameters?: string[];
}

/**
 * Outcome of one member of a batch. A failing member does not abort the others
 * — the server answers every request it could parse — so the error is reported
 * per member instead of being thrown.
 */
export interface JsonRpcBatchEntry {
    functionModule: string;
    ok: boolean;
    /** Present when ok. */
    output?: Record<string, any>;
    /** Present when ok: the untouched `result` member. */
    raw?: any;
    /** Present when the server reported a JSON-RPC error for this member. */
    error?: { code: number; message: string; data?: any };
}

export interface JsonRpcBatchResult {
    /** True only when every member succeeded. */
    ok: boolean;
    calls: JsonRpcBatchEntry[];
}

/** Result of the cheap connectivity probe against the JSON-RPC node. */
export interface JsonRpcEndpointStatus {
    path: string;
    reachable: boolean;
    /** Endpoint reported by JSONRPC.INIT, and its session settings. */
    endpoint?: string;
    session?: Record<string, any>;
    /** Populated when the probe failed. */
    problem?: string;
}

interface JsonRpcError {
    code: number;
    message: string;
    data?: any;
}

interface JsonRpcResponse {
    jsonrpc?: string;
    id?: number | string | null;
    result?: any;
    error?: JsonRpcError;
}

/** One JSON-RPC request object, as it goes on the wire. */
interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: Record<string, any>;
}

/** A call whose signature has been read and whose request has been validated. */
interface PreparedCall {
    metadata: FunctionModuleMetadata;
    params: Record<string, any>;
    wanted: string[];
}

/** Sections of the generated `*"` interface block of a function module. */
const INTERFACE_SECTIONS: Record<string, FmParameterKind | 'EXCEPTIONS'> = {
    IMPORTING: 'IMPORTING',
    EXPORTING: 'EXPORTING',
    CHANGING: 'CHANGING',
    TABLES: 'TABLES',
    EXCEPTIONS: 'EXCEPTIONS',
    RAISING: 'EXCEPTIONS'
};

/** Parameter kinds that can be filled by the caller. */
const INPUT_KINDS: FmParameterKind[] = ['IMPORTING', 'CHANGING', 'TABLES'];
/** Parameter kinds the function module sends back. */
const OUTPUT_KINDS: FmParameterKind[] = ['EXPORTING', 'CHANGING', 'TABLES'];

/**
 * Parses the interface block that SAP generates at the top of every function
 * module source, e.g.
 *
 *     FUNCTION Z_MY_FUNC.
 *     *"----------------------------------------------------------------------
 *     *"*"Local Interface:
 *     *"  IMPORTING
 *     *"     VALUE(IV_MATNR) TYPE  MATNR
 *     *"     REFERENCE(IV_FLAG) TYPE  CHAR1 DEFAULT 'X' OPTIONAL
 *     *"  EXPORTING
 *     *"     VALUE(EV_TEXT) TYPE  STRING
 *     *"  TABLES
 *     *"      IT_ITEMS STRUCTURE  MARA OPTIONAL
 *     *"  EXCEPTIONS
 *     *"      NOT_FOUND
 *     *"----------------------------------------------------------------------
 *
 * Used as the fallback signature source: ADT exposes this block through the
 * object's source and has no separate parameter resource. The primary source
 * is RFC_GET_FUNCTION_INTERFACE, see readAbapFunctionModule.
 */
export function parseFunctionInterface(source: string): { parameters: FmParameter[]; exceptions: string[] } {
    const parameters: FmParameter[] = [];
    const exceptions: string[] = [];
    let section: FmParameterKind | 'EXCEPTIONS' | undefined;
    let insideBlock = false;

    for (const line of source.split(/\r?\n/)) {
        const comment = line.match(/^\s*\*"(.*)$/);
        if (!comment) {
            if (insideBlock) break; // the block is contiguous; first code line ends it
            continue;
        }

        // '*"*"Local Interface:' carries a second marker
        const text = comment[1].replace(/^\*"/, '').trim();

        if (/^-*$/.test(text)) {
            if (insideBlock) break; // closing ruler
            continue;
        }
        if (/^local interface/i.test(text)) {
            insideBlock = true;
            continue;
        }

        const keyword = text.toUpperCase().replace(/:$/, '');
        if (INTERFACE_SECTIONS[keyword]) {
            section = INTERFACE_SECTIONS[keyword];
            insideBlock = true;
            continue;
        }
        if (!section) continue;

        const parsed = parseInterfaceLine(text);
        if (!parsed) continue;

        if (section === 'EXCEPTIONS') {
            exceptions.push(parsed.name);
        } else {
            parameters.push({ ...parsed, kind: section });
        }
    }

    return { parameters, exceptions };
}

function parseInterfaceLine(text: string): Omit<FmParameter, 'kind'> | undefined {
    // VALUE(NAME) | REFERENCE(NAME) | NAME   (TABLES and EXCEPTIONS have no wrapper)
    const head = text.match(/^(?:(VALUE|REFERENCE)\s*\(\s*([^)\s]+)\s*\)|([A-Za-z0-9_/]+))\s*(.*)$/);
    if (!head) return undefined;

    const passing = head[1] ? (head[1].toUpperCase() as 'VALUE' | 'REFERENCE') : undefined;
    const name = (head[2] ?? head[3]).toUpperCase();
    let rest = head[4] ?? '';

    let typing: FmParameter['typing'];
    let type: string | undefined;
    const typeMatch = rest.match(/^(TYPE|LIKE|STRUCTURE)\s+(\S+)\s*/i);
    if (typeMatch) {
        typing = typeMatch[1].toUpperCase() as FmParameter['typing'];
        type = typeMatch[2];
        rest = rest.slice(typeMatch[0].length);
    }

    const defaultMatch = rest.match(/\bDEFAULT\s+(.+?)(?:\s+OPTIONAL)?\s*$/i);
    const optional = /\bOPTIONAL\b/i.test(rest) || !!defaultMatch;

    return { name, passing, typing, type, optional, defaultValue: defaultMatch?.[1]?.trim() };
}

/**
 * @description Calls RFC-enabled function modules over the SAP Gateway JSON-RPC 2.0
 *              service. The signature of the function module is read first, so the
 *              request is validated and built from the real interface instead of
 *              guessed.
 * @extends BaseHandler
 */
export class JsonRemoteFunctionCallHandlers extends BaseHandler {
    private readonly metadataCache = new Map<string, FunctionModuleMetadata>();
    private requestId = 0;

    /**
     * @param adtclient    The shared ADT client.
     * @param ssoBootstrap Same callback AuthHandlers gets from index.ts
     *                     (`() => this.ensureSsoSession()`). Required for the
     *                     JSON-RPC call: the ADTClient is constructed with a
     *                     placeholder password (see index.ts), so the session
     *                     must come from SPNEGO/Kerberos (see ../sso.ts), never
     *                     from AdtHTTP.login().
     */
    constructor(
        adtclient: ADTClient,
        private readonly ssoBootstrap?: () => Promise<void>,
    ) {
        super(adtclient);
    }

    /**
     * The tool definitions. Separate from toolSpecs() only because the four runs
     * below read better next to each other than interleaved with 100 lines of
     * schema.
     */
    private definitions(): ToolDefinition[] {
        return [
            {
                name: 'readAbapFunctionModule',
                description:
                    'Read the interface (parameters, exceptions, defaults) of an RFC-enabled ABAP function ' +
                    'module. Uses RFC_GET_FUNCTION_INTERFACE over the SAP Gateway JSON-RPC service, which is ' +
                    'the same signature the dispatcher validates calls against, and falls back to parsing the ' +
                    'generated interface block in the ADT source. Call this before callFunctionViaJsonRpc to ' +
                    'find out which parameters exist.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        functionModuleName: {
                            type: 'string',
                            description: "Function module name, e.g. 'STFC_CONNECTION' or 'Z_MY_FUNC'."
                        }
                    },
                    required: ['functionModuleName']
                }
            },
            {
                name: 'callFunctionViaJsonRpc',
                description:
                    'Execute an RFC-enabled ABAP function module through the SAP Gateway JSON-RPC 2.0 service. ' +
                    'The interface is read first and the request validated against it. Parameter names are ' +
                    'ABAP names and are matched case-insensitively. Requires S_RFC authorisation for the ' +
                    "function module's group, and the function module must pass the SLDW whitelist " +
                    'SAP_JSON_RPC_FUNCTION_MODULES where that whitelist is active.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        functionModuleName: {
                            type: 'string',
                            description: "Function module name, e.g. 'STFC_CONNECTION'."
                        },
                        inputParameters: {
                            type: 'object',
                            description:
                                'Values for IMPORTING / CHANGING / TABLES parameters, keyed by ABAP parameter ' +
                                'name. TABLES parameters take an array of row objects. Defaults to {}.'
                        },
                        outputParameters: {
                            type: 'array',
                            items: { type: 'string' },
                            description:
                                'Names to pick out of the result. Omit or leave empty for all EXPORTING, ' +
                                'CHANGING and TABLES parameters.'
                        }
                    },
                    required: ['functionModuleName']
                }
            },
            {
                name: 'callFunctionsViaJsonRpc',
                description:
                    'Execute several RFC-enabled ABAP function modules in ONE JSON-RPC request, in the given ' +
                    'order. All members run in the same ABAP session and therefore the same LUW, which is what ' +
                    'makes update BAPIs work: put the BAPI and its BAPI_TRANSACTION_COMMIT (or _ROLLBACK) in a ' +
                    'single batch, because a separate call would run in its own LUW and never commit the first. ' +
                    'Every signature is read and every member validated before anything is sent. A member that ' +
                    'fails does not abort the others: each entry reports ok, output and error separately.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        calls: {
                            type: 'array',
                            description:
                                'The function module calls to execute, in order. One entry behaves exactly like ' +
                                'callFunctionViaJsonRpc.',
                            items: {
                                type: 'object',
                                properties: {
                                    functionModuleName: {
                                        type: 'string',
                                        description: "Function module name, e.g. 'BAPI_TRANSACTION_COMMIT'."
                                    },
                                    inputParameters: {
                                        type: 'object',
                                        description:
                                            'Values for IMPORTING / CHANGING / TABLES parameters, keyed by ABAP ' +
                                            'parameter name. TABLES parameters take an array of row objects. ' +
                                            'Defaults to {}.'
                                    },
                                    outputParameters: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description:
                                            'Names to pick out of this call\'s result. Omit or leave empty for ' +
                                            'all EXPORTING, CHANGING and TABLES parameters.'
                                    }
                                },
                                required: ['functionModuleName']
                            }
                        }
                    },
                    required: ['calls']
                }
            },
            {
                name: 'checkJsonRpcEndpoint',
                description:
                    'Probe the SAP Gateway JSON-RPC service with the CSRF-exempt JSONRPC.INIT method. Use this ' +
                    'to tell an inactive/misrouted SICF node apart from an authorisation or CSRF problem when ' +
                    'callFunctionViaJsonRpc fails.',
                inputSchema: { type: 'object', properties: {} }
            }
        ];
    }

    /**
     * Every run here is `selfTracked`: the four public methods below already call
     * trackRequest, because they are also the RFC route handed to DdicHandlers and
     * BasisHandlers as a callback, and those calls never pass through a tool.
     */
    protected toolSpecs(): ToolSpec[] {
        const definition = new Map(this.definitions().map(d => [d.name, d]));

        return [
            {
                definition: definition.get('readAbapFunctionModule')!,
                selfTracked: true,
                run: async args => ({
                    functionModule: await this.readAbapFunctionModule(args?.functionModuleName)
                })
            },
            {
                definition: definition.get('callFunctionViaJsonRpc')!,
                selfTracked: true,
                run: args => this.callFunctionViaJsonRpc(
                    args?.functionModuleName,
                    args?.inputParameters ?? {},
                    args?.outputParameters ?? []
                )
            },
            {
                definition: definition.get('callFunctionsViaJsonRpc')!,
                selfTracked: true,
                run: args => this.callFunctionsViaJsonRpc(args?.calls)
            },
            {
                definition: definition.get('checkJsonRpcEndpoint')!,
                selfTracked: true,
                // Reports an unreachable node in its payload rather than throwing:
                // "the SICF node is inactive" is this tool's answer, not its failure.
                run: async () => ({ endpoint: await this.checkJsonRpcEndpoint() })
            }
        ];
    }

    /**
     * @description Reads the interface of an ABAP function module.
     *
     *              Primary source is RFC_GET_FUNCTION_INTERFACE over JSON-RPC: it is
     *              what /IWBEP/CL_JSRPC_FUNCTION itself calls to build the parameter
     *              table, so it cannot disagree with the call that follows, and it
     *              reports OPTIONAL and DEFAULT directly.
     *
     *              Fallback is ADT: repository search for the FUGR/FF object, then the
     *              generated `*"` interface block in its source. This keeps
     *              introspection working when the JSON-RPC node is inactive, but it is
     *              only best effort — the ADT quick search does not return every
     *              function module and can be shadowed by a same-named DDIC object.
     * @param functionModuleName - The name of the ABAP function module (e.g. 'Z_MY_FUNC_MOD').
     * @returns A Promise resolving to the function module metadata, including parameters.
     * @throws {McpError} If the function module cannot be found or read by either route.
     */
    public async readAbapFunctionModule(functionModuleName: string): Promise<FunctionModuleMetadata> {
        const name = this.normalizeFunctionName(functionModuleName);
        const cached = this.metadataCache.get(name);
        if (cached) return cached;

        const startTime = performance.now();
        try {
            let metadata: FunctionModuleMetadata;
            try {
                metadata = await this.readInterfaceViaRfc(name);
            } catch (rfcError) {
                const reason = rfcError instanceof Error ? rfcError.message : String(rfcError);
                this.logger.warn('RFC interface lookup failed, falling back to ADT source', {
                    functionModule: name,
                    reason
                });
                try {
                    metadata = await this.readInterfaceViaAdt(name);
                } catch (adtError) {
                    const adtReason = adtError instanceof Error ? adtError.message : String(adtError);
                    throw new McpError(
                        ErrorCode.InvalidRequest,
                        `Could not read the interface of function module '${name}'. ` +
                        `${FM_INTERFACE_FUNCTION} over JSON-RPC failed: ${reason}. ` +
                        `ADT source lookup failed: ${adtReason}`
                    );
                }
            }

            this.metadataCache.set(name, metadata);
            this.trackRequest(startTime, true);
            this.logger.debug('Read function module interface', {
                functionModule: name,
                source: metadata.metadataSource,
                parameters: metadata.parameters.length,
                exceptions: metadata.exceptions.length
            });
            return metadata;
        } catch (error) {
            this.trackRequest(startTime, false);
            this.logger.error('Error reading function module', { functionModule: name, error });
            if (error instanceof McpError) throw error;
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to read ABAP function module '${name}': ${message}`
            );
        }
    }

    /** Authoritative signature, straight from the dispatcher's own source of truth. */
    private async readInterfaceViaRfc(name: string): Promise<FunctionModuleMetadata> {
        const result = await this.invokeJsonRpc(FM_INTERFACE_FUNCTION, { FUNCNAME: name });

        const rows: any[] = Array.isArray(result?.PARAMS) ? result.PARAMS : [];
        const parameters: FmParameter[] = [];
        const exceptions: string[] = [];

        for (const row of rows) {
            const paramName = String(row?.PARAMETER ?? '').toUpperCase();
            if (!paramName) continue;

            const paramClass = String(row?.PARAMCLASS ?? '').toUpperCase();
            if (paramClass === PARAMCLASS_EXCEPTION) {
                exceptions.push(paramName);
                continue;
            }

            const kind = PARAMCLASS_KINDS[paramClass];
            if (!kind) continue;

            const defaultValue = String(row?.DEFAULT ?? '').trim();
            const tableName = String(row?.TABNAME ?? '').trim();
            const fieldName = String(row?.FIELDNAME ?? '').trim();

            parameters.push({
                name: paramName,
                kind,
                type: tableName ? (fieldName ? `${tableName}-${fieldName}` : tableName) : undefined,
                optional: String(row?.OPTIONAL ?? '').trim().toUpperCase() === 'X' || !!defaultValue,
                defaultValue: defaultValue || undefined,
                description: String(row?.PARAMTEXT ?? '').trim() || undefined
            });
        }

        const metadata: FunctionModuleMetadata = {
            name,
            metadataSource: 'RFC_INTERFACE',
            parameters,
            exceptions
        };
        await this.enrichFromAdt(metadata);
        return metadata;
    }

    /**
     * Best-effort ADT enrichment: function group, ADT URIs and the description.
     * None of it is needed to place a call, so every failure is swallowed.
     */
    private async enrichFromAdt(metadata: FunctionModuleMetadata): Promise<void> {
        try {
            const search = await this.invokeJsonRpc(FM_GROUP_FUNCTION, { FUNCNAME: metadata.name });
            const hit = (Array.isArray(search?.FUNCTIONS) ? search.FUNCTIONS : [])
                .find((f: any) => String(f?.FUNCNAME ?? '').toUpperCase() === metadata.name);
            const group = String(hit?.GROUPNAME ?? '').trim();
            if (!group) return;

            metadata.functionGroup = group.toUpperCase();
            metadata.objectUrl = this.functionModuleUri(group, metadata.name);

            const structure = await this.adtclient.objectStructure(metadata.objectUrl);
            metadata.sourceUrl = ADTClient.mainInclude(structure);
            metadata.description = structure.metaData?.['adtcore:description'] ?? metadata.description;
        } catch (error) {
            this.logger.debug('ADT enrichment skipped', {
                functionModule: metadata.name,
                reason: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Fallback signature from the ADT source.
     *
     * The repository quick search is called without an object type filter on
     * purpose: abap-adt-api truncates 'FUGR/FF' to 'FUGR' (search.js), and that
     * filter matches function groups only, so it returns nothing for a function
     * module. The FUGR/FF hits are filtered out of the untyped result instead.
     */
    private async readInterfaceViaAdt(name: string): Promise<FunctionModuleMetadata> {
        const searchResults = await this.adtclient.searchObject(name, undefined, 100);
        const hit = searchResults.find(r =>
            r['adtcore:type']?.startsWith(FM_OBJECT_TYPE) &&
            r['adtcore:name']?.toUpperCase() === name
        );

        if (!hit?.['adtcore:uri']) {
            const shadowed = searchResults
                .filter(r => r['adtcore:name']?.toUpperCase() === name)
                .map(r => r['adtcore:type'])
                .join(', ');
            throw new McpError(
                ErrorCode.InvalidRequest,
                `The ADT repository search did not return a ${FM_OBJECT_TYPE} object named '${name}'` +
                (shadowed ? ` (it returned ${shadowed} under that name instead)` : '') + '.'
            );
        }

        const structure = await this.adtclient.objectStructure(hit['adtcore:uri']);
        const sourceUrl = ADTClient.mainInclude(structure);
        const source = await this.adtclient.getObjectSource(sourceUrl);
        const { parameters, exceptions } = parseFunctionInterface(source);

        return {
            name,
            metadataSource: 'ADT_SOURCE',
            objectUrl: hit['adtcore:uri'],
            sourceUrl,
            functionGroup: hit['adtcore:uri'].match(/\/functions\/groups\/([^/]+)/)?.[1]?.toUpperCase(),
            description: hit['adtcore:description'] ?? structure.metaData?.['adtcore:description'],
            parameters,
            exceptions
        };
    }

    /** ADT addresses function modules under their group; namespaces are escaped. */
    private functionModuleUri(group: string, name: string): string {
        const segment = (value: string) => encodeURIComponent(value.trim().toLowerCase());
        return `/sap/bc/adt/functions/groups/${segment(group)}/fmodules/${segment(name)}`;
    }

    /**
     * @description Executes a function module through the SAP Gateway JSON-RPC 2.0
     *              service (/sap/gw/jsonrpc, handler /IWBEP/CL_JSRPC_HTTP_HANDLER).
     *              The interface of the function module is read first, the request is
     *              built and validated against it, sent over the SSO-authenticated
     *              session, and the JSON-RPC envelope is unwrapped again.
     * @param functionModuleName - The ABAP function module name.
     * @param inputParameters - Values for IMPORTING / CHANGING / TABLES parameters, keyed by
     *                          ABAP parameter name (case insensitive).
     * @param outputParameters - Names to pick out of the result. Empty means "all
     *                           EXPORTING, CHANGING and TABLES parameters".
     * @returns The picked output parameters plus the raw JSON-RPC result.
     * @throws {McpError} If validation fails, the call fails, or the service reports a JSON-RPC error.
     */
    public async callFunctionViaJsonRpc(
        functionModuleName: string,
        inputParameters: Record<string, any> = {},
        outputParameters: string[] = []
    ): Promise<JsonRpcCallResult> {
        const startTime = performance.now();

        try {
            const { prepared, replies } = await this.runCalls([
                { functionModuleName, inputParameters, outputParameters }
            ]);
            const [call] = prepared;
            const [reply] = replies;

            // The single-call API reports a JSON-RPC error by throwing; only the
            // batch API reports it per member, where the other members may well
            // have succeeded.
            if (reply.error) throw this.toMcpError(reply.error, call.metadata.name);

            const callResult: JsonRpcCallResult = {
                functionModule: call.metadata.name,
                output: this.pickOutput(reply.result, call.wanted, call.metadata.name),
                raw: reply.result
            };

            this.trackRequest(startTime, true);
            return callResult;
        } catch (error) {
            this.trackRequest(startTime, false);
            this.logger.error('Error during JSON-RPC remote call', { functionModuleName, error });
            if (error instanceof McpError) throw error;
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to execute JSON-RPC call for '${functionModuleName}': ${message}`
            );
        }
    }

    /**
     * @description Executes several function modules in a single JSON-RPC batch
     *              request. `/IWBEP/CL_JSRPC_PROCESSOR->process` runs the members
     *              in order within one HTTP request, so they share one ABAP
     *              session and one LUW. That is the point: an update BAPI and its
     *              BAPI_TRANSACTION_COMMIT only commit the same LUW when they
     *              travel together — issued as two separate calls, the commit
     *              would run in its own LUW and the BAPI's changes would be lost.
     *
     *              Every member's signature is read and every request validated
     *              before anything is sent, so a typo in the last member cannot
     *              leave the earlier ones half-applied.
     * @param calls - The calls to execute, in order. One entry behaves exactly
     *                like callFunctionViaJsonRpc, but reports errors per member
     *                instead of throwing.
     * @returns One entry per call, in the order given, plus an overall `ok`.
     * @throws {McpError} If a signature cannot be read or a request fails validation —
     *                    i.e. only for failures that happen before anything is sent.
     */
    public async callFunctionsViaJsonRpc(calls: JsonRpcCallSpec[]): Promise<JsonRpcBatchResult> {
        const startTime = performance.now();

        try {
            const { prepared, replies } = await this.runCalls(calls);
            const entries = prepared.map((call, index) => this.toBatchEntry(call, replies[index]));
            const ok = entries.every(entry => entry.ok);

            this.trackRequest(startTime, ok);
            return { ok, calls: entries };
        } catch (error) {
            this.trackRequest(startTime, false);
            this.logger.error('Error during JSON-RPC batch call', {
                functionModules: (calls ?? []).map(c => c?.functionModuleName),
                error
            });
            if (error instanceof McpError) throw error;
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(ErrorCode.InternalError, `Failed to execute JSON-RPC batch: ${message}`);
        }
    }

    /**
     * The one path every function module call takes, whether it is a single call
     * or a batch: read each signature, validate each request, then send them all
     * in one round trip.
     */
    private async runCalls(specs: JsonRpcCallSpec[]): Promise<{ prepared: PreparedCall[]; replies: JsonRpcResponse[] }> {
        if (!Array.isArray(specs) || specs.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'At least one function module call is required.');
        }

        const prepared: PreparedCall[] = [];
        for (const spec of specs) {
            // Sequential on purpose: the signature lookups are cached per function
            // module, so a batch calling the same one twice reads it once.
            const metadata = await this.readAbapFunctionModule(spec?.functionModuleName);
            prepared.push({
                metadata,
                params: this.buildParams(metadata, spec?.inputParameters ?? {}),
                wanted: this.resolveOutputParameters(metadata, spec?.outputParameters ?? [])
            });
        }

        const requests = prepared.map(call => this.buildRequest(call.metadata.name, call.params));
        return { prepared, replies: await this.invokeJsonRpcBatch(requests) };
    }

    /** Turns one reply into a batch entry, keeping a failure local to its member. */
    private toBatchEntry(call: PreparedCall, reply: JsonRpcResponse): JsonRpcBatchEntry {
        const functionModule = call.metadata.name;

        if (reply.error) {
            return {
                functionModule,
                ok: false,
                error: {
                    code: reply.error.code,
                    message: this.describeJsonRpcError(reply.error, functionModule),
                    data: reply.error.data
                }
            };
        }

        return {
            functionModule,
            ok: true,
            output: this.pickOutput(reply.result, call.wanted, functionModule),
            raw: reply.result
        };
    }

    /**
     * @description Probes the JSON-RPC node with JSONRPC.INIT, the one method
     *              /IWBEP/CL_JSRPC_HTTP_SERVER exempts from the CSRF guard. A
     *              successful probe therefore proves the SICF node is active and
     *              reachable even when a real call is rejected for CSRF or S_RFC.
     * @returns The endpoint and session settings the service reports.
     */
    public async checkJsonRpcEndpoint(): Promise<JsonRpcEndpointStatus> {
        const startTime = performance.now();
        try {
            const result = await this.invokeJsonRpc('JSONRPC.INIT', undefined);
            this.trackRequest(startTime, true);
            return {
                path: JSONRPC_PATH,
                reachable: true,
                endpoint: result?.ENDPOINT,
                session: result?.SESSION
            };
        } catch (error) {
            this.trackRequest(startTime, false);
            return {
                path: JSONRPC_PATH,
                reachable: false,
                problem: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * One JSON-RPC round trip, without any metadata lookup — readAbapFunctionModule
     * itself goes through here, so this must not call back into it.
     * @returns The `result` member of the response.
     */
    private async invokeJsonRpc(method: string, params?: Record<string, any>): Promise<any> {
        const [reply] = await this.invokeJsonRpcBatch([this.buildRequest(method, params)]);
        if (reply.error) throw this.toMcpError(reply.error, method);
        return reply.result;
    }

    /** One request object. Ids are unique per handler instance, so replies can be matched. */
    private buildRequest(method: string, params?: Record<string, any>): JsonRpcRequest {
        return {
            jsonrpc: '2.0',
            id: ++this.requestId,
            method,
            // The parser rejects anything that is not an object or null.
            ...(params && Object.keys(params).length ? { params } : {})
        };
    }

    /**
     * One round trip carrying 1..n requests, and the only place that touches the
     * transport.
     *
     * A single request is sent as a bare object and a batch as an array, which is
     * what `/IWBEP/CL_JSRPC_PROCESSOR->process` distinguishes on: it answers an
     * array request with an array and a single one with an object. Keeping the
     * one-request form on the wire is deliberate — it is the shape verified
     * against DEV/100 — while everything above this method is count-agnostic.
     *
     * @returns One reply per request, in the order the requests were given.
     */
    private async invokeJsonRpcBatch(requests: JsonRpcRequest[]): Promise<JsonRpcResponse[]> {
        this.logger.debug('Calling JSON-RPC', {
            path: JSONRPC_PATH,
            batch: requests.length > 1,
            methods: requests.map(r => r.method)
        });

        const response = await this.ssoRequest(JSONRPC_PATH, {
            method: 'POST',
            headers: {
                // /IWBEP/IF_JSRPC_TRANSPORT~VALIDATE checks the first 16 characters.
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            qs: this.sapQueryParams(),
            body: JSON.stringify(requests.length === 1 ? requests[0] : requests)
        });

        return this.parseJsonRpcBody(response, requests);
    }

    /** Maps the JSON-RPC error codes /IWBEP/CL_JSRPC_* emits onto MCP errors. */
    private toMcpError(error: JsonRpcError, method: string): McpError {
        const message = this.describeJsonRpcError(error, method);

        // -31000 is the SAP extension for a classic ABAP exception. It is an
        // ordinary outcome of the function module, not a transport failure, so
        // report the raised exception rather than a generic internal error.
        if (error.data?.EXCEPTION?.NAME) return new McpError(ErrorCode.InvalidRequest, message);

        switch (error.code) {
            case -32601: // method not found
                return new McpError(ErrorCode.InvalidRequest, message);
            case -32600: // invalid request
            case -32602: // invalid params
                return new McpError(ErrorCode.InvalidParams, message);
            default:
                return new McpError(ErrorCode.InternalError, message);
        }
    }

    /**
     * The wording of a JSON-RPC error, shared by the single-call path (which
     * throws it) and the batch path (which reports it per member).
     */
    private describeJsonRpcError(error: JsonRpcError, method: string): string {
        const raised = error.data?.EXCEPTION;
        if (raised?.NAME) {
            return `Function module '${method}' raised exception ${raised.NAME}` +
                (raised.MESSAGE ? `: ${raised.MESSAGE}` : '') + '.';
        }

        const detail = error.data ? ` (${JSON.stringify(error.data)})` : '';
        const base = `JSON-RPC error ${error.code} from '${method}': ${error.message}${detail}`;

        return error.code === -32601
            ? `${base}. The function module does not exist, is not RFC-enabled, or you lack S_RFC ` +
              `authorisation for its function group.`
            : base;
    }

    /**
     * Rejects names the JSON-RPC dispatcher would not route to a function module.
     * /IWBEP/CL_JSRPC_PROCESSOR->get_method splits `namespace.name` on dots, so a
     * dot in the name would be read as a namespace and fail as "method not found".
     */
    private normalizeFunctionName(functionModuleName: string): string {
        const name = String(functionModuleName ?? '').trim().toUpperCase();
        if (!name) {
            throw new McpError(ErrorCode.InvalidParams, 'A function module name is required.');
        }
        if (name.includes('.')) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `'${name}' is not a valid function module name: the JSON-RPC dispatcher reads a dot as a ` +
                `namespace separator.`
            );
        }
        return name;
    }

    /**
     * Maps the caller's values onto the real parameter names and rejects anything
     * the function module does not accept.
     *
     * Upper-casing is load-bearing, not cosmetic: the server fills the parameter
     * structure with `CALL TRANSFORMATION id`, which matches component names
     * case-sensitively and *silently ignores* the ones it cannot match. A lower
     * case key is therefore dropped without any error, and the function module
     * runs with an empty parameter.
     */
    private buildParams(metadata: FunctionModuleMetadata, inputParameters: Record<string, any>): Record<string, any> {
        const inputs = metadata.parameters.filter(p => INPUT_KINDS.includes(p.kind));
        const byName = new Map(inputs.map(p => [p.name, p]));
        const params: Record<string, any> = {};

        for (const [key, value] of Object.entries(inputParameters ?? {})) {
            const parameter = byName.get(key.trim().toUpperCase());
            if (!parameter) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `'${key}' is not an input parameter of ${metadata.name}. ` +
                    `Accepted: ${inputs.map(p => `${p.name} (${p.kind})`).join(', ') || '<none>'}`
                );
            }
            params[parameter.name] = value;
        }

        const missing = inputs
            .filter(p => p.kind === 'IMPORTING' && !p.optional && !(p.name in params))
            .map(p => p.name);
        if (missing.length) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Mandatory IMPORTING parameter(s) of ${metadata.name} missing: ${missing.join(', ')}`
            );
        }

        return params;
    }

    /** Validates the requested outputs, or defaults to everything the module returns. */
    private resolveOutputParameters(metadata: FunctionModuleMetadata, requested: string[]): string[] {
        const outputs = metadata.parameters.filter(p => OUTPUT_KINDS.includes(p.kind));
        if (!requested?.length) return outputs.map(p => p.name);

        const byName = new Map(outputs.map(p => [p.name, p]));
        return requested.map(name => {
            const parameter = byName.get(name.trim().toUpperCase());
            if (!parameter) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `'${name}' is not an output parameter of ${metadata.name}. ` +
                    `Available: ${outputs.map(p => `${p.name} (${p.kind})`).join(', ') || '<none>'}`
                );
            }
            return parameter.name;
        });
    }

    /** Picks the requested names out of the result, tolerating a lower-cased writer. */
    private pickOutput(result: any, wanted: string[], functionModuleName: string): Record<string, any> {
        if (!result || typeof result !== 'object') return {};

        const lookup = new Map(Object.keys(result).map(k => [k.toUpperCase(), k]));
        const output: Record<string, any> = {};
        for (const name of wanted) {
            const key = lookup.get(name);
            if (key === undefined) {
                this.logger.warn('Output parameter missing from JSON-RPC result', {
                    functionModule: functionModuleName,
                    parameter: name
                });
                continue;
            }
            output[name] = result[key];
        }
        return output;
    }

    /**
     * Issues a raw request over the SPNEGO/Kerberos session.
     *
     * Two things must be handled explicitly here, because the ADTClient is
     * created with a placeholder password (index.ts):
     *  - If the client is not logged in, AdtHTTP.request() would call login()
     *    and send that placeholder via Basic Auth. So the SSO session is
     *    bootstrapped up front instead.
     *  - The library's own re-login-on-401 is skipped for stateful clients
     *    (and would use the placeholder anyway), so an expired session is
     *    retried here by re-running the SSO bootstrap once.
     *
     * The Cookie and x-csrf-token headers are attached by AdtHTTP from the
     * injected session and must never be set here by hand.
     */
    private async ssoRequest(path: string, config: RequestOptions): Promise<HttpClientResponse> {
        const http = this.adtclient.httpClient;

        if (!http.loggedin) {
            if (!this.ssoBootstrap) {
                throw new McpError(
                    ErrorCode.InternalError,
                    'No SSO session established and no SSO bootstrap available. ' +
                    'Construct JsonRemoteFunctionCallHandlers with the ensureSsoSession callback.'
                );
            }
            await this.ssoBootstrap();
        }

        try {
            return await http.request(path, config);
        } catch (error) {
            if (!this.ssoBootstrap || !this.isSessionExpired(error)) throw error;
            this.logger.warn('Session expired, re-running SSO bootstrap', { path });
            await this.ssoBootstrap();
            return await http.request(path, config);
        }
    }

    /** 401 / CSRF-required / 403 — i.e. the SAP session or Kerberos ticket went stale. */
    private isSessionExpired(error: unknown): boolean {
        if (!isAdtException(error)) return false;
        if (isLoginError(error)) return true;
        return isAdtError(error) && error.err === 403;
    }

    /** sap-client / sap-language, exactly as AdtHTTP.login() and the SSO bootstrap send them. */
    private sapQueryParams(): Record<string, string> {
        const qs: Record<string, string> = {};
        if (this.adtclient.client) qs['sap-client'] = this.adtclient.client;
        if (this.adtclient.language) qs['sap-language'] = this.adtclient.language;
        return qs;
    }

    /**
     * Unwraps the response envelope into one reply per request.
     *
     * The server answers a batch with an array and a single request with an
     * object, so both are normalised here. Replies are matched on `id` rather
     * than position, because nothing guarantees a batch comes back in order.
     */
    private parseJsonRpcBody(
        response: HttpClientResponse,
        requests: JsonRpcRequest[]
    ): JsonRpcResponse[] {
        const methods = requests.map(r => r.method).join(', ');

        let parsed: JsonRpcResponse | JsonRpcResponse[];
        try {
            parsed = JSON.parse(response.body);
        } catch {
            throw new McpError(
                ErrorCode.InternalError,
                `JSON-RPC call for '${methods}' returned a non-JSON body (HTTP ${response.status}). ` +
                `Check that the SICF node '${JSONRPC_PATH}' is active (SAP_GWFND, /IWBEP/CL_JSRPC_HTTP_HANDLER) ` +
                `or set SAP_JSONRPC_PATH. Body starts with: ${response.body.slice(0, 200)}`
            );
        }

        const replies = Array.isArray(parsed) ? parsed : [parsed];
        return requests.map((request, index) => {
            // A rejected request is answered with id null (the server could not
            // read the id), so fall back to position when the counts line up.
            const match = replies.find(r => r.id === request.id)
                ?? (replies.length === requests.length ? replies[index] : undefined);
            if (!match) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `The JSON-RPC response for '${methods}' contains no answer for '${request.method}' ` +
                    `(id ${request.id}); it held ${replies.length} of ${requests.length} replies.`
                );
            }
            return match;
        });
    }
}
