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
    // Used for checking whether path for local repository exists
    mockedFs.existsSync.mockImplementation(() => true);
    
    // Mock execSync to return valid responses by default
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
    
    // Mock axios.get to return valid response by default
    mockedAxios.get.mockResolvedValue({
      data: {
        files: [
          { filename: 'src/file1.js', status: 'modified' },
          { filename: 'src/file4.js', status: 'added' }
        ]
      }
    });
  });
  
  describe('constructor', () => {
    it('should create an instance with valid config', () => {
      const detector = new GitConflictDetector(defaultConfig);
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
  });
  
  describe('findMergeBaseCommit', () => {
    it('should return merge base commit hash', async () => {
      const mergeBaseCommit = 'mergebasecommithash123';
      
      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();
      
      expect(result.mergeBaseCommit).toBe(mergeBaseCommit);
    });
    
    it('should throw error if merge base cannot be found', async () => {
      // First let validation pass, then make merge-base fail
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
      await detector.findPotentialConflicts();
      
      // This test implicitly tests parseGitDiffOutput
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('diff --name-status'),
        expect.anything()
      );
    });
    
    it('should handle empty diff output', async () => {
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('diff --name-status')) {
          return '';
        }
        return '';
      });
      
      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();
      
      expect(result.potentialConflicts).toEqual([]);
    });
  });
  
  describe('getRemoteChanges', () => {
    it('should fetch remote changes using GitHub API', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: [
            { filename: 'src/file1.js', status: 'modified' },
            { filename: 'src/file4.js', status: 'added' }
          ]
        }
      });
      
      const detector = new GitConflictDetector(defaultConfig);
      await detector.findPotentialConflicts();
      
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(`https://api.github.com/repos/${defaultConfig.owner}/${defaultConfig.repo}/compare/`),
        expect.anything()
      );
    });
    
    it('should handle GitHub API errors', async () => {      
      // Mock axios.get to throw an error with the expected structure
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
    
    it('should handle empty files array in response', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          files: []
        }
      });
      
      const detector = new GitConflictDetector(defaultConfig);
      const result = await detector.findPotentialConflicts();
      
      expect(result.potentialConflicts).toEqual([]);
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
    });
  });
  
  describe('findPotentialConflicts integration', () => {
    it('should return potential conflicts successfully', async () => {
      const mergeBaseCommit = 'mergebasecommithash123';
      
      // Make sure all Git commands return expected values
      mockedExecSync.mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'true';
        }
        if (command.includes('branch --list')) {
          return `* ${defaultConfig.branchA}\n  ${defaultConfig.branchB}`;
        }
        if (command.includes('merge-base')) {
          return mergeBaseCommit;
        }
        if (command.includes('diff --name-status')) {
          return 'M\tsrc/file1.js\nA\tsrc/file2.js\nD\tsrc/file3.js';
        }
        return '';
      });
      
      // Make sure GitHub API returns expected values
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
      
      expect(result).toEqual({
        potentialConflicts: ['src/file1.js'],
        mergeBaseCommit
      });
    });
  });
});
