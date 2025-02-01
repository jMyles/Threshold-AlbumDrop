pipeline {
    agent any
    
    environment {
        NODE_VERSION = '23.6.1'
        NVM_DIR = '/var/jenkins_home/.nvm'
        CHAIN_DATA_DIR = '/var/jenkins_home/shared/chain_data'
    }
    
    triggers {
        // Run every 2 minutes
        cron('H/2 * * * *')
    }
    
    stages {
        stage('Setup') {
            steps {
                sh '''
                    mkdir -p ${CHAIN_DATA_DIR}
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm install ${NODE_VERSION}
                    nvm use ${NODE_VERSION}
                    npm install
                '''
            }
        }
        
        stage('Fetch Chain Data') {
            steps {
                sh '''
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use ${NODE_VERSION}
                    CHAIN_DATA_OUTPUT_DIR=${CHAIN_DATA_DIR} npm run fetch-chain-data
                '''
            }
        }
    }
    
    post {
        success {
            // Touch a file to indicate successful completion
            sh "touch ${CHAIN_DATA_DIR}/.last_fetch_success"
        }
    }
}