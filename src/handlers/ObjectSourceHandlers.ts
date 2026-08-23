import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class ObjectSourceHandlers extends BaseHandler {
  protected toolSpecs(): ToolSpec[] {
    return [
      {
        definition: {
          name: 'getObjectSource',
          annotations: {
            title: 'Read source',
            readOnlyHint: true,
            openWorldHint: false
          },
          description:
            'Read the source code of an ABAP object. Takes the SOURCE url (…/source/main), which you get ' +
            'from objectStructure — not the object url.',
          inputSchema: {
            type: 'object',
            properties: {
              objectSourceUrl: {
                type: 'string',
                description: "Source URL, e.g. '/sap/bc/adt/oo/classes/zcl_foo/source/main'."
              },
              options: {
                type: 'object',
                description: 'Read options. Use version:"inactive" to read a not-yet-activated change.',
                properties: {
                  version: { type: 'string', enum: ['active', 'inactive', 'workingArea'] },
                  gitUser: { type: 'string' },
                  gitPassword: { type: 'string' }
                }
              }
            },
            required: ['objectSourceUrl']
          },
          narrowingHint: 'Use mapSourceFragments to find one method, and read only that range.'
        },
        onFailure: 'Failed to get object source',
        run: async args => ({
          source: await this.adtclient.getObjectSource(args.objectSourceUrl, args.options)
        })
      },
      {
        definition: {
          name: 'setObjectSource',
          annotations: {
            title: 'Write source',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false
          },
          description:
            'Write the source code of an ABAP object. This is a FULL REPLACE — read the source first, edit ' +
            'it, and send the complete text. Requires a lock handle, and does NOT activate: call ' +
            'activateByName afterwards.',
          inputSchema: {
            type: 'object',
            properties: {
              objectSourceUrl: {
                type: 'string',
                description: "Source URL, e.g. '/sap/bc/adt/oo/classes/zcl_foo/source/main'."
              },
              source: { type: 'string', description: 'The complete new source text.' },
              lockHandle: { type: 'string', description: 'Lock handle returned by the lock tool.' },
              transport: {
                type: 'string',
                description: 'Transport request number. Omit for local ($TMP) objects.'
              }
            },
            required: ['objectSourceUrl', 'source', 'lockHandle']
          }
        },
        onFailure: 'Failed to set object source',
        run: async args => {
          await this.adtclient.setObjectSource(
            args.objectSourceUrl,
            args.source,
            args.lockHandle,
            args.transport
          );
          return { updated: true };
        }
      }
    ];
  }
}
