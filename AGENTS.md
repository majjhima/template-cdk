# Agent Notes: template-cdk

## Project

Single-stack AWS CDK TypeScript app. Deploys a Docker-based web service on a Spot EC2 instance (Auto Scaling Group, min=1, max=1) with CloudFront HTTPS fronting, Route53 alias, and dynamic origin DNS via EventBridge Lambda.

**Key files:**

- Stack definition: `lib/template-cdk-stack.ts`
- VPC + Security Group: `lib/constructs/vpc.ts`
- ASG + Launch Template + CloudFormationInit: `lib/constructs/server.ts`
- CloudFront + Route53 alias: `lib/constructs/cdn.ts`
- DNS Lambda: `lambdas/update-dns.ts`
- Config: `lib/resources/config.json`
- CDK app entry: `bin/template-cdk.ts`

## Build & Verify

- `npm run build` — compile TypeScript (`tsc`). Output goes to `dist/`.
- `npm run test` — run Vitest unit tests.
- `npm run lint` / `npm run lint:fix` — ESLint with typescript-eslint.
- `npm run fmt` / `npm run fmt:check` — Prettier.
- `npm run release` — runs install → fmt:check → lint → build → test in order.
- `npm run watch` — `tsc -w`.

**Order matters for CI:** fmt:check → lint → build → test.

## CDK Commands

CDK app reads compiled JS from `dist/bin/template-cdk.js`. **Build first.**

- `npx cdk synth` — synthesize template (requires `npm run build`).
- `npx cdk deploy` — deploy stack.
- `npx cdk diff` — compare deployed stack.

## ESM / NodeNext Quirks

- `package.json` sets `"type": "module"`.
- `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`.
- **TypeScript imports must use `.js` extensions** even when importing `.ts` files (e.g., `import { Foo } from './foo.js'`).
- Lambda bundling in `lib/template-cdk-stack.ts` is configured for ESM (`format: OutputFormat.ESM`) with esbuild.

## Testing

- Tests use `aws-cdk-lib/assertions` to assert on synthesized CloudFormation resources.
- `vitest.config.js` excludes `dist/` and `node_modules/`.
- Tests import stack classes using `.js` extensions.

## Context

- `cdk.context.json` exists but is gitignored. It stores `acknowledged-issue-numbers`. Do not delete it unless intentional.

## AWS Guidance

Prefer the AWS MCP Server for AWS interactions — it provides sandboxed execution, observability, and audit logging. If unavailable, use the AWS CLI directly.

Before starting a task, check whether a relevant AWS skill is available. Load the skill with `retrieve_skill` and prefer its guidance over general knowledge.

When uncertain about specific AWS details (API parameters, permissions, limits, error codes), verify against documentation rather than guessing. State uncertainty explicitly if you cannot confirm.

When creating infrastructure, prefer infrastructure-as-code (AWS CDK or CloudFormation) over direct CLI commands.

When working with infrastructure, follow AWS Well-Architected Framework principles.
