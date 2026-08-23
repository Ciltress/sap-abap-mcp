import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class TransportHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'transportInfo',
                    annotations: {
                        title: 'Transport options for an object',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Ask which transport requests can take a change to this object, and whether it is local. Call this BEFORE writing: TRANSPORTS[] lists usable requests, MESSAGES[] carries warnings.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objSourceUrl: {
                                type: 'string',
                                description: 'Source URL of the object, e.g. /sap/bc/adt/oo/classes/zcl_foo/source/main.'
                            },
                            devClass: {
                                type: 'string',
                                description: 'Development class'
                            },
                            operation: {
                                type: 'string',
                                description: 'Transport operation'
                            }
                        },
                        required: ['objSourceUrl']
                    }
                },
                onFailure: 'Failed to get transport info',
                run: async args => ({
                    transportInfo: await this.adtclient.transportInfo(
                        args.objSourceUrl,
                        args.devClass,
                        args.operation
                    )
                })
            },
            {
                definition: {
                    name: 'createTransport',
                    annotations: {
                        title: 'Create transport request',
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: false,
                        openWorldHint: false
                    },
                    description: 'Create a workbench transport request. Returns the new request number as a plain string.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objSourceUrl: {
                                type: 'string',
                                description: 'Source URL of the object, e.g. /sap/bc/adt/oo/classes/zcl_foo/source/main.'
                            },
                            REQUEST_TEXT: {
                                type: 'string',
                                description: 'Description of the transport request'
                            },
                            DEVCLASS: {
                                type: 'string',
                                description: 'Development class'
                            },
                            transportLayer: {
                                type: 'string',
                                description: 'Transport layer'
                            }
                        },
                        required: ['objSourceUrl', 'REQUEST_TEXT', 'DEVCLASS']
                    }
                },
                onFailure: 'Failed to create transport',
                run: async args => ({
                    transportNumber: await this.adtclient.createTransport(
                        args.objSourceUrl,
                        args.REQUEST_TEXT,
                        args.DEVCLASS,
                        args.transportLayer
                    ),
                    message: 'Transport created successfully'
                })
            },
            {
                definition: {
                    name: 'hasTransportConfig',
                    annotations: {
                        title: 'Transport configuration support',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Whether this system uses the newer transport-configuration feature (which the transportConfigurations tools build on).',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to check transport config',
                run: async () => ({ hasConfig: await this.adtclient.hasTransportConfig() })
            },
            {
                definition: {
                    name: 'transportConfigurations',
                    annotations: {
                        title: 'List transport configurations',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'List the transport configurations, each with the uri and etag the get/set tools need.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get transport configurations',
                run: async () => ({ configurations: await this.adtclient.transportConfigurations() })
            },
            {
                definition: {
                    name: 'getTransportConfiguration',
                    annotations: {
                        title: 'Read transport configuration',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Read one transport configuration, including its etag.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'The URL of the transport configuration.'
                            }
                        },
                        required: ['url']
                    }
                },
                onFailure: 'Failed to get transport configuration',
                run: async args => ({
                    configuration: await this.adtclient.getTransportConfiguration(args.url)
                })
            },
            {
                definition: {
                    name: 'setTransportsConfig',
                    annotations: {
                        title: 'Update transport configuration',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Update a transport configuration. Uses optimistic locking: a stale etag is rejected, so re-read with getTransportConfiguration first.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            uri: {
                                type: 'string',
                                description: 'The URI for the transport configuration.'
                            },
                            etag: {
                                type: 'string',
                                description: 'The ETag for the transport configuration.'
                            },
                            config: {
                                type: 'object',
                                description: 'The TransportConfiguration OBJECT, as read by getTransportConfiguration.'
                            }
                        },
                        required: ['uri', 'etag', 'config']
                    }
                },
                onFailure: 'Failed to set transports config',
                run: async args => ({
                    result: await this.adtclient.setTransportsConfig(args.uri, args.etag, args.config)
                })
            },
            {
                definition: {
                    name: 'createTransportsConfig',
                    annotations: {
                        title: 'Create transport configuration',
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: false,
                        openWorldHint: false
                    },
                    description: 'Create a new, empty transport configuration.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to create transports config',
                run: async () => ({ result: await this.adtclient.createTransportsConfig() })
            },
            {
                definition: {
                    name: 'userTransports',
                    annotations: {
                        title: 'Transports of a user',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Transport requests owned by a user, split into workbench and customizing.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            user: {
                                type: 'string',
                                description: 'The user.'
                            },
                            targets: {
                                type: 'boolean',
                                description: 'Whether to include target systems.'
                            }
                        },
                        required: ['user']
                    }
                },
                onFailure: 'Failed to get user transports',
                run: async args => ({
                    transports: await this.adtclient.userTransports(args.user, args.targets)
                })
            },
            {
                definition: {
                    name: 'transportsByConfig',
                    annotations: {
                        title: 'Transports by configuration',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Transport requests visible through a transport configuration, split into workbench and customizing.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            configUri: {
                                type: 'string',
                                description: 'The configuration URI.'
                            },
                            targets: {
                                type: 'boolean',
                                description: 'Whether to include target systems.'
                            }
                        },
                        required: ['configUri']
                    }
                },
                onFailure: 'Failed to get transports by config',
                run: async args => ({
                    transports: await this.adtclient.transportsByConfig(args.configUri, args.targets)
                })
            },
            {
                definition: {
                    name: 'transportDelete',
                    annotations: {
                        title: 'Delete transport request',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Delete a transport request. Only works while it is unreleased.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            transportNumber: {
                                type: 'string',
                                description: 'Transport request number, e.g. DEVK900123.'
                            }
                        },
                        required: ['transportNumber']
                    }
                },
                onFailure: 'Failed to delete transport',
                run: async args => ({
                    result: await this.adtclient.transportDelete(args.transportNumber)
                })
            },
            {
                definition: {
                    name: 'transportRelease',
                    annotations: {
                        title: 'Release transport',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: true
                    },
                    description: 'Release a transport request - starts promotion to the next system and cannot be undone. Read the returned TransportReleaseReport[]: an HTTP success does not mean the release succeeded.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            transportNumber: {
                                type: 'string',
                                description: 'Transport request number, e.g. DEVK900123.'
                            },
                            ignoreLocks: {
                                type: 'boolean',
                                description: 'Whether to ignore locks.'
                            },
                            IgnoreATC: {
                                type: 'boolean',
                                description: 'Release even when ATC findings would block it. Note the capital I in the parameter name.'
                            }
                        },
                        required: ['transportNumber']
                    }
                },
                onFailure: 'Failed to release transport',
                run: async args => ({
                    result: await this.adtclient.transportRelease(
                        args.transportNumber,
                        args.ignoreLocks,
                        args.IgnoreATC
                    )
                })
            },
            {
                definition: {
                    name: 'transportSetOwner',
                    annotations: {
                        title: 'Change transport owner',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Hand a transport request over to another user.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            transportNumber: {
                                type: 'string',
                                description: 'Transport request number, e.g. DEVK900123.'
                            },
                            targetuser: {
                                type: 'string',
                                description: 'The target user.'
                            }
                        },
                        required: ['transportNumber', 'targetuser']
                    }
                },
                onFailure: 'Failed to set transport owner',
                run: async args => ({
                    result: await this.adtclient.transportSetOwner(args.transportNumber, args.targetuser)
                })
            },
            {
                definition: {
                    name: 'transportAddUser',
                    annotations: {
                        title: 'Add task to transport',
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Add a co-developer task for another user to a transport request.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            transportNumber: {
                                type: 'string',
                                description: 'Transport request number, e.g. DEVK900123.'
                            },
                            user: {
                                type: 'string',
                                description: 'The user to add.'
                            }
                        },
                        required: ['transportNumber', 'user']
                    }
                },
                onFailure: 'Failed to add user to transport',
                run: async args => ({
                    result: await this.adtclient.transportAddUser(args.transportNumber, args.user)
                })
            },
            {
                definition: {
                    name: 'systemUsers',
                    annotations: {
                        title: 'System users',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Users known to the system - for validating transportSetOwner and transportAddUser.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get system users',
                run: async () => ({ users: await this.adtclient.systemUsers() })
            },
            {
                definition: {
                    name: 'transportReference',
                    annotations: {
                        title: 'Resolve TADIR triple',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Resolve a TADIR triple (pgmid, object type, object name) to the ADT URI of that object inside a transport.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            pgmid: {
                                type: 'string',
                                description: 'The program ID.'
                            },
                            obj_wbtype: {
                                type: 'string',
                                description: 'The object type.'
                            },
                            obj_name: {
                                type: 'string',
                                description: 'The object name.'
                            },
                            tr_number: {
                                type: 'string',
                                description: 'Transport request number, e.g. DEVK900123.'
                            }
                        },
                        required: ['pgmid', 'obj_wbtype', 'obj_name']
                    }
                },
                onFailure: 'Failed to get transport reference',
                run: async args => ({
                    reference: await this.adtclient.transportReference(
                        args.pgmid,
                        args.obj_wbtype,
                        args.obj_name,
                        args.tr_number
                    )
                })
            }
        ];
    }
}
