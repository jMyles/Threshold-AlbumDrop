FROM jenkins/jenkins:lts-jdk17

USER root

# Install Node.js dependencies and other required packages
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    rsync \
    sudo \
    curl \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Add jenkins user to sudoers
RUN echo "jenkins ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER jenkins

# Install required plugins
RUN jenkins-plugin-cli --plugins \
    configuration-as-code \
    workflow-aggregator \
    git \
    github \
    credentials-binding \
    pipeline-utility-steps \
    matrix-auth \
    job-dsl \
    workflow-job \
    pipeline-model-definition \
    pipeline-stage-view \
    pipeline-graph-view \
    dark-theme \
    github-branch-source \
    mask-passwords \
    build-name-setter \
    pipeline-github

# Create directory for Configuration as Code
RUN mkdir -p /var/jenkins_home/casc_configs

# Skip initial setup wizard
ENV JAVA_OPTS -Djenkins.install.runSetupWizard=false