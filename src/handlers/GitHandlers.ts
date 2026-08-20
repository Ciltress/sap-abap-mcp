import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class GitHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'gitRepos',
                    description: 'List the abapGit repositories linked in this system. Start here: the GitRepo objects returned are what the other tools need, and GitRepo.key is the repoId.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to get git repos',
                run: async () => ({ repos: await this.adtclient.gitRepos() })
            },
            {
                definition: {
                    name: 'gitExternalRepoInfo',
                    description: 'Retrieves information about an external Git repository.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repourl: {
                                type: 'string',
                                description: 'Remote repository URL, e.g. https://github.com/org/repo.git.'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['repourl']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to get external repo info',
                run: async args => ({
                    repoInfo: await this.adtclient.gitExternalRepoInfo(args.repourl, args.user, args.password)
                })
            },
            {
                definition: {
                    name: 'gitCreateRepo',
                    description: 'Link an ABAP package to a Git repository and pull it for the first time.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            packageName: {
                                type: 'string',
                                description: 'The name of the package.'
                            },
                            repourl: {
                                type: 'string',
                                description: 'Remote repository URL, e.g. https://github.com/org/repo.git.'
                            },
                            branch: {
                                type: 'string',
                                description: 'The branch name.'
                            },
                            transport: {
                                type: 'string',
                                description: 'The transport.'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['packageName', 'repourl']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to create git repo',
                run: async args => ({
                    result: await this.adtclient.gitCreateRepo(
                        args.packageName,
                        args.repourl,
                        args.branch,
                        args.transport,
                        args.user,
                        args.password
                    )
                })
            },
            {
                definition: {
                    name: 'gitPullRepo',
                    description: 'Pull a repository into the ABAP system. OVERWRITES the ABAP objects of the linked package with the repository content.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repoId: {
                                type: 'string',
                                description: 'Repository id — the key field of a GitRepo from gitRepos.'
                            },
                            branch: {
                                type: 'string',
                                description: 'The branch name.'
                            },
                            transport: {
                                type: 'string',
                                description: 'The transport.'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['repoId']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to pull git repo',
                run: async args => ({
                    result: await this.adtclient.gitPullRepo(
                        args.repoId,
                        args.branch,
                        args.transport,
                        args.user,
                        args.password
                    )
                })
            },
            {
                definition: {
                    name: 'gitUnlinkRepo',
                    description: 'Remove the link between a package and its repository. The ABAP objects stay.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repoId: {
                                type: 'string',
                                description: 'Repository id — the key field of a GitRepo from gitRepos.'
                            }
                        },
                        required: ['repoId']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to unlink git repo',
                run: async args => ({ result: await this.adtclient.gitUnlinkRepo(args.repoId) })
            },
            {
                definition: {
                    name: 'stageRepo',
                    description: 'Compute the staging area for a repository. Returns GitStaging with staged/unstaged/ignored; move entries and set comment/author/committer, then pass it to pushRepo.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repo: {
                                type: 'object',
                                description: 'A GitRepo OBJECT as returned by gitRepos.'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['repo']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to stage repo',
                run: async args => ({
                    result: await this.adtclient.stageRepo(args.repo, args.user, args.password)
                })
            },
            {
                definition: {
                    name: 'pushRepo',
                    description: 'Push staged changes to the remote. This PUBLISHES code to an external repository.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repo: {
                                type: 'object',
                                description: 'A GitRepo OBJECT as returned by gitRepos.'
                            },
                            staging: {
                                type: 'object',
                                description: 'The GitStaging OBJECT from stageRepo, with staged/unstaged adjusted and comment/author/committer filled in.'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['repo', 'staging']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to push repo',
                run: async args => ({
                    result: await this.adtclient.pushRepo(args.repo, args.staging, args.user, args.password)
                })
            },
            {
                definition: {
                    name: 'checkRepo',
                    description: 'Consistency check of a linked repository - run it before a pull or push.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repo: {
                                type: 'object',
                                description: 'A GitRepo OBJECT as returned by gitRepos (not just its name or key).'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['repo']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to check repo',
                run: async args => ({
                    result: await this.adtclient.checkRepo(args.repo, args.user, args.password)
                })
            },
            {
                definition: {
                    name: 'remoteRepoInfo',
                    description:
                        'DEPRECATED (duplicate of gitExternalRepoInfo, which takes a URL instead of a repo ' +
                        'object) — retrieves information about the remote of a linked repository.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repo: {
                                type: 'object',
                                description: 'A GitRepo OBJECT as returned by gitRepos (not just its name or key).'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['repo']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to get remote repo info',
                run: async args => ({
                    repoInfo: await this.adtclient.remoteRepoInfo(args.repo, args.user, args.password)
                })
            },
            {
                definition: {
                    name: 'switchRepoBranch',
                    description: 'Switches the branch of a Git repository.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            repo: {
                                type: 'object',
                                description: 'A GitRepo OBJECT as returned by gitRepos (not just its name or key).'
                            },
                            branch: {
                                type: 'string',
                                description: 'The branch name.'
                            },
                            create: {
                                type: 'boolean',
                                description: 'Whether to create the branch if it doesn\'t exist.'
                            },
                            user: {
                                type: 'string',
                                description: 'Git username. NOT your SAP user.'
                            },
                            password: {
                                type: 'string',
                                description: 'Git password or personal access token. NOT your SAP password.'
                            }
                        },
                        required: ['repo', 'branch']
                    },
                    needsFeature: 'abapgit'
                },
                onFailure: 'Failed to switch repo branch',
                run: async args => ({
                    result: await this.adtclient.switchRepoBranch(
                        args.repo,
                        args.branch,
                        args.create,
                        args.user,
                        args.password
                    )
                })
            }
        ];
    }
}
