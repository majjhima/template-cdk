import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

interface WebServiceCDNProps {
  readonly domain: string;
  readonly originDomain: string;
  readonly hostedZoneId: string;
  readonly certArn: string;
  readonly originSsl: boolean;
}

export class WebServiceCDNResources extends Construct {
  public distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebServiceCDNProps) {
    super(scope, id);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.domain,
    });

    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', props.certArn);

    const originProtocolPolicy = props.originSsl
      ? cloudfront.OriginProtocolPolicy.HTTPS_ONLY
      : cloudfront.OriginProtocolPolicy.HTTP_ONLY;

    const originPort = props.originSsl ? 443 : 80;

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(props.originDomain, {
          protocolPolicy: originProtocolPolicy,
          httpPort: originPort,
          httpsPort: originPort,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      domainNames: [props.domain],
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: props.domain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
    });
  }
}
