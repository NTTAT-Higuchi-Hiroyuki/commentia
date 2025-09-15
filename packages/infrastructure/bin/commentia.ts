#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CommentiaApp } from '../lib/commentia-app';

const app = new cdk.App();

new CommentiaApp(app, 'CommentiaApp', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '123456789012', // Default account
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
