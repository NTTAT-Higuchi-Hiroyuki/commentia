import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
  apiEndpoint: string;
  webSocketEndpoint: string;
  customDomainName?: string;
  certificateArn?: string;
  enableCloudFrontLogging?: boolean;
}

export class FrontendStack extends cdk.Stack {
  public readonly distributionDomainName: string;
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly logsBucket?: s3.Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // CloudFrontログ用S3バケット（本番環境またはログ有効時）
    if (props.enableCloudFrontLogging || props.stage === 'prod') {
      this.logsBucket = new s3.Bucket(this, 'CloudFrontLogsBucket', {
        bucketName: `commentia-cloudfront-logs-${props.stage}-${this.account}`,
        publicReadAccess: false,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        lifecycleRules: [
          {
            id: 'LogsRetention',
            enabled: true,
            expiration: cdk.Duration.days(props.stage === 'prod' ? 90 : 30),
            transitions: [
              {
                storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                transitionAfter: cdk.Duration.days(30),
              },
              {
                storageClass: s3.StorageClass.GLACIER,
                transitionAfter: cdk.Duration.days(60),
              },
            ],
          },
        ],
        removalPolicy:
          props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: props.stage !== 'prod',
      });
    }

    // S3 Bucket for static website hosting with enhanced security
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `commentia-frontend-${props.stage}-${this.account}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: props.stage === 'prod',
      encryption:
        props.stage === 'prod' ? s3.BucketEncryption.S3_MANAGED : s3.BucketEncryption.UNENCRYPTED,
      enforceSSL: true,
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.stage !== 'prod',
      lifecycleRules:
        props.stage === 'prod'
          ? [
              {
                id: 'OldVersionsCleanup',
                enabled: true,
                noncurrentVersionExpiration: cdk.Duration.days(30),
              },
            ]
          : undefined,
    });

    // Origin Access Control (OAC) - 新しいセキュリティ機能
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OriginAccessControl', {
      description: `OAC for Commentia Frontend - ${props.stage}`,
    });

    // S3バケットポリシーでOACからのアクセスを許可
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipal',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
          },
        },
      })
    );

    // Response Headers Policy for Security
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `commentia-security-headers-${props.stage}`,
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(31536000),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            `connect-src 'self' ${this.extractDomainFromUrl(props.apiEndpoint)} ${this.extractDomainFromUrl(props.webSocketEndpoint)}`,
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
          override: true,
        },
      },
      customHeadersBehavior: {
        'X-App-Version': {
          header: process.env.npm_package_version || '1.0.0',
          override: true,
        },
        'X-Environment': { header: props.stage, override: true },
      },
    });

    // Cache Policy for API requests
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'ApiCachePolicy', {
      cachePolicyName: `commentia-api-cache-${props.stage}`,
      comment: 'Cache policy for API requests',
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.minutes(1),
      minTtl: cdk.Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'Authorization',
        'Content-Type',
        'X-Requested-With'
      ),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
    });

    // CloudFront Distribution with enhanced security
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: `Commentia Frontend Distribution - ${props.stage}`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: origins.HttpOrigin.withCustomHeaders(
            this.extractDomainFromUrl(props.apiEndpoint),
            {
              'X-Forwarded-Host': '{host}',
            }
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
          responseHeadersPolicy,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 500,
          responseHttpStatus: 500,
          responsePagePath: '/error.html',
          ttl: cdk.Duration.minutes(1),
        },
      ],
      priceClass: this.getPriceClass(props.stage),
      enableIpv6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableLogging: !!this.logsBucket,
      logBucket: this.logsBucket,
      logFilePrefix: 'cloudfront-logs/',
      logIncludesCookies: false,

      // セキュリティ設定
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,

      // WAF設定（本番環境のみ）
      ...(props.stage === 'prod' &&
        {
          // webAclId: webAclArn, // WAF WebACL ARN (別途作成が必要)
        }),

      // カスタムドメイン設定
      ...(props.customDomainName &&
        props.certificateArn && {
          domainNames: [props.customDomainName],
          certificate: cdk.aws_certificatemanager.Certificate.fromCertificateArn(
            this,
            'Certificate',
            props.certificateArn
          ),
        }),
    });

    this.distributionDomainName = props.customDomainName
      ? `https://${props.customDomainName}`
      : `https://${this.distribution.distributionDomainName}`;

