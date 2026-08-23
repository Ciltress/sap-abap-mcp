import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class CodeAnalysisHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'syntaxCheckCode',
                    annotations: {
                        title: 'Syntax check source',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Run an ABAP syntax check against source code you supply (typically an unsaved buffer). ' +
                        'Returns an array of findings; an empty array means the code is clean.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            code: { type: 'string', description: 'The complete ABAP source to check.' },
                            url: {
                                type: 'string',
                                description:
                                    "Source URL of the object the code belongs to, e.g. " +
                                    "'/sap/bc/adt/oo/classes/zcl_foo/source/main'."
                            },
                            mainUrl: {
                                type: 'string',
                                description:
                                    'Source URL of the compilation unit. Defaults to url, which is correct for ' +
                                    'anything that is not an include.'
                            },
                            mainProgram: {
                                type: 'string',
                                description:
                                    'Main program an include is compiled in — required for includes. Get it from ' +
                                    'mainPrograms.'
                            },
                            version: {
                                type: 'string',
                                description: 'Object version to check against.',
                                enum: ['active', 'inactive', 'workingArea']
                            }
                        },
                        required: ['code', 'url']
                    }
                },
                onFailure: 'Syntax check failed',
                run: async args => {
                    // The five-argument overload needs a mainUrl. For anything that is not
                    // an include it is the object's own source url, so default it rather
                    // than sending `undefined` into the request URL.
                    if (!args?.url) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            "syntaxCheckCode needs 'url' (the source URL of the object the code belongs to). " +
                            'To check a stored CDS source instead, use syntaxCheckCdsUrl.'
                        );
                    }
                    const mainUrl = args?.mainUrl ?? args.url;
                    return {
                        result: await this.adtclient.syntaxCheck(
                            args.url,
                            mainUrl,
                            args?.code,
                            args?.mainProgram,
                            args?.version
                        )
                    };
                }
            },
            {
                definition: {
                    name: 'syntaxCheckCdsUrl',
                    annotations: {
                        title: 'Syntax check stored CDS',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Run a syntax check on a stored CDS/DDL source by URL (no source payload — the server ' +
                        'checks what is saved).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            cdsUrl: {
                                type: 'string',
                                description: "ADT URL of the CDS source, e.g. '/sap/bc/adt/ddic/ddl/sources/z_my_view'."
                            }
                        },
                        required: ['cdsUrl']
                    }
                },
                onFailure: 'Syntax check failed',
                run: async args => ({ result: await this.adtclient.syntaxCheck(args.cdsUrl) })
            },
            {
                definition: {
                    name: 'codeCompletion',
                    annotations: {
                        title: 'Code completion',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Code completion proposals at a position. Returns entries with PREFIXLENGTH (how many ' +
                        'characters the proposal replaces) and IDENTIFIER.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sourceUrl: { type: 'string', description: 'Source URL of the object.' },
                            source: { type: 'string', description: 'The current source text (may be unsaved).' },
                            line: { type: 'number', description: '1-based line number.' },
                            column: { type: 'number', description: '0-based column (character offset in the line).' }
                        },
                        required: ['sourceUrl', 'source', 'line', 'column']
                    }
                },
                onFailure: 'Code completion failed',
                run: async args => ({
                    result: await this.adtclient.codeCompletion(
                        args.sourceUrl,
                        args.source,
                        args.line,
                        args.column
                    )
                })
            },
            {
                definition: {
                    name: 'findDefinition',
                    annotations: {
                        title: 'Go to definition',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Go to definition of the symbol at a position. startCol/endCol must span the whole ' +
                        'identifier, not a single caret position.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'Source URL of the object.' },
                            source: { type: 'string', description: 'The current source text.' },
                            line: { type: 'number', description: '1-based line number.' },
                            startCol: { type: 'number', description: '0-based column where the identifier starts.' },
                            endCol: { type: 'number', description: '0-based column where the identifier ends.' },
                            implementation: {
                                type: 'boolean',
                                description: 'true jumps to the implementation instead of the declaration.'
                            },
                            mainProgram: { type: 'string', description: 'Main program, for includes.' }
                        },
                        required: ['url', 'source', 'line', 'startCol', 'endCol']
                    }
                },
                onFailure: 'Find definition failed',
                run: async args => ({
                    result: await this.adtclient.findDefinition(
                        args.url,
                        args.source,
                        args.line,
                        args.startCol,
                        args.endCol,
                        args.implementation,
                        args.mainProgram
                    )
                })
            },
            {
                definition: {
                    name: 'usageReferences',
                    annotations: {
                        title: 'Find references',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Find all references. Without line/column it reports usages of the whole object; with ' +
                        'them, of the symbol at that position.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'ADT object URL.' },
                            line: { type: 'number', description: '1-based line number.' },
                            column: { type: 'number', description: '0-based column.' }
                        },
                        required: ['url']
                    }
                },
                onFailure: 'Usage references failed',
                run: async args => ({
                    result: await this.adtclient.usageReferences(args.url, args.line, args.column)
                })
            },
            {
                definition: {
                    name: 'syntaxCheckTypes',
                    annotations: {
                        title: 'Supported check types',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'List the syntax checker types this system supports, as checkType -> supported types.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Syntax check types failed',
                // Returns a Map, which JSON.stringify would flatten to `{}`.
                run: async () => ({
                    result: Object.fromEntries(await this.adtclient.syntaxCheckTypes())
                })
            },
            {
                definition: {
                    name: 'codeCompletionFull',
                    annotations: {
                        title: 'Expand completion pattern',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Expand a pattern proposal (e.g. a full METHOD ... ENDMETHOD skeleton) into source text. ' +
                        'patternKey comes from a previous codeCompletion proposal.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sourceUrl: { type: 'string', description: 'Source URL of the object.' },
                            source: { type: 'string', description: 'The current source text.' },
                            line: { type: 'number', description: '1-based line number.' },
                            column: { type: 'number', description: '0-based column.' },
                            patternKey: { type: 'string', description: 'Key of the pattern proposal to expand.' }
                        },
                        required: ['sourceUrl', 'source', 'line', 'column', 'patternKey']
                    }
                },
                onFailure: 'Code completion full failed',
                run: async args => ({
                    result: await this.adtclient.codeCompletionFull(
                        args.sourceUrl,
                        args.source,
                        args.line,
                        args.column,
                        args.patternKey
                    )
                })
            },
            {
                definition: {
                    name: 'runClass',
                    annotations: {
                        title: 'Run ABAP class',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: false,
                        openWorldHint: true
                    },
                    description:
                        'Execute a class that implements IF_OO_ADT_CLASSRUN and return its console output. ' +
                        'This RUNS CODE on the SAP system.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            className: { type: 'string', description: "Plain class name, e.g. 'ZCL_MY_RUNNER'." }
                        },
                        required: ['className']
                    }
                },
                onFailure: 'Run class failed',
                run: async args => ({ result: await this.adtclient.runClass(args.className) })
            },
            {
                definition: {
                    name: 'codeCompletionElement',
                    annotations: {
                        title: 'Element information',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Detailed information (documentation, signature, components) about the element at a ' +
                        'position. Fails on older systems that answer with HTML instead of XML.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sourceUrl: { type: 'string', description: 'Source URL of the object.' },
                            source: { type: 'string', description: 'The current source text.' },
                            line: { type: 'number', description: '1-based line number.' },
                            column: { type: 'number', description: '0-based column.' }
                        },
                        required: ['sourceUrl', 'source', 'line', 'column']
                    }
                },
                onFailure: 'Code completion element failed',
                run: async args => ({
                    result: await this.adtclient.codeCompletionElement(
                        args.sourceUrl,
                        args.source,
                        args.line,
                        args.column
                    )
                })
            },
            {
                definition: {
                    name: 'usageReferenceSnippets',
                    annotations: {
                        title: 'Reference snippets',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Fetch the code snippets around usage references. Pass the UsageReference objects returned ' +
                        'by usageReferences unchanged.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            references: {
                                type: 'array',
                                description: 'The UsageReference objects from usageReferences.',
                                items: { type: 'object' }
                            }
                        },
                        required: ['references']
                    }
                },
                onFailure: 'Usage reference snippets failed',
                run: async args => ({
                    result: await this.adtclient.usageReferenceSnippets(args.references)
                })
            },
            {
                definition: {
                    name: 'fixProposals',
                    annotations: {
                        title: 'Quick-fix proposals',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Quick-fix candidates at a position. Feed one of them to fixEdits.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'Source URL of the object.' },
                            source: { type: 'string', description: 'The current source text.' },
                            line: { type: 'number', description: '1-based line number.' },
                            column: { type: 'number', description: '0-based column.' }
                        },
                        required: ['url', 'source', 'line', 'column']
                    }
                },
                onFailure: 'Fix proposals failed',
                run: async args => ({
                    result: await this.adtclient.fixProposals(args.url, args.source, args.line, args.column)
                })
            },
            {
                definition: {
                    name: 'fixEdits',
                    annotations: {
                        title: 'Quick-fix edits',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Turn a fix proposal into concrete source deltas. Returns the edits — it does NOT write ' +
                        'them; apply them yourself and use setObjectSource.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            proposal: {
                                type: 'object',
                                description: 'One FixProposal object as returned by fixProposals.'
                            },
                            source: { type: 'string', description: 'The source the proposal was computed on.' }
                        },
                        required: ['proposal', 'source']
                    }
                },
                onFailure: 'Fix edits failed',
                run: async args => ({
                    result: await this.adtclient.fixEdits(args.proposal, args.source)
                })
            },
            {
                definition: {
                    name: 'mapSourceFragments',
                    annotations: {
                        title: 'Locate source fragment',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Find where one method, form or other sub-object starts and ends in its source, ' +
                        'without parsing the code yourself. Use it to read or change a single method of a ' +
                        'large class rather than fetching the whole include.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: { type: 'string', description: 'Source URL of the containing object.' },
                            type: { type: 'string', description: "Fragment type, e.g. 'method', 'form'." },
                            name: { type: 'string', description: 'Fragment name.' }
                        },
                        required: ['url', 'type', 'name']
                    }
                },
                onFailure: 'Fragment mappings failed',
                run: async args => ({
                    result: await this.adtclient.fragmentMappings(args.url, args.type, args.name)
                })
            },
            {
                definition: {
                    name: 'abapDocumentation',
                    annotations: {
                        title: 'ABAP keyword documentation',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'ABAP Keyword Documentation for the token at a position. Returns an HTML string.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objectUri: { type: 'string', description: 'Source URL of the object.' },
                            body: { type: 'string', description: 'The current source text.' },
                            line: { type: 'number', description: '1-based line number.' },
                            column: { type: 'number', description: '0-based column.' },
                            language: { type: 'string', description: "Documentation language, e.g. 'EN'." }
                        },
                        required: ['objectUri', 'body', 'line', 'column']
                    }
                },
                onFailure: 'ABAP documentation failed',
                run: async args => ({
                    result: await this.adtclient.abapDocumentation(
                        args.objectUri,
                        args.body,
                        args.line,
                        args.column,
                        args.language
                    )
                })
            }
        ];
    }
}
