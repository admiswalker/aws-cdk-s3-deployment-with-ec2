import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Stack, StackProps } from 'aws-cdk-lib';

export class AwsCdkS3DeploymentWithEc2Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //---
    // VPC
    const vpc = new ec2.Vpc(this, 'AwsCdkTplStackVPC', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 27,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 27,
        },
      ],
    });

    //---

    // SSM
    const nat_iam_role = new iam.Role(this, 'iam_role_for_nat_ssm', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
      ],
    });

    // EC2 SG
    const ec2_sg = new ec2.SecurityGroup(this, 'Ec2Sg', {
      allowAllOutbound: true,
      securityGroupName: 'EC2 Sev Security Group',
      vpc: vpc,
    });

    // NAT SG
    const nat_sg = new ec2.SecurityGroup(this, 'NatSg', {
      allowAllOutbound: true,
      securityGroupName: 'Nat Sev Security Group',
      vpc: vpc,
    });
    nat_sg.addIngressRule(ec2_sg, ec2.Port.allTraffic(), 'from EC2 SG');

    // NAT Instance
    const nat_machineImageId = ec2.MachineImage.latestAmazonLinux({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      edition: ec2.AmazonLinuxEdition.STANDARD,
      kernel: ec2.AmazonLinuxKernel.KERNEL5_X,
      virtualization: ec2.AmazonLinuxVirt.HVM,
      storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      //cpuType: ec2.AmazonLinuxCpuType.X86_64,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    }).getImage(this).imageId;
    const nat_CfnInstance = new ec2.CfnInstance(this, 'NatInstance', {
      blockDeviceMappings: [{
        deviceName: '/dev/xvda',
        ebs: {
          deleteOnTermination: true,
          encrypted: true,
          volumeSize: 8,
          //volumeType: ec2.EbsDeviceVolumeType.GENERAL_PURPOSE_SSD_GP3, // ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html
          volumeType: ec2.EbsDeviceVolumeType.STANDARD, // ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html
        }
      }],
      imageId: nat_machineImageId,
      //instanceType: 't3a.nano', // 2 vCPU, 0.5 GB (AMD)
      instanceType: 't4g.nano', // 2 vCPU, 0.5 GB (ARM)
      securityGroupIds: [nat_sg.securityGroupId],
      sourceDestCheck: false, // Required by NAT Instance Operation
      subnetId: vpc.publicSubnets[0].subnetId,
      userData: cdk.Fn.base64(fs.readFileSync('./lib/ec2_nat.yaml', 'utf8')),
      tags: [{
        "key": "Name",
        "value": this.constructor.name+"/NatInstance"
      }]
    });
    const nat_instanceId = nat_CfnInstance.ref;

    // add Nat Instance to the Private Subnet 1 Route Table
    const privateSN1_NAT_R = new ec2.CfnRoute(this, "privateSN1-RT-NAT", {
      routeTableId: vpc.privateSubnets[0].routeTable.routeTableId,
      destinationCidrBlock: "0.0.0.0/0",
      instanceId: nat_instanceId,
    });

    // SSM
    const ssm_iam_role = new iam.Role(this, 'iam_role_for_ssm', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // for SSM
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
        // for Parameter Store
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'),
        // for S3 Access from EC2
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
      ],
    });
    vpc.addInterfaceEndpoint('InterfaceEndpoint_ssm', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });
    vpc.addInterfaceEndpoint('InterfaceEndpoint_ec2_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });
    vpc.addInterfaceEndpoint('InterfaceEndpoint_ssm_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });

    // EC2 Instance
    const cloud_config = ec2.UserData.forLinux({shebang: ''})
    const user_data_script = fs.readFileSync('./lib/ec2_user-data.yaml', 'utf8');
    cloud_config.addCommands(user_data_script)
    const multipartUserData = new ec2.MultipartUserData();
    multipartUserData.addPart(ec2.MultipartBody.fromUserData(cloud_config, 'text/cloud-config; charset="utf8"'));
    
    const ec2_instance = new ec2.Instance(this, 'General_purpose_ec2', {
      instanceType: new ec2.InstanceType('t3a.nano'), // 2 vCPU, 0.5 GB
//    machineImage: ec2.MachineImage.genericLinux({'us-west-2': 'ami-XXXXXXXXXXXXXXXXX'}),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: ec2.AmazonLinuxEdition.STANDARD,
        virtualization: ec2.AmazonLinuxVirt.HVM,
        storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      }),
      vpc: vpc,
//      blockDevices: [{
//        deviceName: '/dev/xvda',
//        volume: ec2.BlockDeviceVolume.ebs(8),
//      }],
      vpcSubnets: vpc.selectSubnets({subnetGroupName: 'Private',}),
      //vpcSubnets: vpc.selectSubnets({subnetGroupName: 'AwsCdkTplStack/privateSN1',}),
      role: ssm_iam_role,
      userData: multipartUserData,
      securityGroup: ec2_sg,
    });

    //---
    // S3 deployment

    const deployCodeBucket = new s3.Bucket(this, 'DeploymentCodeBucketToEc2', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new cdk.aws_ssm.StringParameter(this, 'aws_s3_bucket_name', {
      parameterName: '/s3_bucket_name_to_mount_on_ec2/001',
      stringValue: deployCodeBucket.bucketName,
    });
    new s3deploy.BucketDeployment(this, 'DeployCode', {
      sources: [s3deploy.Source.asset('./deploy_src_dir')],
      destinationBucket: deployCodeBucket,
      extract: false,
      destinationKeyPrefix: 'deploy_code', // optional prefix in destination bucket
    });
    
    //---
    // Run command

    const runCommandRole = new iam.Role(this, 'run-command-role', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
    });
    runCommandRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:SendCommand'],
      resources: [
        'arn:aws:ssm:ap-northeast-1:*:document/AWS-RunShellScript',
        'arn:aws:ec2:ap-northeast-1:*:instance/*',
      ],
    }));
    new events.CfnRule(this, 'example-rule', {
      description: 'example-rule',
      name: 'example-rule',
      scheduleExpression: 'cron(*/1 * * * ? *)', // ref: https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/events/ScheduledEvents.html
      targets: [
        {
          arn: `arn:aws:ssm:${props?.env?.region}::document/AWS-RunShellScript`,
          id: '1',
          input: JSON.stringify({
            commands: ["/bin/bash /usr/local/test_hello_py/main.sh"],
            //workingDirecory: ['/home/ec2-user']
          }),
          roleArn: runCommandRole.roleArn,
          runCommandParameters: {
            //runCommandTargets: [{ key: "tag:Name", values: ["AwsCdkS3DeploymentWithEc2Stack/General_purpose_ec2"] }],
            runCommandTargets: [{ key: "InstanceIds", values: [ec2_instance.instanceId] }],
          },
        },
      ],
    });

    //---
  }
}
