import {GitConflictDetector} from '../src/git-conflict-detector';

const detector= new GitConflictDetector({
    owner:'stefann5',
    repo:'test-repo',
    accessToken:'',
    localRepoPath:'C:/homework/jetbrains_task/test_repo2',
    branchA:'branchA',
    branchB:'branchB'
});

async function findConflicts() {
    try{
        const result=await detector.findPotentialConflicts();
        if(result.error){
            console.error(`Error: ${result.error}`);
            return;
        }
        console.log(`Merge base commit: ${result.mergeBaseCommit}`);
        console.log(`Found ${result.potentialConflicts.length} potential confilcts`);
        result.potentialConflicts.forEach(file=>console.log(` - ${file}`));

    }catch(error){
        console.log(`Failed to find conflicts:`,error);
    }
}

findConflicts();