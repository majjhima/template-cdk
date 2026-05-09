import { test } from 'vitest';
import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { TemplateCdkStack } from '../lib/template-cdk-stack.js';

const baseConfig = {
  domain: 'example.com',
  originDomain: 'origin.example.com',
  hostedZoneId: 'Z1234567890ABCDEFGHIJ',
  certArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  instanceType: 't4g.micro',
  maxPrice: 0.005,
  spot: true,
  sshKeyPairName: 'my-key-pair',
  additionalSshPublicKeys: [],
  dockerImage: 'nginx:alpine',
  dockerPorts: ['80:80'],
  environment: {},
  s3Persistence: {
    enabled: false,
    bucketName: '',
    dataPath: '/data',
  },
  backupIntervalMinutes: 5,
  originSsl: false,
};

test('VPC Created', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::EC2::VPC', {
    EnableDnsHostnames: true,
    EnableDnsSupport: true,
  });
});

test('Security Group allows 22, 80, 443', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: [
      { IpProtocol: 'tcp', FromPort: 22, ToPort: 22 },
      { IpProtocol: 'tcp', FromPort: 80, ToPort: 80 },
      { IpProtocol: 'tcp', FromPort: 443, ToPort: 443 },
    ],
  });
});

test('Auto Scaling Group Created', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
    MinSize: '1',
    MaxSize: '1',
    DesiredCapacity: '1',
  });
});

test('Launch Template with Spot Options', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
    LaunchTemplateData: {
      InstanceMarketOptions: {
        MarketType: 'spot',
        SpotOptions: {
          MaxPrice: '0.005',
          SpotInstanceType: 'one-time',
          InstanceInterruptionBehavior: 'terminate',
        },
      },
    },
  });
});

test('CloudFront Distribution Created', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Aliases: ['example.com'],
      ViewerCertificate: {
        AcmCertificateArn: baseConfig.certArn,
        SslSupportMethod: 'sni-only',
      },
    },
  });
});

test('Route53 A Record points to CloudFront', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    Type: 'A',
    Name: 'example.com.',
  });
});

test('Lambda Function for DNS Updates Created', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'index.handler',
    Runtime: 'nodejs22.x',
  });
});

test('EventBridge Rule targets Lambda on ASG Launch', () => {
  const app = new cdk.App();
  const stack = new TemplateCdkStack(app, 'MyTestStack', baseConfig);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Events::Rule', {
    EventPattern: {
      source: ['aws.autoscaling'],
      'detail-type': ['EC2 Instance Launch Successful'],
    },
  });
});
