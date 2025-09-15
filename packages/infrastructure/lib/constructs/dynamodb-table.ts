import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoDbTableProps {
  tableName: string;
  partitionKey: dynamodb.Attribute;
  sortKey?: dynamodb.Attribute;
  stage: 'dev' | 'staging' | 'prod';
  gsiConfigs?: GlobalSecondaryIndexConfig[];
  timeToLiveAttribute?: string;
}

export interface GlobalSecondaryIndexConfig {
  indexName: string;
  partitionKey: dynamodb.Attribute;
  sortKey?: dynamodb.Attribute;
}

export class DynamoDbTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDbTableProps) {
    super(scope, id);

    // DynamoDB Table
    const tableConfig: dynamodb.TableProps = {
      tableName: props.tableName,
      partitionKey: props.partitionKey,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: props.stage === 'prod',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      ...(props.sortKey && { sortKey: props.sortKey }),
      ...(props.timeToLiveAttribute && { timeToLiveAttribute: props.timeToLiveAttribute }),
    };

    this.table = new dynamodb.Table(this, 'Table', tableConfig);

    // Add Global Secondary Indexes
    if (props.gsiConfigs) {
      for (const gsiConfig of props.gsiConfigs) {
        const gsiConfig_: dynamodb.GlobalSecondaryIndexProps = {
          indexName: gsiConfig.indexName,
          partitionKey: gsiConfig.partitionKey,
          ...(gsiConfig.sortKey && { sortKey: gsiConfig.sortKey }),
        };

        this.table.addGlobalSecondaryIndex(gsiConfig_);
      }
    }

    // CloudWatch Alarms for monitoring
    this.createMonitoringAlarms(props.tableName);
  }

  private createMonitoringAlarms(tableName: string): void {
    // Read Throttled Events Alarm
    new cloudwatch.Alarm(this, 'ReadThrottledEventsAlarm', {
      alarmName: `${tableName}-read-throttled-events`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ReadThrottledEvents',
        dimensionsMap: {
          TableName: tableName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Write Throttled Events Alarm
    new cloudwatch.Alarm(this, 'WriteThrottledEventsAlarm', {
      alarmName: `${tableName}-write-throttled-events`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'WriteThrottledEvents',
        dimensionsMap: {
          TableName: tableName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // System Errors Alarm
    new cloudwatch.Alarm(this, 'SystemErrorsAlarm', {
      alarmName: `${tableName}-system-errors`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'SystemErrors',
        dimensionsMap: {
          TableName: tableName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
