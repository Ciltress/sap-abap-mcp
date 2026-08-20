import type { ADTClient } from 'abap-adt-api';
import type { BaseHandler } from '../handlers/BaseHandler';
import type { ToolProperty } from '../types/tools';

import { AuthHandlers } from '../handlers/AuthHandlers';
import { TransportHandlers } from '../handlers/TransportHandlers';
import { ObjectHandlers } from '../handlers/ObjectHandlers';
import { ClassHandlers } from '../handlers/ClassHandlers';
import { CodeAnalysisHandlers } from '../handlers/CodeAnalysisHandlers';
import { ObjectLockHandlers } from '../handlers/ObjectLockHandlers';
import { ObjectSourceHandlers } from '../handlers/ObjectSourceHandlers';
import { ObjectDeletionHandlers } from '../handlers/ObjectDeletionHandlers';
import { ObjectManagementHandlers } from '../handlers/ObjectManagementHandlers';
import { ObjectRegistrationHandlers } from '../handlers/ObjectRegistrationHandlers';
import { NodeHandlers } from '../handlers/NodeHandlers';
import { DiscoveryHandlers } from '../handlers/DiscoveryHandlers';
import { UnitTestHandlers } from '../handlers/UnitTestHandlers';
import { PrettyPrinterHandlers } from '../handlers/PrettyPrinterHandlers';
import { GitHandlers } from '../handlers/GitHandlers';
import { DdicHandlers } from '../handlers/DdicHandlers';
import { ServiceBindingHandlers } from '../handlers/ServiceBindingHandlers';
import { QueryHandlers } from '../handlers/QueryHandlers';
import { FeedHandlers } from '../handlers/FeedHandlers';
import { DebugHandlers } from '../handlers/DebugHandlers';
import { RenameHandlers } from '../handlers/RenameHandlers';
import { AtcHandlers } from '../handlers/AtcHandlers';
import { TraceHandlers } from '../handlers/TraceHandlers';
import { RefactorHandlers } from '../handlers/RefactorHandlers';
import { RevisionHandlers } from '../handlers/RevisionHandlers';
import { JsonRemoteFunctionCallHandlers } from '../handlers/JsonRemoteFunctionCallHandlers';
import { DocsHandlers } from '../handlers/DocsHandlers';
import { SkillsHandlers } from '../handlers/SkillsHandlers';
import { BasisHandlers } from '../handlers/BasisHandlers';

/**
 * getTools() never touches the client, so a stub is enough to inspect the whole
 * catalogue without a SAP system.
 */
const client = {} as ADTClient;
const noop = async () => { };
const rfcCaller = async () => ({ output: {} });

const handlers: BaseHandler[] = [
    new AuthHandlers(client),
    new TransportHandlers(client),
    new ObjectHandlers(client),
    new ClassHandlers(client),
    new CodeAnalysisHandlers(client),
    new ObjectLockHandlers(client),
    new ObjectSourceHandlers(client),
    new ObjectDeletionHandlers(client),
    new ObjectManagementHandlers(client),
    new ObjectRegistrationHandlers(client),
    new NodeHandlers(client),
    new DiscoveryHandlers(client),
    new UnitTestHandlers(client),
    new PrettyPrinterHandlers(client),
    new GitHandlers(client),
    new DdicHandlers(client),
    new ServiceBindingHandlers(client),
    new QueryHandlers(client),
    new FeedHandlers(client),
    new DebugHandlers(client),
    new RenameHandlers(client),
    new AtcHandlers(client),
    new TraceHandlers(client),
    new RefactorHandlers(client),
    new RevisionHandlers(client),
    new JsonRemoteFunctionCallHandlers(client, noop),
    new DocsHandlers(client),
    new SkillsHandlers(client),
    new BasisHandlers(client, rfcCaller)
];

const allTools = handlers.flatMap(h => h.getTools().map(tool => ({ handler: h.constructor.name, tool })));

