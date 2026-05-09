import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class WebServiceVPCResources extends Construct {
  public vpc: ec2.Vpc;
  public securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'WebServiceVPC', {
      natGateways: 0,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'ServerPublic',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true,
        },
      ],
      maxAzs: 2,
    });

    this.securityGroup = new ec2.SecurityGroup(this, 'WebServiceSecurityGroup', {
      vpc: this.vpc,
      description: 'Security Group for Web Service',
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');
    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
  }
}
