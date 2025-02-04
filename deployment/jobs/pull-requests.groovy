multibranchPipelineJob('pull-requests') {
    branchSources {
        github {
            id('cryptograss-repo-prs')
            scanCredentialsId('github-token')
            repoOwner('cryptograss')
            repository('justinholmes.com')
            buildOriginBranch(false)
            buildOriginPRMerge(true)
            
            // Optimize GitHub scanning
            configure { node ->
                def traits = node / sources / data / 'jenkins.branch.BranchSource' / source / traits
                traits << 'jenkins.plugins.git.traits.CloneOptionTrait' {
                    extension {
                        shallow(true)
                        noTags(true)
                        depth(1)
                        reference('')
                    }
                }
                traits << 'jenkins.scm.impl.trait.WildcardSCMHeadFilterTrait' {
                    includes('PR-*')
                    excludes('')
                }
            }
            
            // Add the token to the repository URL
            configure { node ->
                node / 'sources' / 'data' / 'jenkins.branch.BranchSource' / 'source' / 'repositoryUrl' {
                    text("https://\${GITHUB_TOKEN}@github.com/cryptograss/justinholmes.com.git")
                }
            }
            
            // Add GitHub webhook configuration
            configure { node ->
                def traits = node / sources / data / 'jenkins.branch.BranchSource' / source / traits
                traits << 'org.jenkinsci.plugins.github__branch__source.GitHubWebhookTrait' {
                    spec ''
                }
            }
        }
    }
    
    factory {
        workflowBranchProjectFactory {
            scriptPath('deployment/Jenkinsfile')
        }
    }
    
    // Clean up old PR builds
    orphanedItemStrategy {
        discardOldItems {
            numToKeep(10)
            daysToKeep(7)
        }
    }
    
}