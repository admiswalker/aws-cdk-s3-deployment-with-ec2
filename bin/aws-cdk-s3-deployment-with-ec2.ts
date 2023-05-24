#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsCdkS3DeploymentWithEc2Stack } from '../lib/aws-cdk-s3-deployment-with-ec2-stack';

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION
}

const app = new cdk.App();
new AwsCdkS3DeploymentWithEc2Stack(app, 'AwsCdkS3DeploymentWithEc2Stack', {
  env: env,
});
