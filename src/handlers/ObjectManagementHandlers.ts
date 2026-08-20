import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler';
import type { ToolSpec } from './BaseHandler';

interface InactiveObject {
  "adtcore:uri": string;
  "adtcore:type": string;
  "adtcore:name": string;
  "adtcore:parentUri": string;
}

interface ActivationResultMessage {
  objDescr: string;
  type: string;
  line: number;
  href: string;
  forceSupported: boolean;
  shortText: string;
}

interface ActivationResult {
  success: boolean;
  messages: ActivationResultMessage[];
  inactive: InactiveObjectRecord[];
}

interface InactiveObjectElement extends InactiveObject {
  user: string;
  deleted: boolean;
}

interface InactiveObjectRecord {
  object?: InactiveObjectElement;
  transport?: InactiveObjectElement;
}

export class ObjectManagementHandlers extends BaseHandler {
  protected toolSpecs(): ToolSpec[] {
    return [
      {
        definition: {
          name: 'activateObjects',
          description:
            'Activate several ABAP objects at once. Feed it the records from inactiveObjects. Check BOTH ' +
            'success and messages in the result: syntax errors come back as success:false with messages.',
          inputSchema: {
            type: 'object',
            properties: {
              objects: {
                type: 'array',
                description:
                  'Objects to activate. Each needs adtcore:uri, adtcore:type, adtcore:name and ' +
                  'adtcore:parentUri. A JSON string of the same array is also accepted.',
                items: {
                  type: 'object',
                  properties: {
                    'adtcore:uri': { type: 'string' },
                    'adtcore:type': { type: 'string' },
                    'adtcore:name': { type: 'string' },
                    'adtcore:parentUri': { type: 'string' }
                  },
                  required: ['adtcore:uri', 'adtcore:type', 'adtcore:name', 'adtcore:parentUri']
                }
              },
              preauditRequested: {
                type: 'boolean',
                description: 'Run the pre-audit checks before activating.'
              }
            },
            required: ['objects']
          }
        },
        onFailure: 'Failed to activate objects',
        // Answers with the raw ActivationResult, which is why BaseHandler leaves a
        // payload that is not a plain object alone rather than spreading a status
        // into it.
        run: async args => {
          if (!args?.objects) {
            throw new McpError(ErrorCode.InvalidParams, 'objects is required');
          }

          let objects: InactiveObject[];
          try {
            // An array is the natural shape; a JSON string of it is still accepted,
            // because that is what the tool used to demand.
            objects = typeof args.objects === 'string' ? JSON.parse(args.objects) : args.objects;
            if (!Array.isArray(objects)) {
              throw new Error('objects must be an array of object references');
            }

            objects.forEach((obj, index) => {
              if (!obj["adtcore:uri"] || !obj["adtcore:type"] ||
                !obj["adtcore:name"] || !obj["adtcore:parentUri"]) {
                throw new Error(
                  `Object at index ${index} is missing one of adtcore:uri, adtcore:type, ` +
                  `adtcore:name, adtcore:parentUri`
                );
              }
            });
          } catch (parseError: any) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Invalid objects argument: ${parseError.message}`
            );
          }

          return this.adtclient.activate(objects, args.preauditRequested);
        }
      },
      {
        definition: {
          name: 'activateByName',
          description:
            'Activate a single ABAP object by name and URL — the simple path after setObjectSource. Check ' +
            'BOTH success and messages in the result.',
          inputSchema: {
            type: 'object',
            properties: {
              objectName: {
                type: 'string',
                description: "Object name, e.g. 'ZCL_MY_CLASS'."
              },
              objectUrl: {
                type: 'string',
                description: 'ADT object URL (not the source URL).'
              },
              mainInclude: {
                type: 'string',
                description: 'Main include context, for includes.'
              },
              preauditRequested: {
                type: 'boolean',
                description: 'Run the pre-audit checks before activating.'
              }
            },
            required: ['objectName', 'objectUrl']
          }
        },
        onFailure: 'Failed to activate object',
        run: async args => {
          if (!args.objectName || !args.objectUrl) {
            throw new McpError(ErrorCode.InvalidParams, "objectName and objectUrl parameters are required");
          }
          return this.adtclient.activate(
            args.objectName,
            args.objectUrl,
            args.mainInclude,
            args.preauditRequested
          );
        }
      },
      {
        definition: {
          name: 'inactiveObjects',
          description:
            'List everything left inactive in the system for this user. Pass the object references straight ' +
            'to activateObjects to clean up.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        onFailure: 'Failed to get inactive objects',
        run: async (): Promise<InactiveObjectRecord[]> => this.adtclient.inactiveObjects()
      }
    ];
  }
}
