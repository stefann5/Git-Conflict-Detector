import { GitConflictDetector, GitConflictDetectorConfig } from './git-conflict-detector';
import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';

// Mock dependencies
jest.mock('axios');
jest.mock('child_process');
jest.mock('fs');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('GitConflictDetector', () => {
  let defaultConfig: GitConflictDetectorConfig;

  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();

    // Setup default config
    defaultConfig = {
      owner: 'test-owner',
      repo: 'test-repo',
      accessToken: 'test-token',
      localRepoPath: '/path/to/repo',
      branchA: 'branchA',
      branchB: 'branchB'
    };

    // Mock fs.existsSync to return true by default
    mockedFs.existsSync.mockImplementation(() => true);

    // Mock execSync to return valid responses by default
    mockValidGitCommands();

    // Mock axios.get to return valid response by default
    mockValidGitHubApiResponse();
  });

  // Helper function to set up standard git command mocks
  function mockValidGitCommands() {
    mockedExecSync.mockImplementation((command) => {
      if (command.includes('rev-parse')) {
        return 'true'; // Is path to local repository git repository
      }
      if (command.includes('branch --list')) {
        return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
      }
      if (command.includes('merge-base')) {
        return 'mergebasecommithash123';
      }
      if (command.includes('diff --name-status')) {
        return 'M\tsrc/file1.js\nA\tsrc/file2.js\nD\tsrc/file3.js';
      }
      return '';
    });
  }

  // Helper function to set up standard GitHub API response mocks
  function mockValidGitHubApiResponse() {
    mockedAxios.get.mockResolvedValue({
      data: {
        files: [
          { filename: 'src/file1.js', status: 'modified' },
          { filename: 'src/file4.js', status: 'added' }
        ]
      }
    });
  }

  describe('constructor', () => {
    it('should create an instance with valid config', () => {
      const detector = new GitConflictDetector(defaultConfig);
      expect(detector).toBeInstanceOf(GitConflictDetector);
    });

    it('should create an instance with branch names containing special characters', () => {
      const configWithSpecialChars = {
        ...defaultConfig,
        branchA: 'feature/special-branch-name',
        branchB: 'hotfix/JIRA-123_fix'
      };
      const detector = new GitConflictDetector(configWithSpecialChars);
      expect(detector).toBeInstanceOf(GitConflictDetector);
    });
  });

  describe('validateConfig', () => {
    it('should throw error if owner is missing', async () => {
      const config = { ...defaultConfig, owner: '' };
      const detector = new GitConflictDetector(config);

      const result = await detector.findPotentialConflicts();
      expect(result.error).toBe('Owner is required');
    });

    it('should throw error if repo is missing', async () => {
      const config = { ...defaultConfig, repo: '' };
      const detector = new GitConflictDetector(config);

      const result = await detector.findPotentialConflicts();
      expect(result.error).toBe('Repository name is required');
    });

    it('should throw error if accessToken is missing', async () => {
      const config = { ...defaultConfig, accessToken: '' };
      const detector = new GitConflictDetector(config);

      const result = await detector.findPotentialConflicts();
      expect(result.error).toBe('Access token is required');
    });

    it('should throw error if localRepoPath is missing', async () => {
      const config = { ...defaultConfig, localRepoPath: '' };
      const detector = new GitConflictDetector(config);

      const result = await detector.findPotentialConflicts();
      expect(result.error).toBe('Local repository path is required');
    });

    it('should throw error if branchA is missing', async () => {
      const config = { ...defaultConfig, branchA: '' };
      const detector = new GitConflictDetector(config);

      const result = await detector.findPotentialConflicts();
      expect(result.error).toBe('Branch A name is required');
    });

    it('should throw error if branchB is missing', async () => {
      const config = { ...defaultConfig, branchB: '' };
      const detector = new GitConflictDetector(config);

      const result = await detector.findPotentialConflicts();
      expect(result.error).toBe('Branch B name is required');
    });

    it('should throw error if local repo path does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toBe(`Local repository path does not exist: ${defaultConfig.localRepoPath}`);
    });

    it('should accept valid config with unicode characters in branch names', async () => {
      const config = {
        ...defaultConfig,
        branchA: '🚀-feature',
        branchB: 'hotfix-✨'
      };

      // Update mock to include these branch names
      mockedExecSync.mockImplementation((command) => {
        if (command.includes('branch --list')) {
          return `* ${config.branchA}\n  ${config.branchB}`;
        }
        if (command.includes('merge-base')) {
          return 'mergebasecommithash123';
        }
        return '';
      });

      const detector = new GitConflictDetector(config);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toBeUndefined();
    });
  });

  describe('validateLocalRepository', () => {
    it('should throw error if not a git repository', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          throw new Error('Not a git repository');
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('Invalid git repository');
    });

    it('should throw error if branchB does not exist locally', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  some-non-existent-branch`;
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain(`Branch '${defaultConfig.branchB}' does not exist locally`);
    });

    it('should handle git command execution errors', async () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('Git command failed');
    });

    it('should handle git command execution with non-zero exit code', async () => {
      mockedExecSync.mockImplementation(() => {
        const error: any = new Error('fatal: not a git repository');
        error.status = 128;
        throw error;
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('Git command failed');
    });
  });

  describe('findMergeBaseCommit', () => {
    it('should return merge base commit hash', async () => {
      const mergeBaseCommit = 'mergebasecommithash123';

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.mergeBaseCommit).toBe(mergeBaseCommit);
    });

    it('should throw error if merge base cannot be found', async () => {
      mockedExecSync.mockImplementation((command) => {
        if (command.includes('rev-parse')) {
          return 'true';
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          throw new Error('No merge base found');
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('Failed to find merge base');
    });

    it('should handle empty merge base output', async () => {
      mockedExecSync.mockImplementation((command) => {
        if (command.includes('rev-parse')) {
          return 'true';
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return '';
        }
        if (command.includes('diff --name-status')) {
          return 'M\tsrc/file1.js\nA\tsrc/file2.js\nD\tsrc/file3.js';
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('Failed to find merge base');
    });
  });

  describe('getLocalChanges', () => {
    it('should parse git diff output correctly', async () => {
      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-status'),
        expect.anything()
      );
      expect(result.error).toBeUndefined();
    });

    it('should handle empty diff output', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'true';
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return 'mergebasecommithash123';
        }
        if (command.includes('diff --name-status')) {
          return '';
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.potentialConflicts).toEqual([]);
      expect(result.error).toBeUndefined();
    });


    it('should handle filenames with special characters', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'true'; // Is path to local repository git repository
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return 'mergebasecommithash123';
        }
        if (command.includes('diff --name-status')) {
          return 'M\tsrc/file with spaces.js\nA\tsrc/file-with-dashes.js\nD\tsrc/file_with_underscores.js';
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      // This test is checking that the function handles filenames with special characters
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-status'),
        expect.anything()
      );
      expect(result.error).toBeUndefined();

    });
  });

  describe('getRemoteChanges', () => {
    it('should fetch remote changes using GitHub API', async () => {
      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(`https://api.github.com/repos/${defaultConfig.owner}/${defaultConfig.repo}/compare/`),
        expect.anything()
      );
      expect(result.error).toBeUndefined();
    });

    it('should handle GitHub API errors with status code', async () => {
      mockedAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 404,
          data: {
            message: 'Not Found'
          }
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('GitHub API error (404)');
    });

    it('should handle GitHub API errors without status code', async () => {
      mockedAxios.get.mockRejectedValue({
        isAxiosError: true,
        message: 'Network Error'
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('GitHub API error (Unknown): Network Error');
    });

    it('should handle GitHub API rate limiting', async () => {
      mockedAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            message: 'API rate limit exceeded'
          }
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('GitHub API error (403)');
    });

    it('should handle GitHub API unauthorized errors', async () => {
      mockedAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            message: 'Bad credentials'
          }
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('GitHub API error (401)');
    });

    it('should handle empty files array in response', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: []
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.potentialConflicts).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should handle missing files property in API response', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {}
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.potentialConflicts).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should handle network timeouts', async () => {
      mockedAxios.get.mockRejectedValue({
        isAxiosError: true,
        code: 'ECONNABORTED',
        response: {
          status: 408,
          data: {
            message: 'Request Timeout'
          }
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('GitHub API error (408): Request Timeout');
    });

    it('should handle different file statuses in API response', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            { filename: 'src/file1.js', status: 'modified' },
            { filename: 'src/file2.js', status: 'added' },
            { filename: 'src/file3.js', status: 'removed' },
            { filename: 'src/file4.js', status: 'renamed' },
            { filename: 'src/file5.js', status: 'copied' },
            { filename: 'src/file6.js', status: 'changed' }
          ]
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      // This test is checking that the function handles various file statuses
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(result.error).toBeUndefined();
    });
  });

  describe('findCommonChanges', () => {
    it('should find common files changed in both branches', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            { filename: 'src/file1.js', status: 'modified' },
            { filename: 'src/file4.js', status: 'added' }
          ]
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.potentialConflicts).toContain('src/file1.js');
      expect(result.potentialConflicts.length).toBe(1);
    });

    it('should return empty array when no common changes', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'true'; // Is path to local repository git repository
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return 'mergebasecommithash123';
        }
        if (command.includes('diff --name-status')) {
          return 'M\tsrc/file5.js\nA\tsrc/file6.js';
        }
        return '';
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            { filename: 'src/file1.js', status: 'modified' },
            { filename: 'src/file4.js', status: 'added' }
          ]
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.potentialConflicts).toEqual([]);
      expect(result.error).toBeUndefined();
    });


    it('should handle multiple common changes', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'true'; // Is path to local repository git repository
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return 'mergebasecommithash123';
        }
        if (command.includes('diff --name-status')) {
          return 'M\tsrc/file1.js\nM\tsrc/file2.js\nM\tsrc/file3.js';
        }
        return '';
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            { filename: 'src/file1.js', status: 'modified' },
            { filename: 'src/file2.js', status: 'modified' },
            { filename: 'src/file3.js', status: 'modified' },
            { filename: 'src/file4.js', status: 'added' }
          ]
        }
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.potentialConflicts).toContain('src/file1.js');
      expect(result.potentialConflicts).toContain('src/file2.js');
      expect(result.potentialConflicts).toContain('src/file3.js');
      expect(result.potentialConflicts.length).toBe(3);
      expect(result.error).toBeUndefined();
    });
  });

  describe('parseGitDiffOutput', () => {
    it('should handle tabs in filenames', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'true';
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return 'mergebasecommithash123';
        }
        if (command.includes('diff --name-status')) {
          return 'M\tsrc/file\twith\ttabs.js';
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      // This test is checking if the function correctly handles tabs in filenames
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-status'),
        expect.anything()
      );
      expect(result.error).toBeUndefined();
    });

    it('should handle whitespace in the diff output', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'true'; 
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return 'mergebasecommithash123';
        }
        if (command.includes('diff --name-status')) {
          return '  M  \tsrc/file1.js\n\nA\tsrc/file2.js  \n  D\tsrc/file3.js  ';
        }
        return '';
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      // This test is checking if the function correctly handles whitespace in the diff output
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-status'),
        expect.anything()
      );
      expect(result.error).toBeUndefined();
    });
  });

  describe('execGitCommand', () => {
    it('should handle errors with stack traces', async () => {
      mockedExecSync.mockImplementation(() => {
        const error = new Error('Command failed');
        error.stack = 'Error: Command failed\n    at Object.<anonymous> (/path/to/file.js:1:1)';
        throw error;
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toContain('Git command failed');
    });
  });

  describe('findPotentialConflicts', () => {
    it('should return potential conflicts successfully', async () => {
      const mergeBaseCommit = 'mergebasecommithash123';

      // Make sure all Git commands return expected values
      mockValidGitCommands();

      // Make sure GitHub API returns expected values
      mockValidGitHubApiResponse();

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result).toEqual({
        potentialConflicts: ['src/file1.js'],
        mergeBaseCommit
      });
    });

    it('should handle errors thrown during execution', async () => {
      // Simulate an unexpected error during execution
      mockedExecSync.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();

      expect(result.error).toBeDefined();
      expect(result.potentialConflicts).toEqual([]);
      expect(result.mergeBaseCommit).toBe('');
    });

  });
});