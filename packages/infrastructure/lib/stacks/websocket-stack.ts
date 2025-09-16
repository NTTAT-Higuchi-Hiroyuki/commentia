import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
// import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
// import * as lambda from 'aws-cdk-lib/aws-lambda';
// import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { TablesConfig } from './database-stack';
// import { LambdaFunction } from '../constructs/lambda-function';

export interface WebSocketStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
  tablesConfig: TablesConfig;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketEndpoint: string;
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    // WebSocket API Gateway 設定
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'CommentiaWebSocketApi', {
      apiName: `commentia-websocket-api-${props.stage}`,
      description: `Commentia WebSocket API - ${props.stage}`,
      // ルートの選択キー設定（アクションベースのルーティング用）
      routeSelectionExpression: '$request.body.action',
    });

    // WebSocket API Stage with enhanced settings
    this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: props.stage,
      autoDeploy: true,
      // スロットリング設定
      throttle: {
        rateLimit: props.stage === 'prod' ? 100 : 50, // messages per second per connection
        burstLimit: props.stage === 'prod' ? 200 : 100, // burst capacity
      },
    });

    // カスタムルート設定（Task 3.5でLambda統合を追加）
    this.setupCustomRoutes();

    // 接続管理設定
    this.setupConnectionManagement();

    this.webSocketEndpoint = this.webSocketStage.url;

    // Output
    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: this.webSocketEndpoint,
      description: 'WebSocket API Gateway Endpoint',
      exportName: `commentia-websocket-endpoint-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API Gateway ID',
      exportName: `commentia-websocket-api-id-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'WebSocketConnectionUrl', {
      value: this.webSocketStage.callbackUrl,
      description: 'WebSocket API Callback URL for sending messages to connected clients',
      exportName: `commentia-websocket-callback-url-${props.stage}`,
    });

    // Stage Name Output
    new cdk.CfnOutput(this, 'WebSocketStageName', {
      value: this.webSocketStage.stageName,
      description: 'WebSocket API Stage Name',
      exportName: `commentia-websocket-stage-${props.stage}`,
    });
  }

  /**
   * カスタムルートの設定
   * joinRoom, leaveRoom などのアプリケーション固有のルート
   *
   * 注意: integrationプロパティは必須のため、Task 3.5でLambda関数と統合する際に
   * これらのルートを追加する必要があります。
   */
  private setupCustomRoutes(): void {
    // Task 3.5でLambda統合とともに実装
    // 現時点ではルート定義のプレースホルダーのみ
    // 将来実装予定のルート:
    // - joinRoom: ルーム参加
    // - leaveRoom: ルーム退出
    // - sendComment: コメント送信（オプション）
    // - heartbeat: 接続維持
  }

  /**
   * 接続管理設定
   * 接続の追跡、タイムアウト、クリーンアップなど
   */
  private setupConnectionManagement(): void {
    // 接続管理ポリシー
    // ================
    // 1. 接続タイムアウト:
    //    - WebSocket APIのアイドルタイムアウトは10分（AWS制約）
    //    - アプリケーション層で2時間の最大接続時間を実装
    //
    // 2. ハートビートメカニズム:
    //    - クライアントは5分ごとにheartbeatメッセージを送信
    //    - サーバーは接続の最終アクティビティを更新
    //
    // 3. 接続データ管理:
    //    - DynamoDB Connectionsテーブルで接続情報を管理
    //    - TTL設定により古い接続情報を自動削除
    //
    // 4. 同時接続制限:
    //    - ルームあたり最大100接続
    //    - ユーザーあたり最大5接続（複数デバイス対応）
    //
    // 5. エラーハンドリング:
    //    - 接続エラー時の自動リトライ（exponential backoff）
    //    - 切断時のクリーンアップ処理
    // CloudWatch Metrics（将来的な実装）
    // - 同時接続数
    // - メッセージレート
    // - エラー率
    // - レイテンシー
  }

  /**
   * Lambda統合を設定するためのパブリックメソッド
   * Task 3.5で使用予定
   *
   * @param routeKey ルートキー（$connect, $disconnect, $default, または カスタムルート名）
   * @param handler Lambda関数
   */
  // public addLambdaRoute(routeKey: string, handler: lambda.IFunction): void {
  //   const integration = new apigatewayv2_integrations.WebSocketLambdaIntegration(
  //     `${routeKey}Integration`,
  //     handler
  //   );
  //
  //   if (routeKey === '$connect') {
  //     // 接続時の処理
  //     this.webSocketApi.addRoute('$connect', {
  //       integration,
  //       returnResponse: false,
  //     });
  //   } else if (routeKey === '$disconnect') {
  //     // 切断時の処理
  //     this.webSocketApi.addRoute('$disconnect', {
  //       integration,
  //       returnResponse: false,
  //     });
  //   } else if (routeKey === '$default') {
  //     // デフォルトルート
  //     this.webSocketApi.addRoute('$default', {
  //       integration,
  //       returnResponse: true,
  //     });
  //   } else {
  //     // カスタムルート
  //     this.webSocketApi.addRoute(routeKey, {
  //       integration,
  //       returnResponse: false,
  //     });
  //   }
  //
  //   // Lambda関数に接続管理権限を付与
  //   this.webSocketApi.grantManageConnections(handler);
  // }

  /**
   * WebSocket API の管理用エンドポイントを取得
   * Lambda関数がクライアントにメッセージを送信する際に使用
   */
  public getManagementApiEndpoint(): string {
    return `https://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${this.webSocketStage.stageName}`;
  }

  /**
   * 接続管理用のARNを取得
   * IAMポリシー設定で使用
   */
  public getExecuteArn(): string {
    return this.webSocketApi.arnForExecuteApi('*', '/', '*');
  }
}