    // Environment Configuration File Generation
    this.createEnvironmentConfig(props);

    // タグ付け
    cdk.Tags.of(this.bucket).add('Stage', props.stage);
    cdk.Tags.of(this.bucket).add('Project', 'Commentia');
    cdk.Tags.of(this.bucket).add('Component', 'Frontend');
    cdk.Tags.of(this.distribution).add('Stage', props.stage);
    cdk.Tags.of(this.distribution).add('Project', 'Commentia');
    cdk.Tags.of(this.distribution).add('Component', 'CDN');

    // Outputs
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: this.distributionDomainName,
      description: 'Frontend URL',
      exportName: `commentia-frontend-url-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Frontend S3 Bucket Name',
      exportName: `commentia-frontend-bucket-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `commentia-distribution-id-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `commentia-distribution-domain-${props.stage}`,
    });

    if (this.logsBucket) {
      new cdk.CfnOutput(this, 'LogsBucketName', {
        value: this.logsBucket.bucketName,
        description: 'CloudFront Logs Bucket Name',
        exportName: `commentia-logs-bucket-${props.stage}`,
      });
    }
  }

  private getPriceClass(stage: string): cloudfront.PriceClass {
    switch (stage) {
      case 'prod':
        return cloudfront.PriceClass.PRICE_CLASS_ALL;
      case 'staging':
        return cloudfront.PriceClass.PRICE_CLASS_200;
      default:
        return cloudfront.PriceClass.PRICE_CLASS_100;
    }
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

  /**
   * フロントエンド用の環境設定ファイルを生成
   */
  private createEnvironmentConfig(props: FrontendStackProps): void {
    const _envConfig = {
      VITE_API_ENDPOINT: props.apiEndpoint,
      VITE_WEBSOCKET_ENDPOINT: props.webSocketEndpoint,
      VITE_STAGE: props.stage,
      VITE_APP_VERSION: process.env.npm_package_version || '1.0.0',
      VITE_ENABLE_ANALYTICS: props.stage === 'prod' ? 'true' : 'false',
      VITE_ENABLE_ERROR_REPORTING: props.stage !== 'dev' ? 'true' : 'false',
    };

    // 環境設定ファイルをS3にデプロイ（将来の実装）
    // new s3deploy.BucketDeployment(this, 'EnvConfig', {
    //   sources: [
    //     s3deploy.Source.jsonData('config.json', envConfig),
    //   ],
    //   destinationBucket: this.bucket,
    //   destinationKeyPrefix: 'config/',
    //   distribution: this.distribution,
    //   distributionPaths: ['/config/*'],
    // });
  }

  /**
   * フロントエンドアプリケーションのデプロイ
   * ビルドされたフロントエンドアセットをS3にデプロイ
   */
  public deployFrontendAssets(sourcePath: string): void {
    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset(sourcePath)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: true, // 古いファイルを削除
      retainOnDelete: false,
      memoryLimit: 512,
      ephemeralStorageSize: cdk.Size.gibibytes(2),
    });
  }

  /**
   * CloudFront invalidation for cache busting
   */
  public createInvalidation(paths: string[] = ['/*']): void {
    new s3deploy.BucketDeployment(this, 'CacheInvalidation', {
      sources: [s3deploy.Source.data('invalidation.txt', 'cache invalidation')],
      destinationBucket: this.bucket,
      destinationKeyPrefix: '.cache/',
      distribution: this.distribution,
      distributionPaths: paths,
    });
  }
}
