import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';
import type { ToolDefinition } from '../types/tools.js';
import type { ADTClient } from 'abap-adt-api';
import type { RfcBatchCaller, RfcBatchEntry, RfcCaller } from '../types/rfc.js';

/**
 * What a profile parameter read came back as.
 *
 * TH_GET_PARAMETER distinguishes two things that look alike: `rc = 4` means the
 * kernel knows no such parameter, while `rc = 0` with an empty value means it
 * exists and is empty. Observed on DEV: `icm/server_port_4` answers rc 0 with no
 * value, `icm/server_port_5` answers rc 4.
 */
interface ProfileParameter {
    name: string;
    value: string;
    /** rc 0 — the kernel knows this parameter. */
    exists: boolean;
    /** exists and is not empty. */
    isSet: boolean;
    rc?: number;
    error?: string;
}

/** One `icm/server_port_<n>` entry, parsed. */
interface IcmPort {
    parameter: string;
    protocol?: string;
    port?: string;
    /** Whether the ICM asks for a client certificate on this port. */
    clientCertificates: 'required' | 'requested' | 'off' | 'not-applicable';
    /** Which setting decided that. */
    decidedBy: string;
    /** True for the port this server's SAP_URL points at. */
    matchesSapUrl: boolean;
    raw: string;
}

/**
 * The parameters checkLogonConfiguration reads besides the ICM ports. Kept to
 * what actually answers "how may someone log on", rather than the whole profile.
 */
const LOGON_PARAMETERS = [
    'icm/HTTPS/verify_client',
    'login/certificate_mapping_rulebased',
    'snc/enable',
    'snc/identity/as',
    'snc/accept_insecure_rfc',
    'snc/accept_insecure_gui',
    'snc/accept_insecure_cpic',
    'login/accept_sso2_ticket',
    'login/create_sso2_ticket',
    'login/disable_password_logon',
    'login/fails_to_user_lock'
];

/**
 * Basis / operations tools — what is happening on the system right now, as
 * opposed to what is in the repository.
 *
 * These go over the SAP Gateway JSON-RPC service, because ADT exposes the
 * repository and not the task handler.
 */
export class BasisHandlers extends BaseHandler {
    /**
     * @param adtclient     The shared ADT client.
     * @param callFunction  Executes an RFC function module, supplied by index.ts.
     *                      Without it the tools here report that clearly rather
     *                      than failing obscurely.
     * @param callFunctions The same, for several modules in one round trip.
     *                      Reading twenty profile parameters is one request, not
     *                      twenty.
     */
    constructor(
        adtclient: ADTClient,
        private readonly callFunction?: RfcCaller,
        private readonly callFunctions?: RfcBatchCaller
    ) {
        super(adtclient);
    }

