import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
  apiEndpoint: string;
  webSocketEndpoint: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly distributionDomainName: string;
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 Bucket for static website hosting
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `commentia-frontend-${props.stage}-${this.account}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.stage !== 'prod',
    });

    // Origin Access Identity for CloudFront
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
      comment: `OAI for Commentia Frontend - ${props.stage}`,
    });

    // Grant CloudFront access to S3 bucket
    this.bucket.grantRead(originAccessIdentity);

    // CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(this.extractDomainFromUrl(props.apiEndpoint), {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
      priceClass:
        props.stage === 'prod'
          ? cloudfront.PriceClass.PRICE_CLASS_ALL
          : cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.distributionDomainName = `https://${this.distribution.distributionDomainName}`;

    // Deployment (will be used later when frontend is built)
    // new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
    //   sources: [s3deploy.Source.asset('../frontend/dist')],
    //   destinationBucket: this.bucket,
    //   distribution: this.distribution,
    //   distributionPaths: ['/*'],
    // });

    // Outputs
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: this.distributionDomainName,
      description: 'Frontend CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Frontend S3 Bucket Name',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });
  }

  private extractDomainFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      // Fallback: remove protocol and trailing slash
      return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  }
}
