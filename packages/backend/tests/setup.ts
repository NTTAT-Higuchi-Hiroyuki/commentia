// テスト用の環境変数をモジュール読み込み時に設定
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.ROOMS_TABLE_NAME = 'commentia-test-rooms';
process.env.COMMENTS_TABLE_NAME = 'commentia-test-comments';
process.env.LIKES_TABLE_NAME = 'commentia-test-likes';
process.env.CONNECTIONS_TABLE_NAME = 'commentia-test-connections';
process.env.FRONTEND_URL = 'https://test-commentia.com';
process.env.NODE_ENV = 'test';
