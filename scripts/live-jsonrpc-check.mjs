#!/usr/bin/env node
/**
 * Live end-to-end check of the JSON-RPC / RFC tools against a real SAP system,
 * driven through the built server over MCP stdio — i.e. exactly the path a
 * client takes, not the handler API.
 *
 * This is the by-hand verification of docs/JSON-RPC.md §8 made
 * repeatable. It needs a reachable system and a valid Kerberos ticket, which is
 * why it is a script and not a jest suite; the offline equivalent that runs in
 * CI is src/__tests__/jsonRpcHandlers.test.ts.
 *
 *   npm run build && node scripts/live-jsonrpc-check.mjs
 *
 * SAP_URL / SAP_USER / SAP_CLIENT / SAP_LANGUAGE come from .env, the same way
 * the server reads them. Add NODE_TLS_REJECT_UNAUTHORIZED=0 where the system
 * presents a certificate from an internal CA — the MCP client entry sets it too,
 * and without it every call fails with "unable to get local issuer certificate".
 *
 * Everything it calls is read-only (STFC_CONNECTION, RFC_SYSTEM_INFO,
 * RFC_READ_TABLE on T000). It writes nothing to the SAP system.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn(process.execPath, [path.join(root, 'dist', 'index.js')], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe']
});

/** Anything on stdout that is not a protocol frame corrupts the MCP stream. */
const stray = [];
const pending = new Map();
let nextId = 0;
let buffer = '';

server.stdout.on('data', chunk => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let frame;
        try {
            frame = JSON.parse(line);
        } catch {
            stray.push(line);
            continue;
        }
        const resolve = pending.get(frame.id);
        if (resolve) {
            pending.delete(frame.id);
            resolve(frame);
        }
    }
});

const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, resolve);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`timeout: ${method}`))), 120000);
});

/** Unwraps the single MCP text envelope handlers return. */
const callTool = async (name, args = {}) => {
    const frame = await send('tools/call', { name, arguments: args });
    if (frame.error) throw new Error(`${name}: ${JSON.stringify(frame.error)}`);
    const text = frame.result?.content?.[0]?.text;
    return { isError: !!frame.result?.isError, payload: text ? JSON.parse(text) : frame.result };
};

let failures = 0;
const check = (label, ok, detail) => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

/** A precondition, not a result: reported without a stack and without a second tally. */
class Precondition extends Error { }

/**
 * The one sentence that fixes an unreachable endpoint.
 *
 * Every check below the probe needs the same TLS handshake and the same SICF
 * node, so one unreachable endpoint prints eight FAILs of which seven are the
 * first one restated. The information is all in the probe's own `problem`
 * string — which is easy to skip, because it arrives looking like one failure
 * among many rather than the cause of all of them.
 */
const remedyFor = (problem = '') => {
    if (/issuer|self.signed|unable to verify|certificate|CERT_/i.test(problem)) {
        return [
            'The system presents a certificate from a CA this machine does not trust.',
            '',
            '  Development:  NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/live-jsonrpc-check.mjs',
            '  Properly:     set SAP_CA_FILE in .env to the CA bundle, which keeps verification on.',
            '',
            '  Either works from .env too — dotenv sets it before the first TLS connection.'
        ].join('\n');
    }
    if (/401|unauthor|negotiate|kerberos|spnego|ticket/i.test(problem)) {
        return [
            'SAP refused the logon.',
            '',
            '  Kerberos:     check `klist` for a valid ticket, and your VPN/domain connection.',
            '  Certificate:  see docs/Authentication.md §6.'
        ].join('\n');
    }
    if (/404|not found|inactive|sicf/i.test(problem)) {
        return [
            'The JSON-RPC node did not answer.',
            '',
            '  Activate /sap/gw/jsonrpc in SICF, or set SAP_JSONRPC_PATH if it is published',
            '  under an alias. SAP_GWFND must be installed.'
        ].join('\n');
    }
    return 'See docs/JSON-RPC.md §8 and the troubleshooting matrix in docs/MCP-Tools.md §8.';
};

