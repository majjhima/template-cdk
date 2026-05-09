import * as asg from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

interface WebServiceServerProps {
  readonly vpc: ec2.Vpc;
  readonly securityGroup: ec2.SecurityGroup;
  readonly autoScalingGroupName: string;
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
}

const dockerRepo = 'https://download.docker.com/linux/centos/docker-ce.repo';
const dockerReleaseVer = '9';
const appDir = '/opt/app';

export class WebServiceServerResources extends Construct {
  public asg: asg.AutoScalingGroup;
  public dataBucket?: s3.IBucket;

  constructor(scope: Construct, id: string, props: WebServiceServerProps) {
    super(scope, id);

    const stackName = cdk.Stack.of(this).stackName;

    const serverRole = new iam.Role(this, 'ServerEc2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      inlinePolicies: {
        RetentionPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ['*'],
              actions: ['logs:PutRetentionPolicy'],
            }),
          ],
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    let s3SyncCommands: ec2.InitCommand[] = [];
    const initConfigs: Record<string, ec2.InitConfig> = {};
    let execStopPost = '';

    if (props.s3Persistence.enabled) {
      if (props.s3Persistence.bucketName) {
        this.dataBucket = s3.Bucket.fromBucketName(this, 'DataBucket', props.s3Persistence.bucketName);
        this.dataBucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      } else {
        this.dataBucket = new s3.Bucket(this, 'DataBucket', {
          bucketName: `${stackName.toLowerCase()}-data-${cdk.Stack.of(this).account}`,
          publicReadAccess: false,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
          autoDeleteObjects: false,
        });
      }

      this.dataBucket.grantReadWrite(serverRole);
      const dataS3Url = `s3://${this.dataBucket.bucketName}`;
      const dataPath = props.s3Persistence.dataPath;

      s3SyncCommands = [
        ec2.InitCommand.shellCommand(`mkdir -p ${dataPath}`, { key: '001 - mkdir data path' }),
        ec2.InitCommand.shellCommand(`aws s3 sync ${dataS3Url}/data/ ${dataPath}/`, {
          key: '002 - s3 sync data down',
        }),
      ];

      execStopPost = `ExecStopPost=aws s3 sync ${dataPath}/ ${dataS3Url}/data/\n`;

      initConfigs['s3BackupTimer'] = new ec2.InitConfig([
        ec2.InitFile.fromString(
          '/etc/systemd/system/app-backup.service',
          [
            '[Unit]',
            'Description=Sync app data to S3',
            '',
            '[Service]',
            'Type=oneshot',
            'User=root',
            `WorkingDirectory=${dataPath}`,
            `ExecCondition=/bin/sh -c '/usr/bin/find ${dataPath} -mmin -${props.backupIntervalMinutes} -print -quit | grep -q .'`,
            `ExecStart=aws s3 sync ${dataPath}/ ${dataS3Url}/data/`,
            '',
          ].join('\n'),
        ),
        ec2.InitFile.fromString(
          '/etc/systemd/system/app-backup.timer',
          [
            '[Unit]',
            `Description=Sync app data to S3 every ${props.backupIntervalMinutes} minutes`,
            '',
            '[Timer]',
            `OnCalendar=*:0/${props.backupIntervalMinutes}`,
            'Persistent=true',
            '',
            '[Install]',
            'WantedBy=multi-user.target',
            '',
          ].join('\n'),
        ),
        ec2.InitCommand.shellCommand('systemctl enable app-backup.timer && systemctl start app-backup.timer', {
          key: '003 - enable backup timer',
        }),
      ]);
    }

    const authorizedKeys = props.additionalSshPublicKeys.join('\n');

    const dockerComposeContent = [
      'services:',
      '  web:',
      `    image: ${props.dockerImage}`,
      '    ports:',
      ...props.dockerPorts.map((p) => `      - "${p}"`),
      '    environment:',
      ...Object.entries(props.environment).map(([k, v]) => `      - ${k}=${v}`),
      '    restart: unless-stopped',
      '',
    ].join('\n');

    const systemdService = [
      '[Unit]',
      'Description=Web Service',
      'After=docker.service',
      '',
      '[Service]',
      'Type=simple',
      'Restart=never',
      'User=root',
      `WorkingDirectory=${appDir}`,
      'ExecStart=/usr/bin/docker compose up',
      'ExecStop=/usr/bin/docker compose down',
      execStopPost,
      'StandardOutput=file:/var/log/web-service.log',
      'StandardError=file:/var/log/web-service.log',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      '',
    ].join('\n');

    initConfigs['cwAgent'] = new ec2.InitConfig([
      ec2.InitPackage.yum('amazon-cloudwatch-agent'),
      ec2.InitFile.fromFileInline(
        '/etc/amazon-cloudwatch-agent.json',
        './lib/resources/server/config/amazon-cloudwatch-agent.json',
      ),
      ec2.InitFile.fromFileInline('/etc/config.sh', './lib/resources/server/config/config.sh'),
      ec2.InitCommand.shellCommand('chmod +x /etc/config.sh', { key: '001 - make config.sh executable' }),
      ec2.InitCommand.shellCommand('/etc/config.sh', { key: '002 - run config.sh' }),
    ]);

    if (authorizedKeys) {
      initConfigs['sshKeys'] = new ec2.InitConfig([
        ec2.InitCommand.shellCommand('mkdir -p /home/ec2-user/.ssh && chmod 700 /home/ec2-user/.ssh', {
          key: '001 - mkdir .ssh',
        }),
        ec2.InitFile.fromString('/home/ec2-user/.ssh/authorized_keys', authorizedKeys, {
          mode: '000600',
          owner: 'ec2-user',
          group: 'ec2-user',
        }),
      ]);
    }

    initConfigs['dockerRepo'] = new ec2.InitConfig([
      ec2.InitCommand.shellCommand(`yum config-manager --add-repo ${dockerRepo}`, { key: '001 - add docker repo' }),
      ec2.InitCommand.shellCommand(`sed -i 's/$releasever/${dockerReleaseVer}/g' /etc/yum.repos.d/docker-ce.repo`, {
        key: '002 - update docker repo',
      }),
    ]);

    initConfigs['dockerInstall'] = new ec2.InitConfig([
      ec2.InitPackage.yum('docker-ce'),
      ec2.InitPackage.yum('docker-ce-cli'),
      ec2.InitPackage.yum('containerd.io'),
      ec2.InitPackage.yum('docker-buildx-plugin'),
      ec2.InitPackage.yum('docker-compose-plugin'),
      ec2.InitService.enable('docker'),
      ec2.InitCommand.shellCommand('usermod -aG docker ec2-user', { key: '001 - add ec2-user to docker group' }),
    ]);

    const appServiceConfig: ec2.InitElement[] = [
      ec2.InitFile.fromString(`${appDir}/docker-compose.yml`, dockerComposeContent),
    ];

    if (Object.keys(props.environment).length > 0) {
      appServiceConfig.push(
        ec2.InitFile.fromString(
          `${appDir}/.env`,
          Object.entries(props.environment)
            .map(([key, value]) => `${key}='${value}'`)
            .join('\n'),
        ),
      );
    }

    appServiceConfig.push(
      ec2.InitFile.fromString('/etc/systemd/system/web-service.service', systemdService),
      ...s3SyncCommands,
      ec2.InitService.enable('web-service'),
    );

    initConfigs['appService'] = new ec2.InitConfig(appServiceConfig);

    const init = ec2.CloudFormationInit.fromConfigSets({
      configSets: {
        default: Object.keys(initConfigs),
      },
      configs: initConfigs,
    });

    const launchTemplate = new ec2.LaunchTemplate(this, 'LaunchTemplate', {
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cachedInContext: false,
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'SSHKeyPair', props.sshKeyPairName),
      securityGroup: props.securityGroup,
      role: serverRole,
      spotOptions: props.spot
        ? {
            interruptionBehavior: ec2.SpotInstanceInterruption.TERMINATE,
            maxPrice: props.maxPrice,
            requestType: ec2.SpotRequestType.ONE_TIME,
          }
        : undefined,
      userData: ec2.UserData.forLinux(),
    });

    this.asg = new asg.AutoScalingGroup(this, 'ASG', {
      autoScalingGroupName: props.autoScalingGroupName,
      vpc: props.vpc,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      launchTemplate,
      init,
      initOptions: {
        includeUrl: true,
        includeRole: true,
        printLog: true,
      },
      signals: asg.Signals.waitForAll({
        timeout: cdk.Duration.minutes(5),
      }),
      ssmSessionPermissions: false,
    });
  }
}
