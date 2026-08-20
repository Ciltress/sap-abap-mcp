import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class UnitTestHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'unitTestRun',
                    description:
                        'Run ABAP Unit tests for a class, program or package. Returns UnitTestClass[] whose ' +
                        'testmethods[] carry the alerts (failures). Pass one of those class objects to ' +
                        'unitTestEvaluation for details.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'ADT URL of the object to test (class, program or package).'
                            },
                            flags: {
                                type: 'object',
                                description:
                                    'Risk level and duration filters. Omit for the SAP defaults ' +
                                    '(harmless + short/medium).',
                                properties: {
                                    harmless: { type: 'boolean' },
                                    dangerous: { type: 'boolean' },
                                    critical: { type: 'boolean' },
                                    short: { type: 'boolean' },
                                    medium: { type: 'boolean' },
                                    long: { type: 'boolean' }
                                }
                            }
                        },
                        required: ['url']
                    }
                },
                onFailure: 'Failed to run unit test',
                run: async args => ({
                    result: await this.adtclient.unitTestRun(args.url, args.flags)
                })
            },
            {
                definition: {
                    name: 'unitTestEvaluation',
                    description:
                        'Method-level detail for one test class. Takes the UnitTestClass OBJECT returned by ' +
                        'unitTestRun — not a class name.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            clas: {
                                type: 'object',
                                description: 'One element of the UnitTestClass[] returned by unitTestRun.'
                            },
                            flags: {
                                type: 'object',
                                description: 'Same risk/duration filters as unitTestRun.',
                                properties: {
                                    harmless: { type: 'boolean' },
                                    dangerous: { type: 'boolean' },
                                    critical: { type: 'boolean' },
                                    short: { type: 'boolean' },
                                    medium: { type: 'boolean' },
                                    long: { type: 'boolean' }
                                }
                            }
                        },
                        required: ['clas']
                    }
                },
                onFailure: 'Failed to evaluate unit test',
                run: async args => ({
                    result: await this.adtclient.unitTestEvaluation(args.clas, args.flags)
                })
            },
            {
                definition: {
                    name: 'unitTestOccurrenceMarkers',
                    description:
                        'Map test methods onto source ranges — the data behind the test markers in the ADT gutter.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'Source URL of the object.'
                            },
                            source: {
                                type: 'string',
                                description: 'The current source text.'
                            }
                        },
                        required: ['url', 'source']
                    }
                },
                onFailure: 'Failed to get unit test markers',
                run: async args => ({
                    markers: await this.adtclient.unitTestOccurrenceMarkers(args.url, args.source)
                })
            },
            {
                definition: {
                    name: 'createTestInclude',
                    description:
                        'Create the test include (local test classes) of a class. Requires an active lock on the ' +
                        'class: call lock first and unLock afterwards.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            clas: {
                                type: 'string',
                                description: "Plain class name, e.g. 'ZCL_MY_CLASS'."
                            },
                            lockHandle: {
                                type: 'string',
                                description: 'Lock handle returned by the lock tool.'
                            },
                            transport: {
                                type: 'string',
                                description: 'Transport request number. Omit for local ($TMP) objects.'
                            }
                        },
                        required: ['clas', 'lockHandle']
                    }
                },
                onFailure: 'Failed to create test include',
                run: async args => ({
                    result: await this.adtclient.createTestInclude(args.clas, args.lockHandle, args.transport),
                    message: 'Test include created successfully'
                })
            }
        ];
    }
}
