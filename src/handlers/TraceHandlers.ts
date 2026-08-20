import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class TraceHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'tracesList',
                    description: 'Trace results available for a user. Their ids feed the hit list, DB access and statement tools.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            user: {
                                type: 'string',
                                description: 'User whose traces to list. Defaults to the logged-on user.'
                            }
                        }
                    }
                },
                onFailure: 'Failed to get traces list',
                run: async args => ({ traces: await this.adtclient.tracesList(args.user) })
            },
            {
                definition: {
                    name: 'tracesListRequests',
                    description: 'Scheduled trace requests (configurations) that have not produced a result yet.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            user: {
                                type: 'string',
                                description: 'User whose traces to list. Defaults to the logged-on user.'
                            }
                        }
                    }
                },
                onFailure: 'Failed to get trace requests',
                run: async args => ({ requests: await this.adtclient.tracesListRequests(args.user) })
            },
            {
                definition: {
                    name: 'tracesHitList',
                    description: 'Hit list of a trace: which statements consumed the runtime.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'Trace id, from tracesList.'
                            },
                            withSystemEvents: {
                                type: 'boolean',
                                description: 'Include kernel/system events in the result.'
                            }
                        },
                        required: ['id']
                    }
                },
                onFailure: 'Failed to get trace hit list',
                run: async args => ({
                    hitList: await this.adtclient.tracesHitList(args.id, args.withSystemEvents)
                })
            },
            {
                definition: {
                    name: 'tracesDbAccess',
                    description: 'Database accesses recorded in a trace, with their times and row counts.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'Trace id, from tracesList.'
                            },
                            withSystemEvents: {
                                type: 'boolean',
                                description: 'Include kernel/system events in the result.'
                            }
                        },
                        required: ['id']
                    }
                },
                onFailure: 'Failed to get trace DB access',
                run: async args => ({
                    dbAccess: await this.adtclient.tracesDbAccess(args.id, args.withSystemEvents)
                })
            },
            {
                definition: {
                    name: 'tracesStatements',
                    description: 'Statement-level detail of a trace, optionally drilled down automatically past a time threshold.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'Trace id, from tracesList.'
                            },
                            options: {
                                type: 'object',
                                description: 'TraceStatementOptions object.',
                                properties: {
                                    id: { type: 'number' },
                                    withDetails: { type: 'boolean' },
                                    autoDrillDownThreshold: { type: 'number' },
                                    withSystemEvents: { type: 'boolean' }
                                }
                            }
                        },
                        required: ['id']
                    }
                },
                onFailure: 'Failed to get trace statements',
                run: async args => ({
                    statements: await this.adtclient.tracesStatements(args.id, args.options)
                })
            },
            {
                definition: {
                    name: 'tracesSetParameters',
                    description: 'Define what a trace records and its size/time limits. Returns the parametersId used by tracesCreateConfiguration.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            parameters: {
                                type: 'object',
                                description: 'TraceParameters object - what the trace records, and its limits.',
                                properties: {
                                    allMiscAbapStatements: { type: 'boolean' },
                                    allProceduralUnits: { type: 'boolean' },
                                    allInternalTableEvents: { type: 'boolean' },
                                    allDynproEvents: { type: 'boolean' },
                                    description: { type: 'string' },
                                    aggregate: { type: 'boolean' },
                                    explicitOnOff: { type: 'boolean' },
                                    withRfcTracing: { type: 'boolean' },
                                    allSystemKernelEvents: { type: 'boolean' },
                                    sqlTrace: { type: 'boolean' },
                                    allDbEvents: { type: 'boolean' },
                                    maxSizeForTraceFile: { type: 'number' },
                                    maxTimeForTracing: { type: 'number' }
                                }
                            }
                        },
                        required: ['parameters']
                    }
                },
                onFailure: 'Failed to set trace parameters',
                run: async args => ({
                    result: await this.adtclient.tracesSetParameters(args.parameters)
                })
            },
            {
                definition: {
                    name: 'tracesCreateConfiguration',
                    description: 'Schedule a trace for a user, process type and object type.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            config: {
                                type: 'object',
                                description: 'TracesCreationConfig object - who and what to trace, and until when.',
                                properties: {
                                    server: { type: 'string' },
                                    description: { type: 'string' },
                                    traceUser: { type: 'string' },
                                    traceClient: { type: 'string' },
                                    processType: {
                                        type: 'string',
                                        enum: ['HTTP', 'DIALOG', 'RFC', 'BATCH', 'SHARED_OBJECTS_AREA', 'ANY']
                                    },
                                    objectType: {
                                        type: 'string',
                                        enum: ['FUNCTION_MODULE', 'URL', 'TRANSACTION', 'REPORT', 'SHARED_OBJECTS_AREA', 'ANY']
                                    },
                                    expires: { type: 'string' },
                                    maximalExecutions: { type: 'number' },
                                    parametersId: { type: 'string' }
                                }
                            }
                        },
                        required: ['config']
                    }
                },
                onFailure: 'Failed to create trace configuration',
                run: async args => ({
                    result: await this.adtclient.tracesCreateConfiguration(args.config)
                })
            },
            {
                definition: {
                    name: 'tracesDeleteConfiguration',
                    description: 'Delete a scheduled trace configuration, so it stops producing new traces.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'Trace configuration id, from tracesListRequests.'
                            }
                        },
                        required: ['id']
                    }
                },
                onFailure: 'Failed to delete trace configuration',
                run: async args => ({
                    result: await this.adtclient.tracesDeleteConfiguration(args.id)
                })
            },
            {
                definition: {
                    name: 'tracesDelete',
                    description: 'Delete a trace result and the runtime data behind it.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'Trace id, from tracesList.'
                            }
                        },
                        required: ['id']
                    }
                },
                onFailure: 'Failed to delete trace',
                run: async args => ({ result: await this.adtclient.tracesDelete(args.id) })
            }
        ];
    }
}
