import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class ServiceBindingHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'publishServiceBinding',
                    description: 'Publish a service binding - this EXPOSES an OData service. Check the returned severity: an HTTP success does not mean it published.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'The name of the service binding.'
                            },
                            version: {
                                type: 'string',
                                description: 'The version of the service binding.'
                            }
                        },
                        required: ['name', 'version']
                    },
                    needsFeature: 'businessservices'
                },
                onFailure: 'Failed to publish service binding',
                run: async args => ({
                    result: await this.adtclient.publishServiceBinding(args.name, args.version)
                })
            },
            {
                definition: {
                    name: 'unPublishServiceBinding',
                    description: 'Take a published OData service offline. Check the returned severity.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'The name of the service binding.'
                            },
                            version: {
                                type: 'string',
                                description: 'The version of the service binding.'
                            }
                        },
                        required: ['name', 'version']
                    },
                    needsFeature: 'businessservices'
                },
                onFailure: 'Failed to unpublish service binding',
                run: async args => ({
                    result: await this.adtclient.unPublishServiceBinding(args.name, args.version)
                })
            },
            {
                definition: {
                    name: 'bindingDetails',
                    description: 'Service URLs and metadata of a binding. Use index to pick one of several services in it.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            binding: {
                                type: 'object',
                                description: 'The ServiceBinding OBJECT (e.g. parsed from the binding source), not its name.'
                            },
                            index: {
                                type: 'number',
                                description: 'The index of the service binding.'
                            }
                        },
                        required: ['binding']
                    },
                    needsFeature: 'businessservices'
                },
                onFailure: 'Failed to get binding details',
                run: async args => ({
                    details: await this.adtclient.bindingDetails(args.binding, args.index)
                })
            }
        ];
    }
}
