# Git Conflict Detector

[![npm version](https://img.shields.io/npm/v/git-conflict-detector.svg)](https://www.npmjs.com/package/git-conflict-detector)
[![npm downloads](https://img.shields.io/npm/dm/git-conflict-detector.svg)](https://www.npmjs.com/package/git-conflict-detector)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)

A TypeScript library that detects potential conflicts between a remote branch and a local branch in a Git repository without fetching the remote branch.

## Overview

Git Conflict Detector helps you identify files that might cause merge conflicts before you attempt to merge or rebase branches. It finds files that have been modified in both the remote branch and your local branch since their common ancestor (merge base).

### Key Features

- Detects potential conflicts without fetching the remote branch
- Uses GitHub API to get remote branch changes
- Runs Git commands on the local repository to get local changes
- Provides both a programmatic API and a CLI interface
- Handles errors gracefully with detailed error messages

## Installation

```bash
npm install git-conflict-detector
```

## Usage

### API Usage

```typescript
import { GitConflictDetector } from 'git-conflict-detector';

// Create a new detector instance
const detector = new GitConflictDetector({
  owner: 'github-username',
  repo: 'repository-name',
  accessToken: 'your-github-token',
  localRepoPath: '/path/to/local/repo',
  branchA: 'remote-branch-name',
  branchB: 'local-branch-name'
});

// Find potential conflicts
async function checkForConflicts() {
  try {
    const result = await detector.findPotentialConflicts();
    
    if (result.error) {
      console.error(`Error: ${result.error}`);
      return;
    }
    
    console.log(`Merge base commit: ${result.mergeBaseCommit}`);
    console.log(`Found ${result.potentialConflicts.length} potential conflicts:`);
    
    result.potentialConflicts.forEach(file => {
      console.log(`- ${file}`);
    });
  } catch (error) {
    console.error('Failed to find conflicts:', error);
  }
}

checkForConflicts();
```

### CLI Usage

```bash
# Using a token directly
git-conflict-detector --owner github-username --repo repository-name --token your-github-token --branch-a remote-branch --branch-b local-branch

# Using a token from a file
git-conflict-detector --owner github-username --repo repository-name --token-file path/to/token-file --branch-a remote-branch --branch-b local-branch

# Specifying local repo path (defaults to current directory)
git-conflict-detector --owner github-username --repo repository-name --token your-github-token --path /path/to/local/repo --branch-a remote-branch --branch-b local-branch

# Output to JSON file
git-conflict-detector --owner github-username --repo repository-name --token your-github-token --branch-a remote-branch --branch-b local-branch --output json --output-file results.json
```

## API Documentation

### GitConflictDetector

The main class that handles conflict detection.

#### Constructor

```typescript
constructor(config: GitConflictDetectorConfig)
```

Parameters:
- `config`: Configuration object with the following properties:
  - `owner`: GitHub repository owner (username or organization)
  - `repo`: GitHub repository name
  - `accessToken`: GitHub Personal Access Token
  - `localRepoPath`: Path to the local Git repository
  - `branchA`: Remote branch name
  - `branchB`: Local branch name

#### Methods

##### findPotentialConflicts()

```typescript
async findPotentialConflicts(): Promise<ConflictDetectionResult>
```

Returns a promise that resolves to a `ConflictDetectionResult` object:

```typescript
interface ConflictDetectionResult {
  // List of file paths that might cause conflicts
  potentialConflicts: string[];
  
  // The merge base commit SHA
  mergeBaseCommit: string;
  
  // Error message if something went wrong (undefined if successful)
  error?: string;
}
```

## How It Works

1. The library finds the merge base (common ancestor) between the remote and local branches
2. It uses the GitHub API to get changes made in the remote branch since the merge base
3. It runs Git commands to get changes made in the local branch since the merge base
4. It identifies files that were changed in both branches (potential conflicts)

## Requirements

- Node.js 14+
- Git installed and accessible from the command line
- A GitHub Personal Access Token with repo scope

## Error Handling

The library handles various error scenarios:

- Invalid configuration parameters
- Local repository issues (not a Git repository, branch doesn't exist)
- GitHub API errors (rate limiting, authentication issues)
- Git command execution errors

## Development

### Building the project

```bash
npm run build
```

### Running tests

```bash
npm test
```

## License

MIT