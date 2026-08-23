import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';
import { ADTClient } from 'abap-adt-api';

import type { RfcCaller } from '../types/rfc.js';

export type { RfcCaller };

/** DDIF_FIELDINFO_GET's DDOBJTYPE, spelled out. */
const DDIC_KINDS: Record<string, string> = {
    TRANSP: 'Transparent table',
    INTTAB: 'Structure',
    VIEW: 'View',
    CLUSTER: 'Cluster table',
    POOL: 'Pooled table',
    APPEND: 'Append structure',
    TTYP: 'Table type'
};

export class DdicHandlers extends BaseHandler {
    /**
     * @param adtclient   The shared ADT client.
     * @param callFunction Executes an RFC function module — supplied by index.ts from
     *                     JsonRemoteFunctionCallHandlers. ADT has no resource for a
     *                     database table on NetWeaver 7.50 (`/sap/bc/adt/ddic/tables/...`
     *                     does not exist and the search returns a SAP GUI wrapper URI),
     *                     so the only route to a field list is the dictionary itself.
     */
    constructor(adtclient: ADTClient, private readonly callFunction?: RfcCaller) {
        super(adtclient);
    }

    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'describeAbapTable',
                    annotations: {
                        title: 'Describe table fields',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Field list of a database table, structure or view: names, DDIC types, lengths, KEY ' +
                        'flags, data elements, domains and check tables, condensed into a readable summary. ' +
                        'Use this for "what does this table look like" — objectStructure returns no fields for a ' +
                        'table, and tableContents returns rows rather than a definition. Runs over the SAP ' +
                        'Gateway JSON-RPC service, so it needs that node active and S_RFC.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            tableName: {
                                type: 'string',
                                description: "Table, structure or view name, e.g. 'T000'. Case insensitive."
                            },
                            language: {
                                type: 'string',
                                description:
                                    "One-character SAP language key for the field texts, e.g. 'E' or 'D' — not " +
                                    'the two-letter ISO code. Omit to use the logon language.'
                            }
                        },
                        required: ['tableName']
                    }
                },
                onFailure: 'Failed to describe table',
                run: args => this.describeAbapTable(args)
            },
            {
                definition: {
                    name: 'annotationDefinitions',
                    annotations: {
                        title: 'CDS annotation vocabulary',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'The full CDS annotation vocabulary of this system, as a string. Large.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get annotation definitions',
                run: async () => ({ result: await this.adtclient.annotationDefinitions() })
            },
            {
                definition: {
                    name: 'ddicElement',
                    annotations: {
                        title: 'DDIC element model',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Semantic model (fields, types, annotations) of a table, view or CDS entity.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'ADT path of the DDIC element. A single path or an array of paths.'
                            },
                            getTargetForAssociation: {
                                type: 'boolean',
                                description: 'Whether to get the target for association.'
                            },
                            getExtensionViews: {
                                type: 'boolean',
                                description: 'Whether to get extension views.'
                            },
                            getSecondaryObjects: {
                                type: 'boolean',
                                description: 'Whether to get secondary objects.'
                            }
                        },
                        required: ['path']
                    }
                },
                onFailure: 'Failed to get DDIC element',
                run: async args => ({
                    result: await this.adtclient.ddicElement(
                        args.path,
                        args.getTargetForAssociation,
                        args.getExtensionViews,
                        args.getSecondaryObjects
                    )
                })
            },
            {
                definition: {
                    name: 'ddicRepositoryAccess',
                    annotations: {
                        title: 'DDIC where-used',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Where-used / lineage information at data dictionary level.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'ADT path of the DDIC element. A single path or an array of paths.'
                            }
                        },
                        required: ['path']
                    }
                },
                onFailure: 'Failed to access DDIC repository',
                run: async args => ({ result: await this.adtclient.ddicRepositoryAccess(args.path) })
            },
            {
                definition: {
                    name: 'packageSearchHelp',
                    annotations: {
                        title: 'Package value help',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Value help for package attributes (application/software components, transport layers, translation relevance).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            type: {
                                type: 'string',
                                description: 'Which value help to read.',
                                enum: ['applicationcomponents', 'softwarecomponents', 'transportlayers', 'translationrelevances']
                            },
                            name: {
                                type: 'string',
                                description: 'The package name.'
                            }
                        },
                        required: ['type']
                    }
                },
                onFailure: 'Failed to get package search help',
                run: async args => ({
                    result: await this.adtclient.packageSearchHelp(args.type, args.name)
                })
            }
        ];
    }

    /**
     * @description Reads the field list of a table, structure or view via
     *              DDIF_FIELDINFO_GET and condenses it. The raw DFIES rows carry
     *              ~40 columns each — mostly screen-painter details — so a 13-field
     *              table comes back as roughly 15 kB. Only the columns that describe
     *              the data are kept.
     * @param args.tableName - Table, structure or view name.
     * @param args.language - Language for the texts. Defaults to the session language.
     * @returns Kind, key fields and one condensed row per field.
     * @throws {McpError} If the name is missing, the object is unknown, or the RFC route is unavailable.
     */
    private async describeAbapTable(args: any): Promise<Record<string, any>> {
        const name = String(args?.tableName ?? '').trim().toUpperCase();
        if (!name) {
            throw new McpError(ErrorCode.InvalidParams, 'A table name is required.');
        }
        if (!this.callFunction) {
            throw new McpError(
                ErrorCode.InternalError,
                'describeAbapTable needs the JSON-RPC route, which is not wired into this handler.'
            );
        }

        // LANGU is SYST-LANGU, a ONE character SAP language key — passing the
        // two-letter session language ('EN') fails deserialization with -32602.
        // Omitted entirely unless asked for, so SAP uses the logon language.
        const langu = String(args?.language ?? '').trim().toUpperCase().slice(0, 1);

        const { output } = await this.callFunction(
            'DDIF_FIELDINFO_GET',
            { TABNAME: name, ...(langu ? { LANGU: langu } : {}) },
            ['DFIES_TAB', 'DDOBJTYPE']
        );

        const rows: any[] = Array.isArray(output?.DFIES_TAB) ? output.DFIES_TAB : [];
        if (!rows.length) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                `'${name}' is not a table, structure or view in the dictionary, or it has no fields.`
            );
        }

        // The numeric DFIES columns are zero-padded strings ('000003').
        const num = (value: any) => Number.parseInt(String(value ?? '0'), 10) || 0;
        const text = (value: any) => String(value ?? '').trim() || undefined;

        const fields = rows.map(row => ({
            name: row.FIELDNAME,
            position: num(row.POSITION),
            key: row.KEYFLAG === 'X',
            type: text(row.DATATYPE),
            length: num(row.LENG),
            decimals: num(row.DECIMALS) || undefined,
            text: text(row.FIELDTEXT),
            dataElement: text(row.ROLLNAME),
            domain: text(row.DOMNAME),
            // Foreign key target — the cheapest way to see how tables join.
            checkTable: text(row.CHECKTABLE),
            conversionExit: text(row.CONVEXIT)
        }));

        const ddObjType = String(output?.DDOBJTYPE ?? '').trim().toUpperCase();

        return {
            table: {
                name,
                ddObjType: ddObjType || undefined,
                kind: DDIC_KINDS[ddObjType] ?? ddObjType ?? undefined,
                fieldCount: fields.length,
                keyFields: fields.filter(f => f.key).map(f => f.name),
                fields
            }
        };
    }
}
