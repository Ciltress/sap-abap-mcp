import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';
import { ADTClient, isClassStructure } from "abap-adt-api";

/**
 * Which type wins when one name exists as several objects — a function group and
 * a function module called ZPP_EXT_LABEL_DATA, for instance. Development objects
 * come before dictionary objects; anything unlisted keeps the order the
 * repository search returned. The pick is never silent: `alternatives` always
 * carries the rest.
 */
const TYPE_PREFERENCE = [
    'CLAS/OC', 'INTF/OI', 'PROG/P', 'FUGR/FF', 'FUGR/F', 'PROG/I',
    'TABL/DT', 'TABL/DS', 'VIEW/DV', 'DTEL/DE', 'DOMA/DD', 'TTYP/DA'
];

export class ObjectHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'objectStructure',
                    description:
                        'Metadata and links of an ABAP object. The link with type "text/plain" is the SOURCE url ' +
                        '(relative to objectUrl) that getObjectSource and the code-intelligence tools need.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objectUrl: {
                                type: 'string',
                                description: "ADT object URL, e.g. '/sap/bc/adt/oo/classes/zcl_foo'."
                            },
                            version: {
                                type: 'string',
                                description: 'Object version. Defaults to the active one.',
                                enum: ['active', 'inactive', 'workingArea']
                            }
                        },
                        required: ['objectUrl']
                    }
                },
                onFailure: 'Failed to get object structure',
                run: async args => ({
                    structure: await this.adtclient.objectStructure(args.objectUrl, args.version),
                    message: 'Object structure retrieved successfully'
                })
            },
            {
                definition: {
                    name: 'searchObject',
                    description:
                        'Find ABAP objects by name or name pattern — the general search, for when you do not ' +
                        'know an exact name. A trailing * is added when you supply no wildcard, and the query ' +
                        'is upper-cased, so "zcl_foo" finds ZCL_FOO_BAR. objType matches the full ADT type ' +
                        '(FUGR/FF really does select function modules). Reports truncation explicitly. ' +
                        'To read one object you already know the name of, use readAbapObject instead.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description:
                                    "Name or name pattern, e.g. 'ZCL_FOO' or 'ZCL_*_HELPER'. A '*' is " +
                                    'appended when you pass none, so a bare name behaves as a prefix search.'
                            },
                            objType: {
                                type: 'string',
                                description:
                                    "Full ADT type to keep, e.g. 'CLAS/OC', 'PROG/P', 'FUGR/FF'. Matched " +
                                    'case-insensitively against the whole type, not just its first segment. ' +
                                    'Omit for every type.'
                            },
                            max: {
                                type: 'number',
                                description: 'Maximum number of results to return. Defaults to 100.'
                            }
                        },
                        required: ['query']
                    },
                    narrowingHint: 'Lower `max`, narrow the pattern, or set `objType` to one ADT type.'
                },
                onFailure: 'Failed to search objects',
                run: args => this.searchObject(args)
            },
            {
                definition: {
                    name: 'readAbapObject',
                    description:
                        'Read an ABAP object by NAME — no URL needed. Resolves the name, picks the right object ' +
                        'when several types share it, and returns the metadata together with the source in one ' +
                        'call. This replaces the searchObject -> objectStructure -> source-link -> getObjectSource ' +
                        'sequence: prefer it for reading classes, interfaces, programs, includes, function groups ' +
                        'and function modules. Objects that have no source (tables, structures, transactions) come ' +
                        'back with hasSource:false and a pointer to the tool that does describe them.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objectName: {
                                type: 'string',
                                description: "Object name, e.g. 'ZCL_MY_CLASS' or 'ZPP_LABEL_DRUCK'. Case insensitive."
                            },
                            objectType: {
                                type: 'string',
                                description:
                                    "ADT type to disambiguate when one name exists several times, e.g. 'FUGR/FF' " +
                                    "for the function module rather than 'FUGR/F' for the group. Omit unless the " +
                                    'answer came back with ambiguous:true.'
                            },
                            includeSource: {
                                type: 'boolean',
                                description: 'Return the source text. Defaults to true; set false for metadata only.'
                            },
                            version: {
                                type: 'string',
                                description: 'Object version. Defaults to the active one.',
                                enum: ['active', 'inactive', 'workingArea']
                            }
                        },
                        required: ['objectName']
                    },
                    narrowingHint: 'Set includeSource:false for metadata only, then read the part you need.'
                },
                onFailure: 'Failed to read ABAP object',
                run: args => this.readAbapObject(args)
            },
            {
                definition: {
                    name: 'searchPackages',
                    description:
                        'Find packages by name pattern and list what is in them, in one call. Takes several ' +
                        'patterns at once (e.g. ["ZPP_*","Z_PP*"]), normalises each one the way the repository ' +
                        'search needs it (upper case, trailing * added when missing), merges and de-duplicates the ' +
                        'hits, then expands every package into its objects grouped by type. Use this instead of ' +
                        'searchObject + nodeContents per package when surveying a naming convention. Reports ' +
                        'truncation explicitly, so a capped result is never mistaken for a complete one.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            patterns: {
                                type: 'array',
                                items: { type: 'string' },
                                description:
                                    "Package name patterns, e.g. ['ZPP_*','Z_PP*']. A pattern without '*' gets one " +
                                    'appended, so \'ZPP_\' and \'ZPP_*\' behave the same.'
                            },
                            includeContents: {
                                type: 'boolean',
                                description:
                                    'Expand each package into its objects. Costs one extra call per package. ' +
                                    'Defaults to true; set false for a cheap name-only survey.'
                            },
                            objectTypes: {
                                type: 'array',
                                items: { type: 'string' },
                                description:
                                    "Keep only these ADT object types in the contents, e.g. ['CLAS/OC','PROG/P']. " +
                                    'Matched case-insensitively against the full type. Omit for everything.'
                            },
                            maxPerPattern: {
                                type: 'number',
                                description: 'Maximum packages per pattern. Defaults to 100.'
                            }
                        },
                        required: ['patterns']
                    },
                    narrowingHint: 'Set includeContents:false for a name-only survey, or lower `maxPerPattern`.'
                },
                onFailure: 'Failed to search packages',
                run: args => this.searchPackages(args)
            },
            {
                definition: {
                    name: 'editAbapSource',
                    description:
                        'Change the source of an ABAP object by NAME and activate it, in one call. Performs the ' +
                        'whole cycle — lock, write, activate, unlock — and releases the lock on every path, ' +
                        'including failure, so a failed edit cannot leave the object locked. This is a FULL ' +
                        'REPLACE of the source: read it with readAbapObject first, edit the text, and send it ' +
                        'complete. Prefer this over driving lock / setObjectSource / activateByName / unLock ' +
                        'yourself; those remain for edits that need the steps apart. Check `activation.success` ' +
                        'in the answer — a syntax error comes back as success:false with messages, not as an error.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objectName: {
                                type: 'string',
                                description:
                                    "Object name, e.g. 'ZCL_MY_CLASS'. Case insensitive. Resolved through the " +
                                    'repository search, which only knows ACTIVE objects — to fill an object you ' +
                                    'have just created, pass objectUrl instead.'
                            },
                            objectUrl: {
                                type: 'string',
                                description:
                                    "ADT object URL, e.g. '/sap/bc/adt/programs/programs/z_new'. Use this instead " +
                                    'of objectName for an object that is not active yet — a freshly created one is ' +
                                    'invisible to the repository search until its first activation. createObject ' +
                                    'tells you this URL.'
                            },
                            source: {
                                type: 'string',
                                description: 'The complete new source text. This replaces the whole include.'
                            },
                            objectType: {
                                type: 'string',
                                description:
                                    "ADT type, to disambiguate when one name exists several times, e.g. 'FUGR/FF'. " +
                                    'Omit unless readAbapObject came back with ambiguous:true.'
                            },
                            include: {
                                type: 'string',
                                description:
                                    'For classes: which include to write. Defaults to the main source, which is ' +
                                    'what you want unless you are editing local test classes.',
                                enum: ['definitions', 'implementations', 'macros', 'testclasses', 'main']
                            },
                            transport: {
                                type: 'string',
                                description:
                                    'Transport request for the change. Omit for local ($TMP) objects, and omit ' +
                                    'when the object is already in a request — the lock reports that one and it ' +
                                    'is used automatically.'
                            },
                            activate: {
                                type: 'boolean',
                                description:
                                    'Activate after writing. Defaults to true. Set false to leave the change ' +
                                    'inactive, e.g. when several objects have to be activated together.'
                            }
                        },
                        required: ['source']
                    },
                    narrowingHint:
                        'The answer is small; if it overran, the activation returned many messages. ' +
                        'Fix the reported syntax errors and edit again.'
                },
                onFailure: 'Failed to edit ABAP source',
                run: args => this.editAbapSource(args)
            },
            {
                definition: {
                    name: 'findObjectPath',
                    description: 'Package hierarchy (breadcrumb) leading to an object - where it lives in the repository tree.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objectUrl: {
                                type: 'string',
                                description: 'ADT object URL.'
                            }
                        },
                        required: ['objectUrl']
                    }
                },
                onFailure: 'Failed to find object path',
                run: async args => ({
                    path: await this.adtclient.findObjectPath(args.objectUrl),
                    message: 'Object path found successfully'
                })
            },
            {
                definition: {
                    name: 'objectTypes',
                    description:
                        'All object types this system knows, with their ADT URI templates. Useful for mapping a ' +
                        'type id to a URL shape.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get object types',
                run: async () => ({
                    types: await this.adtclient.objectTypes(),
                    message: 'Object types retrieved successfully'
                })
            },
            {
                definition: {
                    name: 'reentranceTicket',
                    description:
                        'Short-lived SSO ticket for handing the current session to a browser or SAP GUI.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get reentrance ticket',
                run: async () => ({
                    ticket: await this.adtclient.reentranceTicket(),
                    message: 'Reentrance ticket retrieved successfully'
                })
            }
        ];
    }

    /**
     * The two traps this tool used to carry are handled here rather than
     * documented at the caller, because a warning in a description only helps a
     * reader who happens to be paying attention:
     *
     *  1. The repository search adds no wildcard, so 'ZCL_FOO' matched only an
     *     exact 'ZCL_FOO'. One is appended when the caller supplies none — the
     *     same normalisation searchPackages does.
     *  2. abap-adt-api truncates objType to its first segment, so 'FUGR/FF' asked
     *     the server for function *groups*. The filter is never sent; results are
     *     matched on adtcore:type here, where the full type survives.
     */
    private async searchObject(args: any): Promise<Record<string, any>> {
        const raw = String(args?.query ?? '').trim();
        if (!raw) {
            throw new McpError(ErrorCode.InvalidParams, 'A query is required.');
        }
        // Upper case too: the search is case sensitive on older systems, and
        // ABAP object names are stored upper case.
        const query = /[*+]/.test(raw) ? raw.toUpperCase() : `${raw.toUpperCase()}*`;
        const wantedType = args?.objType ? String(args.objType).trim().toUpperCase() : undefined;
        const max = Number.isFinite(args?.max) ? Number(args.max) : 100;

        // Over-fetch when filtering client-side, so a type filter does not
        // silently return fewer than `max` matches it could have found.
        const fetchMax = wantedType ? Math.min(max * 10, 1000) : max;
        const hits = await this.adtclient.searchObject(query, undefined, fetchMax);

        const matched = wantedType
            ? hits.filter(h => (h['adtcore:type'] ?? '').toUpperCase() === wantedType)
            : hits;
        const results = matched.slice(0, max);
        const truncated = matched.length > results.length || hits.length >= fetchMax;

        return {
            query,
            // Say so when the pattern was changed, so a surprising result set is
            // traceable to the normalisation.
            queryNormalised: query !== raw ? `'${raw}' searched as '${query}'` : undefined,
            objType: wantedType,
            results,
            found: matched.length,
            shown: results.length,
            truncated,
            message: truncated
                ? `Showing ${results.length} of at least ${matched.length}. Narrow the ` +
                  `pattern or raise max.`
                : 'Object search completed successfully'
        };
    }

    /**
     * @description Resolves an object name to the object itself and reads its source.
     *              Wraps the four-step dance the repository otherwise demands:
     *              search -> structure -> source link -> source.
     * @param args.objectName - The object name. Case insensitive.
     * @param args.objectType - ADT type, to disambiguate a name used by several objects.
     * @param args.includeSource - Read the source. Defaults to true.
     * @param args.version - Object version. Defaults to active.
     * @returns Metadata, the resolved URLs, and the source when the object has one.
     * @throws {McpError} If nothing of that name exists, or the requested type does not.
     */
    private async readAbapObject(args: any): Promise<Record<string, any>> {
        const { chosen, named, candidates } = await this.resolveObject(args?.objectName, args?.objectType);
        const chosenType = (chosen['adtcore:type'] ?? '').toUpperCase();
        const objectUrl = chosen['adtcore:uri'];

        const result: Record<string, any> = {
            name: chosen['adtcore:name'],
            type: chosen['adtcore:type'],
            package: chosen['adtcore:packageName'],
            objectUrl
        };

        // More than one object answers to this name, so say which was taken and
        // what the others were — picking silently is how you read the wrong source.
        if (named.length > 1) {
            result.ambiguous = candidates.length > 1;
            result.alternatives = named
                .filter(h => h !== chosen)
                .map(h => ({ name: h['adtcore:name'], type: h['adtcore:type'], objectUrl: h['adtcore:uri'] }));
        }

        const structure = await this.adtclient.objectStructure(objectUrl, args?.version);
        result.description = structure.metaData?.['adtcore:description'] ?? chosen['adtcore:description'];
        result.responsible = structure.metaData?.['adtcore:responsible'];
        result.changedAt = structure.metaData?.['adtcore:changedAt'];
        result.changedBy = structure.metaData?.['adtcore:changedBy'];

        // mainInclude(..., false) returns the object url unchanged when there is
        // no source link; with the default it would invent '<objectUrl>/source/main'
        // and 404 on everything that has no source, e.g. a database table.
        const sourceUrl = ADTClient.mainInclude(structure, false);
        result.hasSource = !!sourceUrl && sourceUrl !== objectUrl;

        if (isClassStructure(structure)) {
            // definitions / implementations / macros / testclasses / main
            result.includes = Object.fromEntries(ADTClient.classIncludes(structure));
        }

        if (result.hasSource) {
            result.sourceUrl = sourceUrl;
            if (args?.includeSource !== false) {
                result.source = await this.adtclient.getObjectSource(
                    sourceUrl,
                    args?.version ? { version: args.version } : undefined
                );
            }
        } else {
            result.hint = chosenType.startsWith('TABL') || chosenType.startsWith('VIEW')
                ? `${chosenType} has no source. Use describeAbapTable for its fields, or tableContents / runQuery for its rows.`
                : `${chosenType} has no ADT source representation; the metadata above is all ADT exposes.`;
        }

        return { object: result, message: 'ABAP object read successfully' };
    }

    /**
     * @description Writes new source to an object and activates it, releasing the
     *              lock whatever happens.
     *
     *              The four-step cycle this replaces put the hard part on the
     *              caller: the order, the lifetime of a lock handle, that the lock
     *              is bound to the stateful session, and that a failure halfway
     *              through still obliges an unLock. None of that was in a schema —
     *              it was prose in AGENTS.md and a warning in profiles.ts. A lock
     *              left behind by a failed edit blocks other developers on a shared
     *              system, so the unlock is in a finally rather than on the happy path.
     * @param args.objectName - The object to change.
     * @param args.source - The complete new source.
     * @param args.include - For classes: which include. Defaults to main.
     * @param args.transport - Request for the change. Defaults to the one the object is in.
     * @param args.activate - Activate afterwards. Defaults to true.
     * @returns What was written, the transport used, and the activation result.
     * @throws {McpError} If the object cannot be found, has no source, or the write fails.
     */
    private async editAbapSource(args: any): Promise<Record<string, any>> {
        const source = args?.source;
        if (typeof source !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'A complete `source` string is required. This tool replaces the whole include rather ' +
                'than patching it — read the current source with readAbapObject first.'
            );
        }

        // By URL when one was given, by name otherwise. The URL route exists because
        // the repository search only knows ACTIVE objects: a just-created program is
        // real, reachable and inactive, and resolving it by name answers "no object
        // named that was found" — which is both wrong and discouraging.
        const givenUrl = String(args?.objectUrl ?? '').trim();
        if (!givenUrl && !args?.objectName) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Name the object to change: `objectName` for an active object, or `objectUrl` for one ' +
                'that is not active yet (a freshly created object is not in the repository search).'
            );
        }

        const objectUrl = givenUrl || (await this.resolveObject(args.objectName, args?.objectType)).chosen['adtcore:uri'];
        const structure = await this.adtclient.objectStructure(objectUrl);
        const name = structure.metaData?.['adtcore:name'] ?? String(args?.objectName ?? '').trim().toUpperCase();
        const objectType = structure.metaData?.['adtcore:type'] ?? 'The object';

        // Which include to write. mainInclude(..., false) hands back the object url
        // unchanged when there is no source at all, which is how a table is told
        // apart from a class.
        let sourceUrl = ADTClient.mainInclude(structure, false);
        if (args?.include && isClassStructure(structure)) {
            const includes = Object.fromEntries(ADTClient.classIncludes(structure));
            const wanted = includes[String(args.include)];
            if (!wanted) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `'${name}' has no '${args.include}' include. It has: ${Object.keys(includes).join(', ')}.`
                );
            }
            sourceUrl = wanted;
        }

        if (!sourceUrl || sourceUrl === objectUrl) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                `${objectType} '${name}' has no ADT source representation, so there is ` +
                `nothing to write. Tables and structures are changed through the dictionary, not as source.`
            );
        }

        const lock = await this.adtclient.lock(objectUrl);
        const lockHandle = lock.LOCK_HANDLE;
        // The lock reports the request the object already sits in, and whether it is
        // local. Using it saves the caller a transportInfo round trip, and passing a
        // transport for a $TMP object is what SAP rejects.
        const isLocal = String(lock.IS_LOCAL ?? '').toUpperCase() === 'X';
        const transport = args?.transport || (isLocal ? undefined : (lock.CORRNR || undefined));

        const result: Record<string, any> = {
            object: { name, type: objectType, objectUrl, sourceUrl },
            transport: transport ?? null,
            local: isLocal
        };

        try {
            await this.adtclient.setObjectSource(sourceUrl, source, lockHandle, transport);
            result.written = true;
        } finally {
            // Always, including after a failed write. A lock the caller cannot see
            // is held by the stateful session until dropSession or a restart, and on
            // a shared system that blocks other developers rather than only this one.
            //
            // It also has to happen BEFORE the activation, not after: SAP refuses to
            // activate an object its own editor still holds, answering "User X is
            // currently editing Y". Verified on DEV/100 — activating inside the lock
            // fails every time, and the same call succeeds the moment the lock is
            // released. The lock → write → activate → unlock order that docs/MCP-Tools.md
            // used to prescribe never worked.
            try {
                await this.adtclient.unLock(objectUrl, lockHandle);
                result.unlocked = true;
            } catch (unlockError: any) {
                // Reported, never thrown: it must not replace the real failure that
                // sent us here, and it must not turn a successful write into an error.
                result.unlocked = false;
                result.warning =
                    `The object was NOT unlocked: ${unlockError?.message || 'Unknown error'}. ` +
                    `Call dropSession to release it.`;
            }
        }

        if (args?.activate === false) {
            result.activated = false;
            result.message =
                'Source written and left inactive, as asked. Activate it with activateByName, or ' +
                'together with others through activateObjects.';
            return result;
        }

        // Unlocked by now, which is what makes this succeed.
        const activation = await this.adtclient.activate(name, objectUrl);
        result.activated = activation?.success !== false;
        result.activation = activation;
        result.message = result.activated
            ? 'Source written and activated.'
            : 'Source WRITTEN but NOT activated — see activation.messages. The object is now ' +
              'inactive; fix the reported errors and edit again.';

        return result;
    }

    /**
     * Resolves an object name to the one object meant by it.
     *
     * Shared by readAbapObject and editAbapSource, because "which ZPP_LABEL_DRUCK
     * did you mean" has exactly one right answer and it should not be arrived at
     * two different ways depending on whether you are reading or writing.
     */
    private async resolveObject(objectName: any, objectType: any): Promise<{
        chosen: any;
        named: any[];
        candidates: any[];
    }> {
        const name = String(objectName ?? '').trim().toUpperCase();
        if (!name) {
            throw new McpError(ErrorCode.InvalidParams, 'An object name is required.');
        }
        const wantedType = objectType ? String(objectType).trim().toUpperCase() : undefined;

        // No objType filter on the search: the library truncates it to its first
        // segment, which makes 'FUGR/FF' match function GROUPS. Filter here instead.
        const hits = await this.adtclient.searchObject(name, undefined, 50);
        const named = hits.filter(h => (h['adtcore:name'] ?? '').toUpperCase() === name);

        if (!named.length) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                `No ABAP object named '${name}' was found. The repository search is case sensitive on ` +
                `older systems and adds no wildcard — check the spelling, or use searchObject with a ` +
                `pattern like '${name}*'.`
            );
        }

        const candidates = wantedType
            ? named.filter(h => (h['adtcore:type'] ?? '').toUpperCase() === wantedType)
            : named;
        if (!candidates.length) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                `'${name}' exists, but not as ${wantedType}. Found: ` +
                named.map(h => h['adtcore:type']).join(', ')
            );
        }

        return { chosen: this.preferredCandidate(candidates), named, candidates };
    }

    /** Most specific/most likely object when a name is used more than once. */
    private preferredCandidate(candidates: any[]): any {
        const ranked = [...candidates].sort((a, b) => {
            const ra = TYPE_PREFERENCE.indexOf((a['adtcore:type'] ?? '').toUpperCase());
            const rb = TYPE_PREFERENCE.indexOf((b['adtcore:type'] ?? '').toUpperCase());
            // Unlisted types keep their original relative order, after the listed ones.
            return (ra < 0 ? TYPE_PREFERENCE.length : ra) - (rb < 0 ? TYPE_PREFERENCE.length : rb);
        });
        return ranked[0];
    }

    /**
     * Normalises one caller pattern into what the repository search actually needs.
     *
     * `searchObject` adds no wildcard of its own and is case sensitive on older
     * systems, so 'zpp_' silently finds nothing while 'ZPP_*' finds everything.
     * Doing that here is the point of this tool.
     */
    private normalizePackagePattern(pattern: string): string {
        const trimmed = String(pattern ?? '').trim().toUpperCase();
        if (!trimmed) {
            throw new McpError(ErrorCode.InvalidParams, 'A package pattern must not be empty.');
        }
        return trimmed.includes('*') ? trimmed : `${trimmed}*`;
    }

    /**
     * @description Finds packages by name pattern and expands each into its contents.
     *              Runs one repository search per pattern and one node expansion per
     *              package found.
     * @param args.patterns - Name patterns, e.g. ['ZPP_*','Z_PP*'].
     * @param args.includeContents - Expand each package. Defaults to true.
     * @param args.objectTypes - Keep only these ADT types in the contents.
     * @param args.maxPerPattern - Cap per pattern. Defaults to 100.
     * @returns The merged packages, each with its objects grouped by type.
     * @throws {McpError} If no usable pattern was given, or the search itself fails.
     */
    private async searchPackages(args: any): Promise<Record<string, any>> {
        const requested: string[] = Array.isArray(args?.patterns)
            ? args.patterns
            : args?.patterns ? [args.patterns] : [];
        if (!requested.length) {
            throw new McpError(ErrorCode.InvalidParams, 'At least one package pattern is required.');
        }

        const includeContents = args?.includeContents !== false;
        const maxPerPattern = typeof args?.maxPerPattern === 'number' && args.maxPerPattern > 0
            ? args.maxPerPattern
            : 100;
        const typeFilter = Array.isArray(args?.objectTypes) && args.objectTypes.length
            ? new Set(args.objectTypes.map((t: string) => String(t).trim().toUpperCase()))
            : undefined;

        // 1. One search per pattern, merged by package name. A package matched by
        //    two patterns is reported once, listing both.
        const packages = new Map<string, any>();
        const patternReport: any[] = [];

        for (const raw of requested) {
            const pattern = this.normalizePackagePattern(raw);
            const hits = await this.adtclient.searchObject(pattern, 'DEVC/K', maxPerPattern);

            // objType only filters on the first segment, so re-check the real type.
            const found = hits.filter(h => (h['adtcore:type'] ?? '').toUpperCase().startsWith('DEVC'));

            for (const hit of found) {
                const name = (hit['adtcore:name'] ?? '').toUpperCase();
                if (!name) continue;
                const existing = packages.get(name);
                if (existing) {
                    if (!existing.matchedPatterns.includes(pattern)) existing.matchedPatterns.push(pattern);
                    continue;
                }
                packages.set(name, {
                    name,
                    uri: hit['adtcore:uri'],
                    matchedPatterns: [pattern]
                });
            }

            patternReport.push({
                requested: raw,
                pattern,
                matches: found.length,
                // The search stops at the cap, so more packages may exist.
                truncated: found.length >= maxPerPattern
            });
        }

        // 2. Expand each package. A package that cannot be read is reported on
        //    its own entry rather than failing the whole survey.
        if (includeContents) {
            for (const entry of packages.values()) {
                try {
                    const contents = await this.adtclient.nodeContents('DEVC/K', entry.name);
                    const labels = new Map(
                        (contents.objectTypes ?? []).map(t => [t.OBJECT_TYPE, t.OBJECT_TYPE_LABEL])
                    );

                    const subPackages: string[] = [];
                    const objectsByType: Record<string, any> = {};
                    let objectCount = 0;

                    for (const node of contents.nodes ?? []) {
                        const type = node.OBJECT_TYPE ?? '';
                        if (type.toUpperCase().startsWith('DEVC')) {
                            subPackages.push(node.OBJECT_NAME);
                            continue;
                        }
                        if (typeFilter && !typeFilter.has(type.toUpperCase())) continue;

                        const bucket = objectsByType[type] ??= {
                            label: labels.get(type) ?? type,
                            objects: []
                        };
                        bucket.objects.push({
                            name: node.OBJECT_NAME,
                            uri: node.OBJECT_URI,
                            description: node.DESCRIPTION || undefined,
                            expandable: node.EXPANDABLE === 'X'
                        });
                        objectCount++;
                    }

                    entry.subPackages = subPackages;
                    entry.objectCount = objectCount;
                    entry.objectsByType = objectsByType;
                } catch (error: any) {
                    entry.error = `Could not read contents: ${error?.message || 'Unknown error'}`;
                }
            }
        }

        return {
            patterns: patternReport,
            packageCount: packages.size,
            // Plain code-unit order, not localeCompare: the names are already
            // upper case, and locale collation would order '_' differently
            // depending on the ICU data available.
            packages: [...packages.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
            message: 'Package search completed successfully'
        };
    }
}
