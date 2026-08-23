import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class DebugHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'debuggerListeners',
                    annotations: {
                        title: 'Check debug listener',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Check whether a debug listener is already active. Returns undefined when nobody is listening.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            debuggingMode: {
                                type: 'string',
                                description: "'user' breaks on the given user's activity anywhere in the system; 'terminal' breaks only on activity from this terminal.",
                                enum: ['user', 'terminal']
                            },
                            terminalId: {
                                type: 'string',
                                description: 'Stable GUID identifying this debugger client machine. Generate one and reuse it.'
                            },
                            ideId: {
                                type: 'string',
                                description: 'Stable GUID identifying this IDE workspace. Generate one and reuse it.'
                            },
                            user: {
                                type: 'string',
                                description: 'The user whose activity to break on. Mandatory in user mode.'
                            },
                            checkConflict: {
                                type: 'boolean',
                                description: 'Whether to check for conflicts.'
                            }
                        },
                        required: ['debuggingMode', 'terminalId', 'ideId', 'user']
                    }
                },
                onFailure: 'Failed to get debugger listeners',
                run: async args => ({
                    result: await this.adtclient.debuggerListeners(
                        args.debuggingMode,
                        args.terminalId,
                        args.ideId,
                        args.user,
                        args.checkConflict
                    )
                })
            },
            {
                definition: {
                    name: 'debuggerListen',
                    annotations: {
                        title: 'Wait for breakpoint (blocks)',
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: false,
                        openWorldHint: false
                    },
                    description: 'Wait for a breakpoint to be hit. WARNING: this call BLOCKS — it only returns when a breakpoint is reached, a timeout expires, or another client stops the listener, which can take hours. Set breakpoints first, and use debuggerDeleteListener to break out.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            debuggingMode: {
                                type: 'string',
                                description: "'user' breaks on the given user's activity anywhere in the system; 'terminal' breaks only on activity from this terminal.",
                                enum: ['user', 'terminal']
                            },
                            terminalId: {
                                type: 'string',
                                description: 'Stable GUID identifying this debugger client machine. Generate one and reuse it.'
                            },
                            ideId: {
                                type: 'string',
                                description: 'Stable GUID identifying this IDE workspace. Generate one and reuse it.'
                            },
                            user: {
                                type: 'string',
                                description: 'The user whose activity to break on. Mandatory in user mode.'
                            },
                            checkConflict: {
                                type: 'boolean',
                                description: 'Whether to check for conflicts.'
                            },
                            isNotifiedOnConflict: {
                                type: 'boolean',
                                description: 'Whether to be notified on conflict.'
                            }
                        },
                        required: ['debuggingMode', 'terminalId', 'ideId', 'user']
                    }
                },
                onFailure: 'Failed to start debugger listener',
                run: async args => ({
                    result: await this.adtclient.debuggerListen(
                        args.debuggingMode,
                        args.terminalId,
                        args.ideId,
                        args.user,
                        args.checkConflict,
                        args.isNotifiedOnConflict
                    )
                })
            },
            {
                definition: {
                    name: 'debuggerDeleteListener',
                    annotations: {
                        title: 'Stop debug listener',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Stop a debug listener - yours or another client\'s. This is how you break out of a blocked debuggerListen.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            debuggingMode: {
                                type: 'string',
                                description: "'user' breaks on the given user's activity anywhere in the system; 'terminal' breaks only on activity from this terminal.",
                                enum: ['user', 'terminal']
                            },
                            terminalId: {
                                type: 'string',
                                description: 'Stable GUID identifying this debugger client machine. Generate one and reuse it.'
                            },
                            ideId: {
                                type: 'string',
                                description: 'Stable GUID identifying this IDE workspace. Generate one and reuse it.'
                            },
                            user: {
                                type: 'string',
                                description: 'The user whose activity to break on. Mandatory in user mode.'
                            }
                        },
                        required: ['debuggingMode', 'terminalId', 'ideId', 'user']
                    }
                },
                onFailure: 'Failed to delete debugger listener',
                run: async args => ({
                    result: await this.adtclient.debuggerDeleteListener(
                        args.debuggingMode,
                        args.terminalId,
                        args.ideId,
                        args.user
                    )
                })
            },
            {
                definition: {
                    name: 'debuggerSetBreakpoints',
                    annotations: {
                        title: 'Set breakpoints',
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Set debugger breakpoints. Returns one entry per breakpoint, which may be a DebugBreakpointError instead of a DebugBreakpoint — check each one.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            debuggingMode: {
                                type: 'string',
                                description: "'user' breaks on the given user's activity anywhere in the system; 'terminal' breaks only on activity from this terminal.",
                                enum: ['user', 'terminal']
                            },
                            terminalId: {
                                type: 'string',
                                description: 'Stable GUID identifying this debugger client machine. Generate one and reuse it.'
                            },
                            ideId: {
                                type: 'string',
                                description: 'Stable GUID identifying this IDE workspace. Generate one and reuse it.'
                            },
                            clientId: {
                                type: 'string',
                                description: 'Your own id for this set of breakpoints.'
                            },
                            breakpoints: {
                                type: 'array',
                                description:
                                    'Breakpoints to set. Either plain source URIs with a position, e.g. ' +
                                    "'/sap/bc/adt/programs/programs/zfoo/source/main#start=42', or DebugBreakpoint objects.",
                                items: { type: 'string' }
                            },
                            user: {
                                type: 'string',
                                description: 'The user whose activity to break on. Mandatory in user mode.'
                            },
                            scope: {
                                type: 'string',
                                description: 'Where the breakpoint lives.',
                                enum: ['external', 'debugger']
                            },
                            systemDebugging: {
                                type: 'boolean',
                                description: 'Whether to enable system debugging.'
                            },
                            deactivated: {
                                type: 'boolean',
                                description: 'Whether to deactivate the breakpoints.'
                            },
                            syncScopeUrl: {
                                type: 'string',
                                description:
                                    'URL used to synchronise the breakpoint scope. The misspelled ' +
                                    'syncScupeUrl (as in the underlying API) is still accepted.'
                            }
                        },
                        required: ['debuggingMode', 'terminalId', 'ideId', 'clientId', 'breakpoints', 'user']
                    }
                },
                onFailure: 'Failed to set breakpoints',
                run: async args => ({
                    result: await this.adtclient.debuggerSetBreakpoints(
                        args.debuggingMode,
                        args.terminalId,
                        args.ideId,
                        args.clientId,
                        args.breakpoints,
                        args.user,
                        args.scope,
                        args.systemDebugging,
                        args.deactivated,
                        // The upstream parameter is misspelled; accept both spellings.
                        args.syncScopeUrl ?? args.syncScupeUrl
                    )
                })
            },
            {
                definition: {
                    name: 'debuggerDeleteBreakpoints',
                    annotations: {
                        title: 'Delete breakpoint',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Delete one breakpoint. Pass the DebugBreakpoint object returned by debuggerSetBreakpoints.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            breakpoint: {
                                type: 'object',
                                description: 'One DebugBreakpoint OBJECT as returned by debuggerSetBreakpoints.'
                            },
                            debuggingMode: {
                                type: 'string',
                                description: "'user' breaks on the given user's activity anywhere in the system; 'terminal' breaks only on activity from this terminal.",
                                enum: ['user', 'terminal']
                            },
                            terminalId: {
                                type: 'string',
                                description: 'Stable GUID identifying this debugger client machine. Generate one and reuse it.'
                            },
                            ideId: {
                                type: 'string',
                                description: 'Stable GUID identifying this IDE workspace. Generate one and reuse it.'
                            },
                            requestUser: {
                                type: 'string',
                                description: 'The user whose breakpoint is being deleted.'
                            },
                            scope: {
                                type: 'string',
                                description: 'Where the breakpoint lives.',
                                enum: ['external', 'debugger']
                            }
                        },
                        required: ['breakpoint', 'debuggingMode', 'terminalId', 'ideId', 'requestUser']
                    }
                },
                onFailure: 'Failed to delete breakpoints',
                run: async args => ({
                    result: await this.adtclient.debuggerDeleteBreakpoints(
                        args.breakpoint,
                        args.debuggingMode,
                        args.terminalId,
                        args.ideId,
                        args.requestUser,
                        args.scope
                    )
                })
            },
            {
                definition: {
                    name: 'debuggerAttach',
                    annotations: {
                        title: 'Attach to debuggee',
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: false,
                        openWorldHint: false
                    },
                    description: 'Attach to a debuggee reported by debuggerListen. Returns the reached breakpoint and the initial stack.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            debuggingMode: {
                                type: 'string',
                                description: "'user' breaks on the given user's activity anywhere in the system; 'terminal' breaks only on activity from this terminal.",
                                enum: ['user', 'terminal']
                            },
                            debuggeeId: {
                                type: 'string',
                                description: 'Debuggee id, taken from the result of debuggerListen.'
                            },
                            user: {
                                type: 'string',
                                description: 'The user whose activity to break on. Mandatory in user mode.'
                            },
                            dynproDebugging: {
                                type: 'boolean',
                                description: 'Whether to enable Dynpro debugging.'
                            }
                        },
                        required: ['debuggingMode', 'debuggeeId', 'user']
                    }
                },
                onFailure: 'Failed to attach debugger',
                run: async args => ({
                    result: await this.adtclient.debuggerAttach(
                        args.debuggingMode,
                        args.debuggeeId,
                        args.user,
                        args.dynproDebugging
                    )
                })
            },
            {
                definition: {
                    name: 'debuggerSaveSettings',
                    annotations: {
                        title: 'Save debugger settings',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Persist the debugger settings (system debugging, update debugging, exception objects, ...).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            settings: {
                                type: 'object',
                                description: 'DebugSettings object.',
                                properties: {
                                    systemDebugging: { type: 'boolean' },
                                    createExceptionObject: { type: 'boolean' },
                                    backgroundRFC: { type: 'boolean' },
                                    sharedObjectDebugging: { type: 'boolean' },
                                    showDataAging: { type: 'boolean' },
                                    updateDebugging: { type: 'boolean' }
                                }
                            }
                        },
                        required: ['settings']
                    }
                },
                onFailure: 'Failed to save debugger settings',
                run: async args => ({
                    result: await this.adtclient.debuggerSaveSettings(args.settings)
                })
            },
            {
                definition: {
                    name: 'debuggerStackTrace',
                    annotations: {
                        title: 'Debuggee call stack',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Call stack of the attached debuggee. semanticURIs:true returns ADT URIs you can feed to getObjectSource.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            semanticURIs: {
                                type: 'boolean',
                                description: 'Whether to use semantic URIs.'
                            }
                        }
                    }
                },
                onFailure: 'Failed to get stack trace',
                run: async args => ({
                    result: await this.adtclient.debuggerStackTrace(args.semanticURIs)
                })
            },
            {
                definition: {
                    name: 'debuggerVariables',
                    annotations: {
                        title: 'Read debuggee variables',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Read variables of the current stack frame by name. Use ["SY"] for the system fields.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            parents: {
                                type: 'array',
                                description: 'Variable names to read, e.g. ["SY", "LV_COUNT"].'
                            }
                        },
                        required: ['parents']
                    }
                },
                onFailure: 'Failed to get variables',
                run: async args => ({ result: await this.adtclient.debuggerVariables(args.parents) })
            },
            {
                definition: {
                    name: 'debuggerChildVariables',
                    annotations: {
                        title: 'Expand debuggee variable',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Expand a structure, internal table or object one level deeper.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            parent: {
                                type: 'array',
                                description: 'The parent variable name.'
                            }
                        }
                    }
                },
                onFailure: 'Failed to get child variables',
                run: async args => ({ result: await this.adtclient.debuggerChildVariables(args.parent) })
            },
            {
                definition: {
                    name: 'debuggerStep',
                    annotations: {
                        title: 'Step debuggee',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: false,
                        openWorldHint: true
                    },
                    description: 'Step the attached debuggee. stepRunToLine and stepJumpToLine need url; terminateDebuggee ends the session.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            steptype: {
                                type: 'string',
                                description: 'The step to perform. terminateDebuggee ends the debugging session.',
                                enum: ['stepInto', 'stepOver', 'stepReturn', 'stepContinue', 'stepRunToLine', 'stepJumpToLine', 'terminateDebuggee']
                            },
                            url: {
                                type: 'string',
                                description: 'Target source URI with position, e.g. ".../source/main#start=42". REQUIRED for stepRunToLine and stepJumpToLine, ignored otherwise.'
                            }
                        },
                        required: ['steptype']
                    }
                },
                onFailure: 'Failed to perform debug step',
                run: async args => ({
                    result: await this.adtclient.debuggerStep(args.steptype, args.url)
                })
            },
            {
                definition: {
                    name: 'debuggerGoToStack',
                    annotations: {
                        title: 'Switch stack frame',
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Switch the active stack frame, so variable reads apply to that frame.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            urlOrPosition: {
                                type: 'string',
                                description: 'The URL or position of the stack entry.'
                            }
                        },
                        required: ['urlOrPosition']
                    }
                },
                onFailure: 'Failed to go to stack position',
                run: async args => ({
                    result: await this.adtclient.debuggerGoToStack(args.urlOrPosition)
                })
            },
            {
                definition: {
                    name: 'debuggerSetVariableValue',
                    annotations: {
                        title: 'Overwrite debuggee variable',
                        readOnlyHint: false,
                        destructiveHint: true,
                        idempotentHint: true,
                        openWorldHint: false
                    },
                    description: 'Overwrite a variable in the running debuggee.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            variableName: {
                                type: 'string',
                                description: 'The name of the variable.'
                            },
                            value: {
                                type: 'string',
                                description: 'The new value of the variable.'
                            }
                        },
                        required: ['variableName', 'value']
                    }
                },
                onFailure: 'Failed to set variable value',
                run: async args => ({
                    result: await this.adtclient.debuggerSetVariableValue(args.variableName, args.value)
                })
            }
        ];
    }
}
