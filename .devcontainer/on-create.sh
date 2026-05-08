#!/bin/sh
set -ex

sudo apt -y update
sudo apt -y dist-upgrade

## Install Node
PROFILE=/dev/null bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/refs/heads/master/install.sh | bash'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm --version
nvm install node
node --version

## Install Typescript
npm install -g typescript
tsc --version

## Install AWS CDK
npm install -g aws-cdk
cdk --version

## Install AWS CLI
cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "/tmp/awscliv2.zip"
unzip -o awscliv2.zip
sudo ./aws/install --update
aws --version

echo "OnCreate setup done!"
