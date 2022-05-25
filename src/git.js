const simpleGit = require('simple-git');

async function CloneRepo(token, url, branch) {
    try {
        const repo = `https://git-ci:${token}@${url}`;
        await simpleGit().clone(repo,'.');        
        await simpleGit().checkout(branch)
    } catch (error) {
        console.error(error);
        process.exit(1);          
    }

}

async function CommitPushChanges(message) {
    try {
        const git = simpleGit(`${local}/`);
        const branchs = await git.branchLocal();
        await simpleGit().add('./*').commit(message).push('origin',branchs.current);        
    } catch (error) {
        console.error(error);
        process.exit(1);                
    }

}

module.exports = {
    CloneRepo,
    CommitPushChanges
}