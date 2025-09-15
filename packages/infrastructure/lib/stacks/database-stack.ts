import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
}

export interface TablesConfig {
  roomsTable: dynamodb.Table;
  commentsTable: dynamodb.Table;
  connectionsTable: dynamodb.Table;
  likesTable: dynamodb.Table;
}

export class DatabaseStack extends cdk.Stack {
  public readonly tablesConfig: TablesConfig;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Rooms Table
    const roomsTable = new dynamodb.Table(this, 'RoomsTable', {
      tableName: `commentia-rooms-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: props.stage === 'prod',
    });

    // Comments Table with GSI for like count sorting
    const commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      tableName: `commentia-comments-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: props.stage === 'prod',
    });

    // GSI for like count based sorting
    commentsTable.addGlobalSecondaryIndex({
      indexName: 'LikeCountIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    // Connections Table with GSI for room-based queries
    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: `commentia-connections-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: props.stage === 'prod',
    });

    // GSI for room connections
    connectionsTable.addGlobalSecondaryIndex({
      indexName: 'RoomConnectionsIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    // Likes Table with GSI for user likes tracking
    const likesTable = new dynamodb.Table(this, 'LikesTable', {
      tableName: `commentia-likes-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: props.stage === 'prod',
    });

    // GSI for user likes per room
    likesTable.addGlobalSecondaryIndex({
      indexName: 'UserLikesIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    this.tablesConfig = {
      roomsTable,
      commentsTable,
      connectionsTable,
      likesTable,
    };

    // Outputs
    new cdk.CfnOutput(this, 'RoomsTableName', {
      value: roomsTable.tableName,
      description: 'Rooms DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'CommentsTableName', {
      value: commentsTable.tableName,
      description: 'Comments DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: connectionsTable.tableName,
      description: 'Connections DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'LikesTableName', {
      value: likesTable.tableName,
      description: 'Likes DynamoDB Table Name',
    });
  }
}