    /** Kept apart from toolSpecs() so the three runs read together, not interleaved with schema. */
    private definitions(): ToolDefinition[] {
        return [
            {
                name: 'listLoggedOnUsers',
                annotations: {
                    title: 'Logged-on users (SM04)',
                    readOnlyHint: true,
                    openWorldHint: false
                },
                description:
                    'Who is logged on to this application server right now, from TH_USER_LIST — the data ' +
                    'behind SM04. Answers "is anyone using the system", "does USER have a session", "what ' +
                    'is running from that host". Summarises by user and client by default; set ' +
                    'includeSessions for the individual sessions. Note it covers the application server ' +
                    'this session is connected to, not the whole system, and needs the JSON-RPC node plus ' +
                    'S_RFC for function group THFB.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'string',
                            description:
                                'Only sessions of this user. Case insensitive, matched exactly. To ask about ' +
                                'the user this server connects as, use currentUserOnly instead of naming them.'
                        },
                        currentUserOnly: {
                            type: 'boolean',
                            description:
                                'Only sessions of the user this server is connected as (SAP_USER). Use this ' +
                                'for "do I have a session" rather than hard-coding a name. Ignored when ' +
                                '`user` is given.'
                        },
                        client: {
                            type: 'string',
                            description: "Only sessions in this client, e.g. '100'."
                        },
                        includeSessions: {
                            type: 'boolean',
                            description:
                                'Return the individual sessions as well as the summary. Defaults to false — ' +
                                'a busy server has hundreds, and the summary usually answers the question.'
                        },
                        maxSessions: {
                            type: 'number',
                            description: 'Cap on returned sessions when includeSessions is set. Defaults to 200.'
                        }
                    }
                }
            },
            {
                name: 'readProfileParameters',
                annotations: {
                    title: 'Profile parameters (RZ11)',
                    readOnlyHint: true,
                    openWorldHint: false
                },
                description:
                    'Read SAP profile parameters (the RZ11 values) from the running instance, via ' +
                    'TH_GET_PARAMETER. Answers "how is this system configured" for anything held in a ' +
                    'profile parameter — ICM ports and timeouts, logon and password policy, SNC, memory, ' +
                    'work processes. Reads several in one round trip. Note a parameter that does not ' +
                    'exist is reported as exists:false rather than as an error, which is different from ' +
                    'one that exists and is empty.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        parameters: {
                            type: 'array',
                            items: { type: 'string' },
                            description:
                                "Parameter names exactly as RZ11 spells them, e.g. " +
                                "['icm/server_port_0','login/fails_to_user_lock','snc/enable']. " +
                                'Case sensitive. One name is fine.'
                        }
                    },
                    required: ['parameters']
                }
            },
            {
                name: 'checkLogonConfiguration',
                annotations: {
                    title: 'Logon configuration',
                    readOnlyHint: true,
                    openWorldHint: false
                },
                description:
                    'How this system lets anyone log on: whether the ICM asks for X.509 client ' +
                    'certificates and on which port, whether SNC is on, whether SAP logon tickets and ' +
                    'password logon are accepted. Reads the relevant profile parameters and interprets ' +
                    'them, including the trap that a per-port VCLIENT overrides the global ' +
                    'icm/HTTPS/verify_client. Use it before configuring certificate authentication for ' +
                    'this server, or to answer "what authentication does this system support".',
                inputSchema: {
                    type: 'object',
                    properties: {
                        maxPorts: {
                            type: 'number',
                            description:
                                'How many icm/server_port_<n> slots to read, starting at 0. Defaults to 10, ' +
                                'which covers a normal instance.'
                        },
                        includeParameters: {
                            type: 'boolean',
                            description:
                                'Also return every parameter that was read, raw. Defaults to false — the ' +
                                'interpretation above it is usually the answer.'
                        }
                    }
                }
            }
        ];
    }

    protected toolSpecs(): ToolSpec[] {
        const definition = new Map(this.definitions().map(d => [d.name, d]));

        return [
            {
                definition: definition.get('listLoggedOnUsers')!,
                onFailure: 'Failed to list logged-on users',
                run: args => this.listLoggedOnUsers(args)
            },
            {
                definition: definition.get('readProfileParameters')!,
                onFailure: 'Failed to read profile parameters',
                run: args => this.readProfileParameters(args)
            },
            {
                definition: definition.get('checkLogonConfiguration')!,
                onFailure: 'Failed to check the logon configuration',
                run: args => this.checkLogonConfiguration(args)
            }
        ];
    }

    /**
     * @description Lists the sessions on the current application server via
     *              TH_USER_LIST, summarised by user and by client.
     * @param args.user - Restrict to one user.
     * @param args.currentUserOnly - Restrict to the configured user (SAP_USER).
     * @param args.client - Restrict to one client.
     * @param args.includeSessions - Also return the individual sessions.
     * @param args.maxSessions - Cap on returned sessions.
     * @returns Counts, a per-user and per-client breakdown, and optionally the sessions.
     * @throws {McpError} If the RFC route is unavailable or the call fails.
     */
    private async listLoggedOnUsers(args: any): Promise<Record<string, any>> {
        {
            if (!this.callFunction) {
                throw new McpError(
                    ErrorCode.InternalError,
                    'listLoggedOnUsers needs the JSON-RPC route, which is not wired into this handler.'
                );
            }

            const { output } = await this.callFunction('TH_USER_LIST', {}, ['USRLIST', 'LIST']);

            // TH_USER_LIST declares LIST (UINFO) as the non-optional TABLES parameter
            // and USRLIST (USRINFO) as optional, but on 7.50 it is USRLIST that comes
            // back filled and LIST that comes back empty. Prefer whichever has rows so
            // this keeps working if a release swaps them back.
            const usrList: any[] = Array.isArray(output?.USRLIST) ? output.USRLIST : [];
            const list: any[] = Array.isArray(output?.LIST) ? output.LIST : [];
            const rows = usrList.length ? usrList : list;
            const sourceParameter = usrList.length ? 'USRLIST' : (list.length ? 'LIST' : 'none');

            // SAP_USER, via the ADTClient it was used to construct.
            const currentUser = String(this.adtclient.username ?? '').trim().toUpperCase() || undefined;

            let wantedUser = args?.user ? String(args.user).trim().toUpperCase() : undefined;
            if (!wantedUser && args?.currentUserOnly) {
                if (!currentUser) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        'currentUserOnly was requested but this server has no configured user (SAP_USER).'
                    );
                }
                wantedUser = currentUser;
            }
            const wantedClient = args?.client ? String(args.client).trim() : undefined;

            const sessions = rows
                .filter(row => !wantedUser || String(row?.BNAME ?? '').trim().toUpperCase() === wantedUser)
                .filter(row => !wantedClient || String(row?.MANDT ?? '').trim() === wantedClient)
                .map(row => ({
                    tid: row.TID,
                    client: String(row.MANDT ?? '').trim(),
                    user: String(row.BNAME ?? '').trim(),
                    transaction: String(row.TCODE ?? '').trim() || undefined,
                    terminal: String(row.TERM ?? '').trim() || undefined,
                    host: String(row.HOSTADDR ?? '').trim() || undefined,
                    // 'Dialog time in SM04', HHMMSS.
                    time: String(row.ZEIT ?? '').trim() || undefined,
                    guiVersion: String(row.GUIVERSION ?? '').trim() || undefined,
                    rfcType: String(row.RFC_TYPE ?? '').trim() || undefined,
                    externalModes: row.EXTMODI,
                    internalModes: row.INTMODI,
                    // Raw codes on purpose: UEXT_TYPE, USTATE and UPROTOCOL are INT4
                    // data elements with no domain, so the dictionary carries no fixed
                    // values to translate them with. Inventing labels would be a guess.
                    logonType: row.TYPE,
                    logonState: row.STAT,
                    logonProtocol: row.PROTOCOL
                }));

            const byUser = this.groupBy(sessions, s => s.user).map(([user, group]) => ({
                user,
                sessions: group.length,
                clients: this.distinct(group.map(s => s.client)),
                transactions: this.distinct(group.map(s => s.transaction).filter(Boolean) as string[]),
                hosts: this.distinct(group.map(s => s.host).filter(Boolean) as string[])
            })).sort((a, b) => b.sessions - a.sessions || (a.user < b.user ? -1 : 1));

            const byClient = this.groupBy(sessions, s => s.client).map(([client, group]) => ({
                client,
                sessions: group.length,
                users: this.distinct(group.map(s => s.user))
            })).sort((a, b) => (a.client < b.client ? -1 : 1));

            const maxSessions = typeof args?.maxSessions === 'number' && args.maxSessions > 0
                ? args.maxSessions
                : 200;

            const result: Record<string, any> = {
                sessionCount: sessions.length,
                userCount: byUser.length,
                // So an agent can tell which of these sessions are its own — this
                // server holds one, and it is in the list like any other.
                currentUser,
                filter: {
                    user: wantedUser,
                    client: wantedClient,
                    // So a zero count is not mistaken for "nobody is logged on".
                    totalBeforeFilter: rows.length
                },
                sourceParameter,
                byUser,
                byClient
            };

            if (args?.includeSessions) {
                result.sessions = sessions.slice(0, maxSessions);
                result.sessionsTruncated = sessions.length > maxSessions;
            }

            return result;
        }
    }

    /**
     * @description Reads profile parameters through TH_GET_PARAMETER, all in one
     *              JSON-RPC batch.
     * @param args.parameters - Parameter names, as RZ11 spells them.
     * @returns One entry per requested name, in the order given.
     * @throws {McpError} If the RFC route is unavailable, or no name was given.
     */
    private async readProfileParameters(args: any): Promise<Record<string, any>> {
        const names = this.wantedParameters(args?.parameters);
        const parameters = await this.readParameters(names);

        return {
            requested: names.length,
            // Read at all, whether or not the kernel knows the parameter.
            read: parameters.filter(p => !p.error).length,
            failed: parameters.filter(p => p.error).length,
            unknown: parameters.filter(p => !p.error && !p.exists).map(p => p.name),
            parameters
        };
    }

    /**
     * @description Reads the profile parameters that govern logon and reports
     *              which authentication methods the system accepts.
     * @param args.maxPorts - How many icm/server_port_<n> slots to read.
     * @param args.includeParameters - Also return the raw parameters.
     * @returns The ICM ports, a verdict on certificate logon for this server's
     *          own port, and the state of SNC, logon tickets and passwords.
     * @throws {McpError} If the RFC route is unavailable.
     */
    private async checkLogonConfiguration(args: any): Promise<Record<string, any>> {
        {
            const maxPorts = typeof args?.maxPorts === 'number' && args.maxPorts > 0
                ? Math.min(Math.floor(args.maxPorts), 100)
                : 10;

            const portNames = Array.from({ length: maxPorts }, (_, i) => `icm/server_port_${i}`);
            const parameters = await this.readParameters([...portNames, ...LOGON_PARAMETERS]);

            const byName = new Map(parameters.map(p => [p.name, p]));
            const value = (name: string) => byName.get(name)?.value ?? '';

            const sapUrlPort = this.sapUrlPort();
            const verifyClient = value('icm/HTTPS/verify_client');
            const ports = portNames
                .map(name => byName.get(name)!)
                .filter(p => p && !p.error && p.isSet)
                .map(p => this.parseIcmPort(p, verifyClient, sapUrlPort));

            const ownPort = ports.find(p => p.matchesSapUrl);
            const ruleBasedMapping = value('login/certificate_mapping_rulebased') === '1';

            const unreadable = parameters.filter(p => p.error);
            const warnings: string[] = [];

            // Nothing read means every conclusion below would be an artefact of the
            // failure — "no VCLIENT" and "mapping off" both look true when the reads
            // came back empty. So say why, and draw none of them.
            if (unreadable.length === parameters.length) {
                warnings.push(
                    'No parameter could be read. TH_GET_PARAMETER raises NOT_AUTHORIZED without the ' +
                    'right S_ADMI_FCD authorisation, so this is most likely an authorisation problem ' +
                    'rather than a configuration one — nothing below is a finding about the system.'
                );
            } else {
                if (unreadable.length) {
                    warnings.push(`${unreadable.length} parameter(s) could not be read: ${unreadable.map(p => p.name).join(', ')}.`);
                }

                if (!ownPort) {
                    warnings.push(
                        `No icm/server_port_<n> matches port ${sapUrlPort ?? '(unknown)'} from SAP_URL. Either ` +
                        `raise maxPorts, or the connection goes through a Web Dispatcher or reverse proxy — ` +
                        `in which case it is that host, not this instance, which decides whether a client ` +
                        `certificate is requested.`
                    );
                } else if (ownPort.clientCertificates === 'off') {
                    warnings.push(
                        `Certificate logon cannot work on port ${ownPort.port}: ${ownPort.decidedBy}. The ICM ` +
                        `never asks for a certificate, so none is ever sent.`
                    );
                }

                if (!ruleBasedMapping) {
                    warnings.push(
                        'login/certificate_mapping_rulebased is not 1, so CERTRULE rules do not apply — only ' +
                        'explicit USREXTID entries map a certificate to a user.'
                    );
                }
            }

            const result: Record<string, any> = {
                instance: { baseUrl: this.adtclient.baseUrl, port: sapUrlPort },
                certificateLogon: {
                    possibleOnThisPort: !!ownPort && ownPort.clientCertificates !== 'off'
                        && ownPort.clientCertificates !== 'not-applicable',
                    port: ownPort?.port,
                    mode: ownPort?.clientCertificates,
                    decidedBy: ownPort?.decidedBy,
                    globalVerifyClient: verifyClient || '(not set)',
                    ruleBasedMapping,
                    // These two are not profile parameters, so no tool can confirm them.
                    stillToVerifyManually: [
                        'The issuing CA is in the SSL server PSE certificate list (STRUST).',
                        'CERTRULE maps the certificate subject to a SAP user.'
                    ]
                },
                ports,
                methods: this.describeLogonMethods(value, ownPort),
                warnings
            };

            if (args?.includeParameters) result.parameters = parameters;

            return result;
        }
    }

    /** Validates and normalises the requested parameter names. */
    private wantedParameters(raw: any): string[] {
        const names = (Array.isArray(raw) ? raw : [raw])
            .map(name => String(name ?? '').trim())
            .filter(Boolean);

        if (!names.length) {
            throw new McpError(
                ErrorCode.InvalidParams,
                "readProfileParameters needs at least one parameter name, e.g. ['icm/server_port_0']."
            );
        }
        return names;
    }

    /** One batch, one entry per name, in the order asked for. */
    private async readParameters(names: string[]): Promise<ProfileParameter[]> {
        if (!this.callFunctions) {
            throw new McpError(
                ErrorCode.InternalError,
                'Reading profile parameters needs the JSON-RPC route, which is not wired into this handler.'
            );
        }

        const { calls } = await this.callFunctions(
            names.map(name => ({
                functionModuleName: 'TH_GET_PARAMETER',
                inputParameters: { PARAMETER_NAME: name },
                outputParameters: ['PARAMETER_VALUE', 'RC']
            }))
        );

        return names.map((name, index) => this.toProfileParameter(name, calls[index]));
    }

    private toProfileParameter(name: string, entry: RfcBatchEntry | undefined): ProfileParameter {
        if (!entry || !entry.ok) {
            return {
                name,
                value: '',
                exists: false,
                isSet: false,
                error: entry?.error?.message ?? 'No reply for this parameter.'
            };
        }

        const value = String(entry.output?.PARAMETER_VALUE ?? '');
        const rc = Number(entry.output?.RC ?? 0);

        return { name, value, exists: rc === 0, isSet: rc === 0 && value !== '', rc };
    }

    /** The port SAP_URL points at, so the right ICM entry can be singled out. */
    private sapUrlPort(): string | undefined {
        try {
            const url = new URL(String(this.adtclient.baseUrl ?? ''));
            if (url.port) return url.port;
            return url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * `PROT=HTTPS, PORT=44301, TIMEOUT=300, VCLIENT=1` — note the spacing varies
     * between entries on the same system, so everything is trimmed.
     */
    private parseIcmPort(parameter: ProfileParameter, verifyClient: string, sapUrlPort?: string): IcmPort {
        const fields = new Map<string, string>();
        for (const part of parameter.value.split(',')) {
            const [key, ...rest] = part.split('=');
            if (rest.length) fields.set(key.trim().toUpperCase(), rest.join('=').trim());
        }

        const protocol = fields.get('PROT');
        const port = fields.get('PORT');
        const vclient = fields.get('VCLIENT');

        // A per-port VCLIENT wins over the global parameter — which is why
        // reading icm/HTTPS/verify_client alone is misleading in both directions.
        const { mode, decidedBy } = protocol !== 'HTTPS'
            ? { mode: 'not-applicable' as const, decidedBy: `${protocol ?? 'this protocol'} carries no client certificate` }
            : vclient !== undefined
                ? { mode: this.certificateMode(vclient), decidedBy: `VCLIENT=${vclient} on ${parameter.name}` }
                : {
                    mode: this.certificateMode(verifyClient),
                    decidedBy: `icm/HTTPS/verify_client=${verifyClient || '(not set)'} — no VCLIENT on ${parameter.name}`
                };

        return {
            parameter: parameter.name,
            protocol,
            port,
            clientCertificates: mode,
            decidedBy,
            matchesSapUrl: !!port && !!sapUrlPort && port === sapUrlPort,
            raw: parameter.value
        };
    }

    private certificateMode(value: string): 'required' | 'requested' | 'off' {
        return value === '2' ? 'required' : value === '1' ? 'requested' : 'off';
    }

    /**
     * What the system accepts, in the terms someone asks the question in.
     *
     * SPNEGO/Kerberos and SAML are listed as not-determinable on purpose: they
     * are configured in transactions (SPNEGO, SAML2), not in profile parameters,
     * so silence about them would read as "not supported".
     */
    private describeLogonMethods(value: (name: string) => string, ownPort?: IcmPort) {
        const failsToLock = value('login/fails_to_user_lock');

        return [
            {
                method: 'X.509 client certificate (HTTPS)',
                status: ownPort
                    ? (ownPort.clientCertificates === 'off' ? 'off on this port' : `${ownPort.clientCertificates} on port ${ownPort.port}`)
                    : 'unknown — no ICM port matched SAP_URL',
                detail: ownPort?.decidedBy
            },
            {
                method: 'SNC (RFC and SAP GUI)',
                status: value('snc/enable') === '1' ? 'enabled' : 'disabled',
                detail: value('snc/enable') === '1'
                    ? `identity ${value('snc/identity/as') || '(none)'}; insecure RFC ` +
                      `${value('snc/accept_insecure_rfc') === '1' ? 'still accepted' : 'refused'}`
                    : undefined
            },
            {
                method: 'SAP logon ticket (SSO2)',
                status: value('login/accept_sso2_ticket') === '1' ? 'accepted' : 'not accepted',
                detail: `issues tickets: ${value('login/create_sso2_ticket') === '1' ? 'yes' : 'no'}`
            },
            {
                method: 'User and password',
                status: value('login/disable_password_logon') === '0' || value('login/disable_password_logon') === ''
                    ? 'allowed'
                    : `restricted (login/disable_password_logon=${value('login/disable_password_logon')})`,
                detail: failsToLock
                    ? `locks the user after ${failsToLock} failed attempts — which is why this server never ` +
                      `sends its placeholder password`
                    : undefined
            },
            {
                method: 'SPNEGO / Kerberos',
                status: 'not determinable from profile parameters',
                detail: 'Configured in transaction SPNEGO. That this server logs on with it is the proof it works.'
            }
        ];
    }

    private groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
        const groups = new Map<string, T[]>();
        for (const item of items) {
            const k = key(item);
            const group = groups.get(k) ?? [];
            group.push(item);
            groups.set(k, group);
        }
        return [...groups.entries()];
    }

    private distinct(values: string[]): string[] {
        return [...new Set(values)].sort();
    }
}
