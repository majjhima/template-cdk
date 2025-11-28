#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { TemplateCdkStack } from '../lib/template-cdk-stack.js';

const app = new cdk.App();
new TemplateCdkStack(app, 'TemplateCdkStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
