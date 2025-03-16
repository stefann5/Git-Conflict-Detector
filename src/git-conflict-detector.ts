import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';

/**
 * Configuration for the GitConflictDetector
 */
export interface GitConflictDetectorConfig {
  owner: string;
  repo: string;
  accessToken: string;
  localRepoPath: string;
  branchA: string;
  branchB: string;
}

/**
 * Result of the conflict detection
 */
export interface ConflictDetectionResult {
  potentialConflicts: string[];
  mergeBaseCommit: string;
  error?: string;
}

/**
 * A file change representation
 */
interface FileChange {
  filename: string;
  status: string;
}

/**
 * GitConflictDetector detects potential conflicts between two branches by identifying
 * files modified in both branches since their common ancestor (merge base)
 */
export class GitConflictDetector {
  private config: GitConflictDetectorConfig;

  /**
   * Creates a new instance of GitConflictDetector
   * @param config The configuration object containing repository and branch information
   */
  constructor(config: GitConflictDetectorConfig) {
    this.config = config;
  }

  /**
   * Find potential conflicts between branches by identifying files changed in both
   * branches since their common ancestor
   * @returns Promise resolving to conflict detection result
   */
  public async findPotentialConflicts(): Promise<ConflictDetectionResult> {
    try {
      // Validate config parameters
      const configError = this.validateConfig();
      if (configError) {
        return {
          potentialConflicts: [],
          mergeBaseCommit: '',
          error: configError
        };
      }
      
      // Validate local repository and branch existence
      const repoError = this.validateLocalRepository();
      if (repoError) {
        return {
          potentialConflicts: [],
          mergeBaseCommit: '',
          error: repoError
        };
      }

      // Find common ancestor commit between the two branches
      const mergeBaseCommit = this.findMergeBaseCommit();

      // Get files changed in local branchB compared to merge base
      const localChanges = this.getLocalChanges(mergeBaseCommit);

      // Get files changed in remote branchA compared to merge base using GitHub API
      const remoteChanges = await this.getRemoteChanges(mergeBaseCommit);

      // Find files modified in both branches (potential conflict candidates)
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

  /**
   * Validates the configuration parameters
   * @returns Error message string if validation fails, null if valid
   */
  private validateConfig(): string | null {
    const { owner, repo, accessToken, localRepoPath, branchA, branchB } = this.config;
    
    if (!owner) return 'Owner is required';
    if (!repo) return 'Repository name is required';
    if (!accessToken) return 'Access token is required';
    if (!localRepoPath) return 'Local repository path is required';
    if (!branchA) return 'Branch A name is required';
    if (!branchB) return 'Branch B name is required';
    
    if (!fs.existsSync(localRepoPath)) {
      return `Local repository path does not exist: ${localRepoPath}`;
    }
    
    return null;
  }

  /**
   * Validates that the local repository is valid and contains the required branch
   * @returns Error message string if validation fails, null if valid
   */
  private validateLocalRepository(): string | null {
    const { localRepoPath, branchB } = this.config;
    
    try {
      // Check if it's a git repository
      this.execGitCommand('rev-parse --is-inside-work-tree');
      
      // Check if branchB exists locally
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

  /**
   * Finds the common ancestor commit between branchA (remote) and branchB (local)
   * @returns The merge base commit SHA
   * @throws Error if merge base cannot be found
   */
  private findMergeBaseCommit(): string {
    const { branchA, branchB } = this.config;
    
    try {
      // Get the remote reference for branchA
      const remoteRef = `origin/${branchA}`;
      
      // Find merge base between remote branchA and local branchB
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

  /**
   * Gets files changed in local branchB compared to merge base
   * @param mergeBaseCommit The merge base commit SHA
   * @returns Array of file changes with filename and status
   */
  private getLocalChanges(mergeBaseCommit: string): FileChange[] {
    const { branchB } = this.config;
    
    try {
      // Get a list of files changed between merge base and branchB
      const output = this.execGitCommand(`diff --name-status ${mergeBaseCommit} ${branchB}`);
      
      return this.parseGitDiffOutput(output);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get local changes: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Gets files changed in remote branchA compared to merge base using GitHub API
   * @param mergeBaseCommit The merge base commit SHA
   * @returns Promise resolving to array of file changes
   */
  private async getRemoteChanges(mergeBaseCommit: string): Promise<FileChange[]> {
    const { owner, repo, accessToken, branchA } = this.config;
    
    try {
      // Compare commits using GitHub API
      const url = `https://api.github.com/repos/${owner}/${repo}/compare/${mergeBaseCommit}...${branchA}`;
      
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
      // Handle Axios errors specifically
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

  /**
   * Finds files that were changed in both local and remote branches
   * @param localChanges Array of local file changes
   * @param remoteChanges Array of remote file changes
   * @returns Array of filenames that were changed in both branches
   */
  private findCommonChanges(localChanges: FileChange[], remoteChanges: FileChange[]): string[] {
    const localFiles = new Set(localChanges.map(change => change.filename));
    
    return remoteChanges
      .filter(change => localFiles.has(change.filename))
      .map(change => change.filename);
  }

  /**
   * Parses git diff output into FileChange objects
   * @param output The git diff command output
   * @returns Array of FileChange objects with filename and status
   */
  private parseGitDiffOutput(output: string): FileChange[] {
    if (!output.trim()) {
      return [];
    }
    
    return output.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const [status, ...filenameParts] = line.trim().split('\t');
        const filename = filenameParts.join('\t'); // Handle filenames with tabs
        
        return {
          filename,
          status
        };
      });
  }

  /**
   * Executes a git command in the local repository directory
   * @param command The git command to execute (without the 'git' prefix)
   * @returns The command output as a string
   * @throws Error if the git command fails
   */
  private execGitCommand(command: string): string {
    try {
      const result = execSync(`git ${command}`, {
        cwd: this.config.localRepoPath,
        encoding: 'utf-8'
      });
      
      // Ensure we always return a string
      return result && typeof result === 'string' ? result : String(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Git command failed: git ${command} - ${error.message}`);
      }
      throw error;
    }
  }
}