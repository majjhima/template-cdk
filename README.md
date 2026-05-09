# Docker-on-EC2 + CloudFront Web Service Template

A reusable AWS CDK template for deploying a Docker-based web service on a single Spot EC2 instance, fronted by CloudFront with HTTPS and a Route53 custom domain.

## Architecture

```
                                    User
                                     │
                                     ▼
                           ┌─────────────────────┐
                           │    Route 53 Alias   │
                           │    A → CloudFront   │
                           └──────────┬──────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │  CloudFront Dist.   │
                           │  (HTTPS viewer)     │
                           └──────────┬──────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │  origin.example.com │
                           │  (A-record)         │
                           └──────────┬──────────┘
                                      │
                                      ▼
                    ┌────────────────────────────────┐
                    │  EventBridge Rule + Lambda     │
                    │  (updates origin A-record      │
                    │   on EC2 Instance Launch)      │
                    └────────────────────────────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │   Auto Scaling Group│
                           │   (min=1, max=1)    │
                           │   Spot Instance     │
                           └──────────┬──────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │  Amazon Linux 2023  │
                           │  Docker + systemd   │
                           │  CloudWatch Agent   │
                           │  Optional S3 sync   │
                           └─────────────────────┘
```

## Components

| Layer        | AWS Service      | Purpose                                           |
| ------------ | ---------------- | ------------------------------------------------- |
| DNS          | Route53          | Alias `A` record pointing to CloudFront           |
| CDN          | CloudFront       | HTTPS termination, caching, DDoS protection       |
| DNS (origin) | Route53 + Lambda | Dynamic A-record for the origin subdomain         |
| Compute      | EC2 ASG (Spot)   | Single instance running Docker                    |
| Network      | VPC (public)     | No NAT gateway; security group allows 22, 80, 443 |
| Monitoring   | CloudWatch Agent | CPU, memory metrics + log shipping                |
| Storage      | S3 (optional)    | Persistent data synced on boot, stop, and timer   |

## Prerequisites

1. **AWS CLI** configured with credentials.
2. **Route53 Hosted Zone** for your domain (e.g., `example.com`).
3. **ACM Certificate** in `us-east-1` for your domain (or wildcard). Get the ARN.
4. **EC2 Key Pair** created in your target region for SSH access.
5. **Node.js** and **npm** installed.

## Quick Start

1. **Clone and install:**

   ```bash
   npm install
   ```

2. **Edit `lib/resources/config.json`:**
   Fill in your `domain`, `originDomain`, `hostedZoneId`, `certArn`, `sshKeyPairName`, and `dockerImage`.

3. **Build and deploy:**

   ```bash
   npm run release
   npx cdk deploy
   ```

4. **Access your service:**
   Visit `https://<your-domain>`.

## Configuration Reference

| Key                        | Type     | Default     | Description                                                         |
| -------------------------- | -------- | ----------- | ------------------------------------------------------------------- |
| `domain`                   | string   | —           | Main domain served by CloudFront (e.g., `example.com`)              |
| `originDomain`             | string   | —           | Subdomain pointing to the EC2 instance (e.g., `origin.example.com`) |
| `hostedZoneId`             | string   | —           | Route53 Hosted Zone ID                                              |
| `certArn`                  | string   | —           | ACM certificate ARN (must be in `us-east-1`)                        |
| `instanceType`             | string   | `t4g.micro` | EC2 instance type                                                   |
| `maxPrice`                 | number   | `0.005`     | Maximum Spot price                                                  |
| `spot`                     | boolean  | `true`      | Use Spot instances                                                  |
| `sshKeyPairName`           | string   | —           | AWS EC2 Key Pair name                                               |
| `additionalSshPublicKeys`  | string[] | `[]`        | Extra SSH public keys added to `authorized_keys`                    |
| `dockerImage`              | string   | —           | Docker image to run (e.g., `nginx:alpine` or ECR URI)               |
| `dockerPorts`              | string[] | `[]`        | Port mappings (e.g., `["80:80"]`)                                   |
| `environment`              | Record   | `{}`        | Environment variables passed to the container                       |
| `s3Persistence.enabled`    | boolean  | `false`     | Enable S3 data persistence                                          |
| `s3Persistence.bucketName` | string   | `""`        | Existing bucket name (empty = create new)                           |
| `s3Persistence.dataPath`   | string   | `"/data"`   | Local path to sync                                                  |
| `backupIntervalMinutes`    | number   | `5`         | S3 backup timer interval                                            |
| `originSsl`                | boolean  | `false`     | Use HTTPS between CloudFront and EC2                                |

> **Note:** When `originSsl: true`, your container must serve a valid TLS certificate (e.g., via Let's Encrypt or a reverse proxy).

## Cost Control

To stop costs without destroying the stack, set the ASG **Desired Capacity** to `0` in the AWS Console. The stack and DNS records remain; only compute charges stop.

## Extension Points

| Extension                   | How                                                            |
| --------------------------- | -------------------------------------------------------------- |
| **Auto Scaling Group**      | Change `minCapacity`/`maxCapacity` or add a Load Balancer      |
| **ALB**                     | Insert an Application Load Balancer between CloudFront and EC2 |
| **DockerImageAsset**        | Replace `dockerImage` config with CDK `DockerImageAsset` + ECR |
| **WAF**                     | Attach AWS WAF to the CloudFront distribution                  |
| **Lambda@Edge / Functions** | Add edge logic (auth, redirects)                               |
| **RDS / ElastiCache**       | Replace S3 persistence with managed databases                  |
| **Secrets Manager**         | Inject secrets via SSM Parameter Store or Secrets Manager      |
| **Robust S3 Sync**          | Add an ASG Lifecycle Hook for longer shutdown sync windows     |

## Useful Commands

- `npm install` — install dependencies
- `npm run build` — compile TypeScript to `dist/`
- `npm run test` — run Vitest unit tests
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run fmt` / `npm run fmt:check` — Prettier
- `npm run release` — install → fmt:check → lint → build → test
- `npx cdk synth` — synthesize CloudFormation template
- `npx cdk deploy` — deploy the stack
- `npx cdk diff` — compare deployed stack with current state
- `npx cdk destroy` — destroy the stack
