#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import configJson from '../lib/resources/config.json' with { type: 'json' };
import { TemplateCdkStack, TemplateCdkStackConfig } from '../lib/template-cdk-stack.js';

const config = configJson as TemplateCdkStackConfig;

const app = new cdk.App();
new TemplateCdkStack(app, 'TemplateCdkStack', config, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
