import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';
import { ADTClient, isClassStructure } from 'abap-adt-api';
import type { AbapClassStructure } from 'abap-adt-api';

export class ClassHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'classIncludes',
                    description:
                        'List the source URLs of the includes of an ABAP class (definitions, implementations, ' +
                        'macros, testclasses, main). Accepts a class name, an ADT class URL, or the structure ' +
                        'object returned by objectStructure. Returns a plain object keyed by include type.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            clas: {
                                type: 'string',
                                description:
                                    "Class name (e.g. 'ZCL_MY_CLASS'), an ADT class URL " +
                                    "(e.g. '/sap/bc/adt/oo/classes/zcl_my_class'), or an AbapClassStructure object " +
                                    'from objectStructure.'
                            }
                        },
                        required: ['clas']
                    }
                },
                onFailure: 'Failed to get class includes',
                /**
                 * `ADTClient.classIncludes` is a static, offline helper: it walks the
                 * `includes` of an AbapClassStructure and has no idea what a class *name*
                 * is. Passing a string used to throw ("clas.includes is not iterable"), so
                 * the structure is resolved here first, and the returned Map — which
                 * JSON.stringify would flatten to `{}` — is converted to a plain object.
                 */
                run: async args => {
                    const structure = await this.resolveClassStructure(args?.clas);
                    return {
                        objectUrl: structure.objectUrl,
                        includes: Object.fromEntries(ADTClient.classIncludes(structure))
                    };
                }
            },
            {
                definition: {
                    name: 'classComponents',
                    description:
                        'List the components (methods, attributes, types, events) of an ABAP class, with their ' +
                        'ADT links. Takes the class OBJECT url, not the source url.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: "ADT object URL of the class, e.g. '/sap/bc/adt/oo/classes/zcl_my_class'."
                            }
                        },
                        required: ['url']
                    }
                },
                onFailure: 'Failed to get class components',
                run: async args => ({ result: await this.adtclient.classComponents(args.url) })
            }
        ];
    }

    private async resolveClassStructure(clas: any): Promise<AbapClassStructure> {
        if (clas && typeof clas === 'object') {
            if (!isClassStructure(clas)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    'The object passed as clas is not an AbapClassStructure (it has no includes). ' +
                    'Pass the result of objectStructure on a class, or just the class name.'
                );
            }
            return clas;
        }

        const value = String(clas ?? '').trim();
        if (!value) {
            throw new McpError(ErrorCode.InvalidParams, 'A class name, class URL or class structure is required.');
        }

        const url = value.startsWith('/sap/bc/adt/')
            ? value
            : `/sap/bc/adt/oo/classes/${encodeURIComponent(value.toLowerCase())}`;
        const structure = await this.adtclient.objectStructure(url);
        if (!isClassStructure(structure)) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                `'${value}' resolved to ${url}, which is not an ABAP class.`
            );
        }
        return structure;
    }
}
