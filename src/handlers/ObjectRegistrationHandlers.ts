import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class ObjectRegistrationHandlers extends BaseHandler {
  protected toolSpecs(): ToolSpec[] {
    return [
      {
        definition: {
          name: 'objectRegistrationInfo',
          description: 'Namespace / SSCR registration information for an ABAP object.',
          inputSchema: {
            type: 'object',
            properties: {
              objectUrl: { type: 'string', description: 'ADT object URL.' }
            },
            required: ['objectUrl']
          }
        },
        onFailure: 'Failed to get registration info',
        run: async args => ({
          info: await this.adtclient.objectRegistrationInfo(args.objectUrl)
        })
      },
      {
        definition: {
          name: 'validateNewObject',
          description:
            'Check a new object name, package and type before creating it — catches name clashes and ' +
            'missing authorisations.',
          inputSchema: {
            type: 'object',
            properties: {
              options: {
                type: 'object',
                description:
                  'ValidateOptions, e.g. {objtype:"CLAS/OC", objname:"ZCL_NEW", packagename:"ZPKG", ' +
                  'description:"..."}.',
                properties: {
                  objtype: { type: 'string' },
                  objname: { type: 'string' },
                  packagename: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            },
            required: ['options']
          }
        },
        onFailure: 'Failed to validate new object',
        run: async args => ({
          result: await this.adtclient.validateNewObject(args.options)
        })
      },
      {
        definition: {
          name: 'createObject',
          description:
            'Create a new, EMPTY ABAP object. Fill it afterwards with lock -> setObjectSource -> ' +
            'activateByName -> unLock.',
          inputSchema: {
            type: 'object',
            properties: {
              objtype: {
                type: 'string',
                description: "Creatable type id, e.g. 'CLAS/OC', 'INTF/OI', 'PROG/P', 'FUGR/F', 'DEVC/K'."
              },
              name: { type: 'string', description: "Object name, e.g. 'ZCL_NEW'." },
              parentName: { type: 'string', description: 'Package (or function group) that will own it.' },
              description: { type: 'string', description: 'Short description.' },
              parentPath: {
                type: 'string',
                description: "ADT path of the parent, e.g. '/sap/bc/adt/packages/zpkg'."
              },
              responsible: { type: 'string', description: 'Responsible user. Defaults to the logged-on user.' },
              transport: { type: 'string', description: 'Transport request. Omit for local ($TMP) objects.' }
            },
            required: ['objtype', 'name', 'parentName', 'description', 'parentPath']
          }
        },
        onFailure: 'Failed to create object',
        run: async args => ({
          result: await this.adtclient.createObject(
            args.objtype,
            args.name,
            args.parentName,
            args.description,
            args.parentPath,
            args.responsible,
            args.transport
          )
        })
      }
    ];
  }
}
