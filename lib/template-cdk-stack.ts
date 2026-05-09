import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { WebServiceCDNResources } from './constructs/cdn.js';
import { WebServiceServerResources } from './constructs/server.js';
import { WebServiceVPCResources } from './constructs/vpc.js';

export interface TemplateCdkStackConfig {
  readonly domain: string;
  readonly originDomain: string;
  readonly hostedZoneId: string;
  readonly certArn: string;
  readonly instanceType: string;
  readonly maxPrice: number;
  readonly spot: boolean;
  readonly sshKeyPairName: string;
  readonly additionalSshPublicKeys: string[];
  readonly dockerImage: string;
  readonly dockerPorts: string[];
  readonly environment: Record<string, string>;
  readonly s3Persistence: {
    readonly enabled: boolean;
    readonly bucketName: string;
    readonly dataPath: string;
  };
  readonly backupIntervalMinutes: number;
  readonly originSsl: boolean;
}

export class TemplateCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, config: TemplateCdkStackConfig, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcResources = new WebServiceVPCResources(this, 'WebServiceVPCResources');

    const updateDNSLambda = new lambdaNodejs.NodejsFunction(this, 'UpdateDNSLambda', {
      entry: 'lambdas/update-dns.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      logGroup: new logs.LogGroup(this, 'UpdateDNSLogGroup', {
        logGroupName: 'lambda/UpdateDNSLambda',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: {
        externalModules: [],
        nodeModules: ['@aws-lambda-powertools/logger', '@aws-sdk/client-ec2', '@aws-sdk/client-route-53'],
        minify: true,
        sourceMap: true,
        sourceMapMode: lambdaNodejs.SourceMapMode.INLINE,
        sourcesContent: false,
        format: lambdaNodejs.OutputFormat.ESM,
        target: 'esnext',
        define: {
          'process.env.HOSTED_ZONE_ID': JSON.stringify(config.hostedZoneId),
          'process.env.ORIGIN_DOMAIN': JSON.stringify(config.originDomain),
        },
        platform: 'node',
        mainFields: ['module', 'main'],
        banner: "const require = (await import('node:module')).createRequire(import.meta.url);",
      },
    });

    updateDNSLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ec2:DescribeInstances', 'route53:ChangeResourceRecordSets'],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      }),
    );

    const autoScalingGroupName = `${this.stackName}-Asg`;
    const updateDNSRule = new events.Rule(this, 'UpdateDNSEventRule', {
      eventPattern: {
        source: ['aws.autoscaling'],
        detailType: ['EC2 Instance Launch Successful'],
        detail: { AutoScalingGroupName: [autoScalingGroupName] },
      },
    });

    updateDNSRule.addTarget(
      new targets.LambdaFunction(updateDNSLambda, {
        retryAttempts: 5,
        maxEventAge: cdk.Duration.minutes(10),
        event: events.RuleTargetInput.fromObject({
          detailType: events.EventField.detailType,
          instanceId: events.EventField.fromPath('$.detail.EC2InstanceId'),
        }),
      }),
    );

    const serverResources = new WebServiceServerResources(this, 'WebServiceServerResources', {
      vpc: vpcResources.vpc,
      securityGroup: vpcResources.securityGroup,
      autoScalingGroupName,
      instanceType: config.instanceType,
      maxPrice: config.maxPrice,
      spot: config.spot,
      sshKeyPairName: config.sshKeyPairName,
      additionalSshPublicKeys: config.additionalSshPublicKeys,
      dockerImage: config.dockerImage,
      dockerPorts: config.dockerPorts,
      environment: config.environment,
      s3Persistence: config.s3Persistence,
      backupIntervalMinutes: config.backupIntervalMinutes,
    });

    new WebServiceCDNResources(this, 'WebServiceCDNResources', {
      domain: config.domain,
      originDomain: config.originDomain,
      hostedZoneId: config.hostedZoneId,
      certArn: config.certArn,
      originSsl: config.originSsl,
    });

    new cdk.CfnOutput(this, 'AsgName', {
      value: serverResources.asg.autoScalingGroupName,
    });
  }
}
