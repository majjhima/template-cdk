import * as cdk from 'aws-cdk-lib/core';
import { FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat, SourceMapMode } from 'aws-cdk-lib/aws-lambda-nodejs';

export class TemplateCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define the Lambda function resource
    const myFunction = new NodejsFunction(this, 'HelloWorldFunction', {
      entry: 'src/hello-cdk.ts',
      functionName: 'hello-cdk',
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true, // minify code, defaults to false
        sourceMap: true, // include source map, defaults to false
        sourceMapMode: SourceMapMode.INLINE, // defaults to SourceMapMode.DEFAULT
        sourcesContent: false, // do not include original source into source map, defaults to true
        format: OutputFormat.ESM,
        target: 'esnext', // target environment for the generated JavaScript code
        define: {
          // Replace strings during build time
          'process.env.GREETING': JSON.stringify('Hello CDK!'),
        },
        externalModules: [],
        platform: 'node',

        // ESM important properties:
        mainFields: ['module', 'main'],
        banner: "const require = (await import('node:module')).createRequire(import.meta.url);",
      },
    });

    // Define the Lambda function URL resource
    const myFunctionUrl = myFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    // Define a CloudFormation output for your URL
    new cdk.CfnOutput(this, 'myFunctionUrlOutput', {
      value: myFunctionUrl.url,
    });
  }
}