describe('tool catalogue', () => {
    it('has no duplicate tool names', () => {
        const seen = new Map<string, string>();
        const duplicates: string[] = [];
        for (const { handler, tool } of allTools) {
            const owner = seen.get(tool.name);
            if (owner) duplicates.push(`${tool.name} (${owner} and ${handler})`);
            else seen.set(tool.name, handler);
        }
        expect(duplicates).toEqual([]);
    });

    it('routes every listed tool to its own handler', async () => {
        // handle() must not fall through to "unknown tool" for a name it lists.
        // The stub client makes the call fail afterwards — that is fine, we only
        // care that the name was recognised.
        for (const handler of handlers) {
            for (const tool of handler.getTools()) {
                let message = '';
                try {
                    await handler.handle(tool.name, {});
                } catch (error: any) {
                    message = String(error?.message ?? '');
                }
                expect(`${handler.constructor.name}.${tool.name}: ${message}`).not.toMatch(/Unknown \w+ tool/i);
            }
        }
    });

    it('describes every tool and every argument', () => {
        const thin: string[] = [];
        const undescribed: string[] = [];
        for (const { handler, tool } of allTools) {
            const where = `${handler}.${tool.name}`;
            if ((tool.description ?? '').length < 40) thin.push(`${where}: "${tool.description}"`);
            expect(tool.inputSchema.type).toBe('object');
            for (const [name, property] of Object.entries(tool.inputSchema.properties)) {
                if (!property.description) undescribed.push(`${where}.${name}`);
            }
        }
        expect(thin).toEqual([]);
        expect(undescribed).toEqual([]);
    });

    it('only marks properties as required that actually exist', () => {
        for (const { handler, tool } of allTools) {
            for (const name of tool.inputSchema.required ?? []) {
                expect(`${handler}.${tool.name}.${name}`).toBe(
                    tool.inputSchema.properties[name] ? `${handler}.${tool.name}.${name}` : 'missing property'
                );
            }
        }
    });

    it('never uses the non-JSON-Schema "optional" marker', () => {
        const offenders: string[] = [];
        const walk = (where: string, property: ToolProperty) => {
            if ('optional' in property) offenders.push(where);
            if (property.items) walk(`${where}[]`, property.items);
            for (const [name, child] of Object.entries(property.properties ?? {})) walk(`${where}.${name}`, child);
        };
        for (const { handler, tool } of allTools) {
            for (const [name, property] of Object.entries(tool.inputSchema.properties)) {
                walk(`${handler}.${tool.name}.${name}`, property);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('declares array and object arguments as such, never as strings', () => {
        // The parameters below are handed to abap-adt-api unchanged and must not
        // be declared as plain strings — that mismatch is what made callers pass
        // names where whole objects were expected.
        const structured: Record<string, string[]> = {
            unitTestRun: ['flags'],
            unitTestEvaluation: ['clas', 'flags'],
            fixEdits: ['proposal'],
            usageReferenceSnippets: ['references'],
            validateNewObject: ['options'],
            getObjectSource: ['options'],
            setTransportsConfig: ['config'],
            stageRepo: ['repo'],
            pushRepo: ['repo', 'staging'],
            checkRepo: ['repo'],
            remoteRepoInfo: ['repo'],
            switchRepoBranch: ['repo'],
            debuggerSaveSettings: ['settings'],
            debuggerDeleteBreakpoints: ['breakpoint'],
            tracesStatements: ['options'],
            tracesSetParameters: ['parameters'],
            tracesCreateConfiguration: ['config'],
            extractMethodEvaluate: ['range'],
            extractMethodPreview: ['proposal'],
            extractMethodExecute: ['refactoring'],
            renamePreview: ['renameRefactoring'],
            renameExecute: ['refactoring'],
            atcRequestExemption: ['proposal'],
            activateObjects: ['objects'],
            bindingDetails: ['binding'],
            callFunctionViaJsonRpc: ['inputParameters', 'outputParameters'],
            callFunctionsViaJsonRpc: ['calls'],
            searchPackages: ['patterns', 'objectTypes']
        };

        for (const { tool } of allTools) {
            for (const name of structured[tool.name] ?? []) {
                const property = tool.inputSchema.properties[name];
                expect(`${tool.name}.${name}`).toBe(property ? `${tool.name}.${name}` : 'missing property');
                expect(`${tool.name}.${name} is ${property.type}`).toBe(
                    `${tool.name}.${name} is ${property.type === 'array' ? 'array' : 'object'}`
                );
            }
        }
    });
});
