import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class QueryHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'tableContents',
                    annotations: {
                        title: 'Read table contents',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Read the contents of a DDIC table or view (ADT Data Preview). Read-only. Note that the ' +
                        'service usually returns one row more than requested.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            ddicEntityName: {
                                type: 'string',
                                description: "Table or view name, e.g. 'T000'."
                            },
                            rowNumber: {
                                type: 'number',
                                description: 'Maximum number of rows.'
                            },
                            decode: {
                                type: 'boolean',
                                description: 'Convert raw ABAP values into readable ones.'
                            },
                            sqlQuery: {
                                type: 'string',
                                description: 'Optional WHERE-style filter applied to the entity.'
                            }
                        },
                        required: ['ddicEntityName']
                    },
                    narrowingHint: 'Lower `rowNumber`, or select fewer columns.'
                },
                onFailure: 'Failed to retrieve table contents',
                run: async args => ({
                    result: await this.adtclient.tableContents(
                        args.ddicEntityName,
                        args.rowNumber,
                        args.decode,
                        args.sqlQuery
                    )
                })
            },
            {
                definition: {
                    name: 'runQuery',
                    annotations: {
                        title: 'Run SELECT query',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description:
                        'Run a SELECT statement through the ADT Data Preview SQL console. Read-only — the ' +
                        'service rejects DML. Returns {columns, values}.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sqlQuery: {
                                type: 'string',
                                description: "SQL SELECT, e.g. 'SELECT mandt, mtext FROM t000'."
                            },
                            rowNumber: {
                                type: 'number',
                                description: 'Maximum number of rows.'
                            },
                            decode: {
                                type: 'boolean',
                                description: 'Convert raw ABAP values into readable ones.'
                            }
                        },
                        required: ['sqlQuery']
                    },
                    narrowingHint: 'Lower `rowNumber`, or narrow the SELECT.'
                },
                onFailure: 'Failed to run query',
                run: async args => ({
                    result: await this.adtclient.runQuery(args.sqlQuery, args.rowNumber, args.decode)
                })
            }
        ];
    }
}
