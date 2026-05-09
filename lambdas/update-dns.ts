import { Logger } from '@aws-lambda-powertools/logger';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { Route53Client, ChangeResourceRecordSetsCommand, ChangeAction, RRType } from '@aws-sdk/client-route-53';

interface EC2AutoScalingEvent {
  detailType: string;
  instanceId: string;
}

const logger = new Logger();
const ec2Client = new EC2Client({});
const route53Client = new Route53Client({});

const hostedZoneId = process.env.HOSTED_ZONE_ID;
const originDomain = process.env.ORIGIN_DOMAIN;

export const handler = async (event: EC2AutoScalingEvent) => {
  logger.info('Received ASG launch instance event:', JSON.stringify(event, null, 2));

  try {
    const instanceId = event.instanceId;
    if (instanceId === undefined) {
      throw new Error('EC2 instanceId is undefined!');
    }

    const describeInstancesCommand = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });
    const ec2Response = await ec2Client.send(describeInstancesCommand);
    const publicIpAddress = ec2Response.Reservations?.[0].Instances?.[0].PublicIpAddress;

    if (!publicIpAddress) {
      logger.warn(`No public IP found for instance ${instanceId}.`);
      return;
    }

    const changeRecordSetsCommand = new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              Name: originDomain,
              Type: RRType.A,
              TTL: 60,
              ResourceRecords: [{ Value: publicIpAddress }],
            },
          },
        ],
      },
    });
    await route53Client.send(changeRecordSetsCommand);

    logger.info(`Successfully updated Route 53 record for ${originDomain} to ${publicIpAddress}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('Error updating DNS:', error.message);
      if (error.stack) {
        logger.error('Stack trace:', error.stack);
      }
      throw error;
    } else if (typeof error === 'string') {
      logger.error('Error updating DNS:', error);
    } else {
      logger.error(`Unknown error updating DNS: ${error}`);
    }
    throw new Error(`Error updating DNS: ${error}`, { cause: error });
  }
};
