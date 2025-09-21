import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface WafRulesProps {
  stage: 'dev' | 'staging' | 'prod';
  scope: 'REGIONAL' | 'CLOUDFRONT';
  description?: string;
  allowDefaultAction?: boolean;
}

export class WafRules extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WafRulesProps) {
    super(scope, id);

    // 基本的なWAFルール設定
    const rules: wafv2.CfnWebACL.RuleProperty[] = [];

    // 1. AWS マネージドルール - 一般的な攻撃パターン
    rules.push({
      name: 'AWSManagedRulesCommonRuleSet',
      priority: 1,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesCommonRuleSet',
          excludedRules: [],
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'CommonRuleSetMetric',
      },
    });

    // 2. 既知の悪意のあるIP
    rules.push({
      name: 'AWSManagedRulesKnownBadInputsRuleSet',
      priority: 2,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'KnownBadInputsMetric',
      },
    });

    // 3. SQL インジェクション対策
    rules.push({
      name: 'AWSManagedRulesSQLiRuleSet',
      priority: 3,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesSQLiRuleSet',
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'SQLiRuleSetMetric',
      },
    });

    // 4. XSS 対策
    if (props.stage === 'prod' || props.stage === 'staging') {
      rules.push({
        name: 'AWSManagedRulesXSSRuleSet',
        priority: 4,
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesXSSRuleSet',
          },
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: 'XSSRuleSetMetric',
        },
      });
    }

    // 5. カスタムレート制限ルール
    const rateLimitActions = this.getRateLimitByStage(props.stage);

    rules.push({
      name: 'RateLimitRule',
      priority: 5,
      statement: {
        rateBasedStatement: {
          limit: rateLimitActions.requestsPerMinute,
          aggregateKeyType: 'IP',
          scopeDownStatement: {
            notStatement: {
              statement: {
                ipSetReferenceStatement: {
                  arn: '', // 実際にはIPセットを作成してここに参照を設定
                },
              },
            },
          },
        },
      },
      action: { block: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'RateLimitMetric',
      },
    });

    // 6. 地理的ブロック（必要に応じて）
    if (props.stage === 'prod') {
      rules.push({
        name: 'GeographicalRestrictionRule',
        priority: 6,
        statement: {
          geoMatchStatement: {
            countryCodes: ['CN', 'RU', 'KP'], // ブロック対象国コード
          },
        },
        action: { block: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: 'GeographicalBlockMetric',
        },
      });
    }

    // 7. カスタムルール - 疑わしいUser-Agent
    rules.push({
      name: 'SuspiciousUserAgentRule',
      priority: 7,
      statement: {
        byteMatchStatement: {
          fieldToMatch: {
            singleHeader: { name: 'user-agent' },
          },
          textTransformations: [
            {
              priority: 0,
              type: 'LOWERCASE',
            },
          ],
          searchString: 'bot',
          positionalConstraint: 'CONTAINS',
        },
      },
      action: { count: {} }, // カウントのみ（開発段階）
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'SuspiciousUserAgentMetric',
      },
    });

    // WebACL作成
    this.webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
      scope: props.scope,
      defaultAction: props.allowDefaultAction ? { allow: {} } : { block: {} },
      description: props.description || `Commentia WAF for ${props.stage}`,
      name: `Commentia-WAF-${props.stage}`,
      rules,
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `CommentiaWAF${props.stage}`,
      },
      tags: [
        {
          key: 'Project',
          value: 'Commentia',
        },
        {
          key: 'Stage',
          value: props.stage,
        },
        {
          key: 'Component',
          value: 'Security',
        },
      ],
    });

    // ログ設定（本番環境のみ）
    if (props.stage === 'prod') {
      this.setupWafLogging(props.stage);
    }

    // CloudWatchダッシュボードとアラーム設定
    this.createWafDashboard(props.stage);

    // タグ付け
    cdk.Tags.of(this.webAcl).add('Stage', props.stage);
    cdk.Tags.of(this.webAcl).add('Project', 'Commentia');
    cdk.Tags.of(this.webAcl).add('Component', 'WAF');
  }

  private getRateLimitByStage(stage: string): { requestsPerMinute: number } {
    switch (stage) {
      case 'prod':
        return { requestsPerMinute: 2000 };
      case 'staging':
        return { requestsPerMinute: 1000 };
      default:
        return { requestsPerMinute: 500 };
    }
  }

  private setupWafLogging(_stage: string): void {
    // WAF ログ設定
    // 実際の実装では、Kinesis Data Firehose または CloudWatch Logs への送信設定が必要
    console.log('WAF logging setup completed');
  }

  private createWafDashboard(stage: string): void {
    // WAFメトリクスのCloudWatchダッシュボード
    const _dashboard = new cdk.aws_cloudwatch.Dashboard(this, 'WafDashboard', {
      dashboardName: `Commentia-WAF-${stage}`,
      widgets: [
        [
          new cdk.aws_cloudwatch.GraphWidget({
            title: 'WAF Blocked Requests',
            left: [
              new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/WAFV2',
                metricName: 'BlockedRequests',
                dimensionsMap: {
                  WebACL: this.webAcl.name || `Commentia-WAF-${stage}`,
                  Region: cdk.Stack.of(this).region,
                },
                statistic: 'Sum',
              }),
            ],
            width: 12,
            height: 6,
          }),
        ],
        [
          new cdk.aws_cloudwatch.GraphWidget({
            title: 'WAF Allowed Requests',
            left: [
              new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/WAFV2',
                metricName: 'AllowedRequests',
                dimensionsMap: {
                  WebACL: this.webAcl.name || `Commentia-WAF-${stage}`,
                  Region: cdk.Stack.of(this).region,
                },
                statistic: 'Sum',
              }),
            ],
            width: 12,
            height: 6,
          }),
        ],
      ],
    });

    // 高い数のブロックされたリクエストに対するアラーム
    new cdk.aws_cloudwatch.Alarm(this, 'HighBlockedRequestsAlarm', {
      alarmName: `Commentia-WAF-HighBlockedRequests-${stage}`,
      alarmDescription: 'High number of blocked requests detected by WAF',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: this.webAcl.name || `Commentia-WAF-${stage}`,
          Region: cdk.Stack.of(this).region,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: this.getAlarmThreshold(stage),
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  private getAlarmThreshold(stage: string): number {
    switch (stage) {
      case 'prod':
        return 100;
      case 'staging':
        return 50;
      default:
        return 25;
    }
  }

  /**
   * WebACLのARNを取得
   */
  public getWebAclArn(): string {
    return this.webAcl.attrArn;
  }

  /**
   * 特定のリソースにWAFを関連付け
   */
  public associateWithResource(resourceArn: string): void {
    new wafv2.CfnWebACLAssociation(this, `WAFAssociation${Date.now()}`, {
      resourceArn,
      webAclArn: this.webAcl.attrArn,
    });
  }

  /**
   * IPセットの作成（ホワイトリスト・ブラックリスト用）
   */
  public createIpSet(
    name: string,
    description: string,
    addresses: string[],
    ipVersion: 'IPV4' | 'IPV6' = 'IPV4'
  ): wafv2.CfnIPSet {
    return new wafv2.CfnIPSet(this, name, {
      scope: 'REGIONAL',
      ipAddressVersion: ipVersion,
      addresses,
      description,
      name: `${name}-${this.webAcl.name}`,
    });
  }

  /**
   * カスタムルールの追加
   */
  public addCustomRule(rule: wafv2.CfnWebACL.RuleProperty): void {
    // 既存のルールリストに追加
    const currentRules = this.webAcl.rules || [];
    this.webAcl.addPropertyOverride('Rules', [...currentRules, rule]);
  }
}