try {
    await send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'live-jsonrpc-check', version: '1.0.0' }
    });

    const tools = (await send('tools/list', {})).result.tools.map(t => t.name);
    check('tools/list exposes the JSON-RPC tools', ['readAbapFunctionModule', 'callFunctionViaJsonRpc',
        'callFunctionsViaJsonRpc', 'checkJsonRpcEndpoint'].every(t => tools.includes(t)),
        `${tools.length} tools`);

    const probe = await callTool('checkJsonRpcEndpoint');
    const endpoint = probe.payload.endpoint ?? {};
    check('checkJsonRpcEndpoint reaches the SICF node', endpoint.reachable === true,
        JSON.stringify(endpoint));

    // Stop here rather than run seven calls that cannot succeed. This is a
    // precondition of the suite, not one of its assertions.
    if (endpoint.reachable !== true) {
        throw new Precondition(
            `the JSON-RPC endpoint is unreachable, so nothing below it can pass.\n\n` +
            `  ${String(endpoint.problem ?? 'no reason reported')}\n\n` +
            `${remedyFor(endpoint.problem)}`
        );
    }

    const meta = await callTool('readAbapFunctionModule', { functionModuleName: 'STFC_CONNECTION' });
    const fm = meta.payload.functionModule;
    check('readAbapFunctionModule uses the RFC route', fm?.metadataSource === 'RFC_INTERFACE',
        `${fm?.parameters?.length} parameters, group ${fm?.functionGroup}`);

    // A lower-case key must survive: the server drops unmatched keys silently.
    const single = await callTool('callFunctionViaJsonRpc', {
        functionModuleName: 'STFC_CONNECTION',
        inputParameters: { requtext: 'hello from the live check' }
    });
    check('callFunctionViaJsonRpc normalises a lower-case key',
        single.payload.output?.ECHOTEXT === 'hello from the live check',
        JSON.stringify(single.payload.output?.RESPTEXT ?? '').slice(0, 60));

    // TABLES in and out.
    const table = await callTool('callFunctionViaJsonRpc', {
        functionModuleName: 'RFC_READ_TABLE',
        inputParameters: {
            QUERY_TABLE: 'T000', DELIMITER: '|', ROWCOUNT: 3,
            FIELDS: [{ FIELDNAME: 'MANDT' }, { FIELDNAME: 'MTEXT' }]
        },
        outputParameters: ['DATA']
    });
    check('RFC_READ_TABLE returns rows', (table.payload.output?.DATA?.length ?? 0) > 0,
        `${table.payload.output?.DATA?.length} rows`);

    // The batch: one HTTP request, one LUW, two function modules.
    const batch = await callTool('callFunctionsViaJsonRpc', {
        calls: [
            { functionModuleName: 'RFC_SYSTEM_INFO' },
            { functionModuleName: 'STFC_CONNECTION', inputParameters: { REQUTEXT: 'batched' }, outputParameters: ['ECHOTEXT'] }
        ]
    });
    check('callFunctionsViaJsonRpc runs a 2-member batch', batch.payload.ok === true &&
        batch.payload.calls?.length === 2 &&
        batch.payload.calls[1].output?.ECHOTEXT === 'batched',
        `sysid ${batch.payload.calls?.[0]?.raw?.RFCSI_EXPORT?.RFCSYSID ?? '?'}`);

    check('batch members come back in the order asked for',
        batch.payload.calls?.map(c => c.functionModule).join(',') === 'RFC_SYSTEM_INFO,STFC_CONNECTION',
        batch.payload.calls?.map(c => c.functionModule).join(','));

    // A failing member must not take the healthy one with it.
    const mixed = await callTool('callFunctionsViaJsonRpc', {
        calls: [
            { functionModuleName: 'RFC_READ_TABLE', inputParameters: { QUERY_TABLE: 'ZZ_DOES_NOT_EXIST' } },
            { functionModuleName: 'STFC_CONNECTION', inputParameters: { REQUTEXT: 'still ran' } }
        ]
    });
    check('a failing batch member stays local',
        mixed.payload.ok === false &&
        mixed.payload.calls?.[0]?.ok === false &&
        mixed.payload.calls?.[1]?.ok === true &&
        mixed.payload.calls?.[1]?.output?.ECHOTEXT === 'still ran',
        mixed.payload.calls?.[0]?.error?.message?.slice(0, 80));

    // Validation happens before anything is sent.
    const invalid = await callTool('callFunctionsViaJsonRpc', {
        calls: [
            { functionModuleName: 'STFC_CONNECTION', inputParameters: { REQUTEXT: 'ok' } },
            { functionModuleName: 'STFC_CONNECTION', inputParameters: { NOPE: 'x' } }
        ]
    });
    check('an invalid member rejects the whole batch up front',
        invalid.isError && /is not an input parameter/.test(invalid.payload.error ?? ''),
        (invalid.payload.error ?? '').slice(0, 80));

    check('no non-protocol output on stdout', stray.length === 0, stray.slice(0, 3).join(' | '));
} catch (error) {
    // A precondition has already been counted by its own `check`, and its message
    // is the point — a stack trace here would bury it.
    if (error instanceof Precondition) {
        console.log(`\nStopping: ${error.message}`);
    } else {
        failures++;
        console.log(`FAIL  unexpected error — ${error?.stack ?? error}`);
    }
} finally {
    server.kill();
}

console.log(failures === 0 ? '\nAll live checks passed.' : `\n${failures} live check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
