import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class PrettyPrinterHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'prettyPrinterSetting',
                    annotations: {
                        title: 'Pretty printer settings',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Current pretty printer settings (indentation and casing style) of the logged-on user.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get pretty printer settings',
                run: async () => ({ settings: await this.adtclient.prettyPrinterSetting() })
            },
            {
                definition: {
                    name: 'setPrettyPrinterSetting',
                    annotations: {
                        title: 'Change pretty printer settings',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Change the pretty printer settings. These are USER-LEVEL settings on the SAP system - read them first with prettyPrinterSetting and restore them if you only needed a one-off format.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            indent: {
                                type: 'boolean',
                                description: 'Whether to indent the code.'
                            },
                            style: {
                                type: 'string',
                                description: 'Keyword and identifier casing style.',
                                enum: ['toLower', 'toUpper', 'keywordUpper', 'keywordLower', 'keywordAuto', 'none']
                            }
                        },
                        required: ['indent', 'style']
                    }
                },
                onFailure: 'Failed to set pretty printer settings',
                run: async args => ({
                    result: await this.adtclient.setPrettyPrinterSetting(args.indent, args.style)
                })
            },
            {
                definition: {
                    name: 'prettyPrinter',
                    annotations: {
                        title: 'Format source',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Format ABAP source server-side with the current settings and return it. Writes nothing - use setObjectSource to persist.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            source: {
                                type: 'string',
                                description: 'The ABAP source code to format.'
                            }
                        },
                        required: ['source']
                    }
                },
                onFailure: 'Failed to format ABAP code',
                run: async args => ({ source: await this.adtclient.prettyPrinter(args.source) })
            }
        ];
    }
}
