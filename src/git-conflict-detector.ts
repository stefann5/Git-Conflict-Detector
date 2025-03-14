import axios from 'axios';
import { execSync } from 'child_process'
import * as fs from 'fs'

export interface GitConflictDetectorConfig {
    owner: string;
    repo: string;
    accessToken: string;
    localRepoPath: string;
    branchA: string;
    branchB: string;
}

export interface ConflictDetectionResult {
    potentialConflicts: string[];
    mergeBaseCommit: string;
    error?: string;
}

interface FileChange {
    filename: string;
    status: string;
}

export class GitConflictDetector {
    private config: GitConflictDetectorConfig;
    private gitHubApiUrl = "https://api.github.com/";

    constructor(config: GitConflictDetectorConfig) {
        this.config = config;
    }

    public async findPotentialConflicts(): Promise<ConflictDetectionResult> {
        try {
            const configError = this.validateConfig();
            if (configError) {
                return {
                    potentialConflicts: [],
                    mergeBaseCommit: '',
                    error: configError
                };
            }

            const repoError = this.validateLocalRepository();
            if (repoError) {
                return {
                    potentialConflicts: [],
                    mergeBaseCommit: '',
                    error: repoError
                };
            }
            const mergeBaseCommit = this.findMergeBaseCommit();

            const localChanges = this.getLocalChanges(mergeBaseCommit);

            const remoteChanges = await this.getRemoteChanges(mergeBaseCommit);

            const potentialConflicts = this.findCommonChanges(localChanges, remoteChanges);

            return {
                potentialConflicts,
                mergeBaseCommit
            };
        } catch (error) {
            return {
                potentialConflicts: [],
                mergeBaseCommit: '',
                error: error instanceof Error ? error.message : String(error)
            };
        }

    }

    private validateConfig(): string | null {
        const { owner, repo, accessToken, localRepoPath, branchA, branchB } = this.config;
        if (!owner) return 'Owner is required';
        if (!repo) return 'Remote repository name is required';
        if (!accessToken) return 'Access token is required';
        if (!localRepoPath) return 'Local repository path is required';
        if (!branchA) return 'Branch A name is required';
        if (!branchB) return 'Branch B name is required';

        if (!fs.existsSync(localRepoPath)) {
            return `Local repository path does not exist: ${localRepoPath}`;
        }

        return null;

    }

    private validateLocalRepository(): string | null {
        const { localRepoPath, branchB } = this.config;
        try {
            this.execGitCommand('rev-parse --is-inside-work-tree');

            const branches = this.execGitCommand('branch --list').split('\n')
                .map(branch => branch.trim().replace(/^\*\s*/, ''))
                .filter(Boolean);

            if (!branches.includes(branchB)) {
                return `Branch '${branchB}' does not exist locally`;
            }
            return null;
        } catch (error) {
            if (error instanceof Error) {
                return `Invalid git repository at ${localRepoPath}: ${error.message}`;
            }
            return String(error);
        }
    }

    private findMergeBaseCommit(): string {
        const { branchA, branchB } = this.config;

        try {
            const remoteRef = `origin/${branchA}`;

            const mergeBase = this.execGitCommand(`merge-base ${remoteRef} ${branchB}`).trim();
            if (!mergeBase) {
                throw new Error(`Could not find merge base between ${remoteRef} and ${branchB}`);
            }
            return mergeBase;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to find merge base: ${error.message}`);
            }
            throw error;
        }
    }

    private getLocalChanges(mergeBaseCommit: string): FileChange[] {
        const { branchB } = this.config;
        try {
            const output = this.execGitCommand(`diff --name-status ${mergeBaseCommit} ${branchB}`);

            return this.parseGitDiffOutput(output);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to get local changes: ${error.message}`);
            }
            throw error;
        }
    }

    private async getRemoteChanges(mergeBaseCommit: string): Promise<FileChange[]> {
        const { owner, repo, accessToken, branchA } = this.config;
        try {
            const url = `${this.gitHubApiUrl}/repos/${owner}/${repo}/compare/${mergeBaseCommit}...${branchA}`;

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            const files = response.data.files || [];
            return files.map((file: any) => ({
                filename: file.filename,
                status: file.status
            }));
        } catch (error) {
            if (error && typeof error === 'object' && 'isAxiosError' in error && error.isAxiosError) {
                const axiosError = error as any;
                const statusCode = axiosError.response?.status;
                const message = axiosError.response?.data?.message || axiosError.message;

                throw new Error(`GitHub API error (${statusCode}): ${message}`);
            }
            if (error instanceof Error) {
                throw new Error(`Failed to get remote changes: ${error.message}`);
            }
            throw new Error(`Failed to get remote changes: ${String(error)}`);
        }
    }

    private findCommonChanges(localChanges: FileChange[], remoteChanges: FileChange[]): string[] {
        const localFiles = new Set(localChanges.map(change => change.filename));

        return remoteChanges.filter(change => localFiles.has(change.filename)).map(change => change.filename);
    }

    private parseGitDiffOutput(output: string): FileChange[] {
        if (!output.trim()) {
            return [];
        }

        return output.trim().split('\n')
            .filter(Boolean)
            .map(line => {
                const [status, ...filenameParts] = line.trim().split('\t');
                const filename = filenameParts.join('\t');
                return {
                    filename,
                    status
                }
            })
    }

    private execGitCommand(command: string): string {
        try {
            const result = execSync(`git ${command}`, {
                cwd: this.config.localRepoPath,
                encoding: 'utf-8'
            });

            return result && typeof result === 'string' ? result : String(result);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Git command failed: git ${command} - ${error.message}`);
            }
            throw error;
        }
    }
}