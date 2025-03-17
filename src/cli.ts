#!/usr/bin/env node

import { GitConflictDetector } from './git-conflict-detector';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';

// Parse command-line arguments
const parseArgs = () => {
  return yargs(hideBin(process.argv))
    .option('owner', {
      type: 'string',
      description: 'GitHub repository owner',
      demandOption: true
    })
    .option('repo', {
      type: 'string',
      description: 'GitHub repository name',
      demandOption: true
    })
    .option('token', {
      type: 'string',
      description: 'GitHub Personal Access Token',
      demandOption: false
    })
    .option('token-file', {
      type: 'string',
      description: 'Path to file containing GitHub Personal Access Token',
      demandOption: false
    })
    .option('path', {
      type: 'string',
      description: 'Path to local Git repository',
      default: process.cwd()
    })
    .option('branch-a', {
      type: 'string',
      description: 'Remote branch name',
      demandOption: true
    })
    .option('branch-b', {
      type: 'string',
      description: 'Local branch name',
      demandOption: true
    })
    .option('output', {
      type: 'string',
      description: 'Output format (json or text)',
      choices: ['json', 'text'],
      default: 'text'
    })
    .option('output-file', {
      type: 'string',
      description: 'Path to output file (if not specified, will print to stdout)'
    })
    .check((argv) => {
      if (!argv.token && !argv['token-file']) {
        throw new Error('Either --token or --token-file must be provided');
      }
      return true;
    })
    .help()
    .alias('help', 'h')
    .parseSync();  // Use parseSync instead of argv
};

// Main function
async function main() {
  try {
    const argv = parseArgs();
    
    // Get GitHub token from file if provided
    let accessToken = argv.token as string | undefined;
    if (argv['token-file']) {
      try {
        accessToken = fs.readFileSync(argv['token-file'] as string, 'utf-8').trim();
      } catch (error) {
        console.error(`Error reading token file: ${(error as Error).message}`);
        process.exit(1);
      }
    }

    // Create detector instance
    const detector = new GitConflictDetector({
      owner: argv.owner as string,
      repo: argv.repo as string,
      accessToken: accessToken as string,
      localRepoPath: argv.path as string,
      branchA: argv['branch-a'] as string,
      branchB: argv['branch-b'] as string
    });

    // Find potential conflicts
    const result = await detector.findPotentialConflicts();

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    // Format output
    let output: string;
    if (argv.output === 'json') {
      output = JSON.stringify(result, null, 2);
    } else {
      output = `Merge base commit: ${result.mergeBaseCommit}\n`;
      output += `Found ${result.potentialConflicts.length} potential conflicts:\n`;
      
      if (result.potentialConflicts.length > 0) {
        result.potentialConflicts.forEach(file => {
          output += `- ${file}\n`;
        });
      } else {
        output += 'No potential conflicts found.\n';
      }
    }

    // Write or print output
    if (argv['output-file']) {
      fs.writeFileSync(argv['output-file'] as string, output);
      console.log(`Output written to ${argv['output-file']}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

main();