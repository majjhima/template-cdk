import { test } from 'vitest';
import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import * as TemplateCdk from '../lib/template-cdk-stack.js';

test('Lambda Function Created', () => {
  const app = new cdk.App();
  const stack = new TemplateCdk.TemplateCdkStack(app, 'MyTestStack');
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'index.handler',
  });
});
