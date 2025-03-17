import { GitConflictDetector } from '../src/git-conflict-detector';

const detector = new GitConflictDetector({
    owner: 'github-username',
    repo: 'repository-name',
    accessToken: 'your-github-token',
    localRepoPath: '/path/to/local/repo',
    branchA: 'remote-branch-name',
    branchB: 'local-branch-name'
});

async function findConflicts() {
    try {
        const result = await detector.findPotentialConflicts();
        if (result.error) {
            console.error(`Error: ${result.error}`);
            return;
        }
        console.log(`Merge base commit: ${result.mergeBaseCommit}`);
        console.log(`Found ${result.potentialConflicts.length} potential confilcts`);
        result.potentialConflicts.forEach(file => console.log(` - ${file}`));

    } catch (error) {
        console.log(`Failed to find conflicts:`, error);
    }
}

findConflicts();