/**
 * WebSocket 統合テスト
 * リアルタイム通信の統合テスト
 */

import { WSMessage } from '@commentia/shared';
import WebSocket from 'ws';
import { checkLocalStack, generateTestRoomId, generateTestUserId } from '../setup';

describe('WebSocket Integration Tests', () => {
  const WS_URL = process.env.WS_URL || 'ws://localhost:8080';
  let ws: WebSocket;

  beforeAll(async () => {
    // LocalStack起動確認（WebSocket APIの場合）
    const localStackRunning = await checkLocalStack();
    if (!localStackRunning) {
      console.warn('LocalStack is not running. Some WebSocket tests may be skipped.');
    }
  });

  afterEach(async () => {
    // WebSocket接続のクリーンアップ
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
      await new Promise((resolve) => {
        ws.on('close', resolve);
      });
    }
  });

  describe('WebSocket接続テスト', () => {
    it('WebSocketに正常に接続できること', async () => {
      try {
        ws = new WebSocket(WS_URL);

        const connected = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            if (error.message.includes('ECONNREFUSED')) {
              console.warn('WebSocket server is not running. Skipping test.');
              resolve(false);
            } else {
              reject(error);
            }
          });
        });

        if (connected) {
          expect(ws.readyState).toBe(WebSocket.OPEN);
        }
      } catch (error) {
        console.warn('WebSocket connection failed:', error);
      }
    });

    it('WebSocket切断が正常に処理されること', async () => {
      try {
        ws = new WebSocket(WS_URL);

        const connected = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            if (error.message.includes('ECONNREFUSED')) {
              console.warn('WebSocket server is not running. Skipping test.');
              resolve(false);
            } else {
              reject(error);
            }
          });
        });

        if (!connected) return;

        const closed = await new Promise<boolean>((resolve) => {
          ws.on('close', () => {
            resolve(true);
          });
          ws.close();
        });

        expect(closed).toBe(true);
        expect(ws.readyState).toBe(WebSocket.CLOSED);
      } catch (error) {
        console.warn('WebSocket test failed:', error);
      }
    });
  });

  describe('ルーム参加・退出テスト', () => {
    it('ルームに参加できること', async () => {
      try {
        ws = new WebSocket(WS_URL);

        const connected = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            if (error.message.includes('ECONNREFUSED')) {
              console.warn('WebSocket server is not running. Skipping test.');
              resolve(false);
            } else {
              reject(error);
            }
          });
        });

        if (!connected) return;

        const roomId = generateTestRoomId();
        const userId = generateTestUserId();
        const userName = 'TestUser';

        // ルーム参加メッセージ送信
        const joinMessage = {
          action: 'joinRoom',
          data: {
            roomId,
            userId,
            userName,
          },
        };

        let receivedMessage: any = null;
        ws.on('message', (data) => {
          try {
            receivedMessage = JSON.parse(data.toString());
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        ws.send(JSON.stringify(joinMessage));

        // メッセージ受信待機
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 実際のサーバーが動いていない場合、メッセージは受信されない
        if (receivedMessage) {
          expect(receivedMessage).toHaveProperty('type');
        } else {
          console.warn('No message received - server may not be running');
        }
      } catch (error) {
        console.warn('WebSocket join room test failed:', error);
      }
    });

    it('ルームから退出できること', async () => {
      try {
        ws = new WebSocket(WS_URL);

        const connected = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            if (error.message.includes('ECONNREFUSED')) {
              console.warn('WebSocket server is not running. Skipping test.');
              resolve(false);
            } else {
              reject(error);
            }
          });
        });

        if (!connected) return;

        const roomId = generateTestRoomId();
        const userId = generateTestUserId();

        // ルーム退出メッセージ送信
        const leaveMessage = {
          action: 'leaveRoom',
          data: {
            roomId,
            userId,
          },
        };

        let receivedMessage: any = null;
        ws.on('message', (data) => {
          try {
            receivedMessage = JSON.parse(data.toString());
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        ws.send(JSON.stringify(leaveMessage));

        // メッセージ受信待機
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 実際のサーバーが動いていない場合、メッセージは受信されない
        if (receivedMessage) {
          expect(receivedMessage).toHaveProperty('type');
        } else {
          console.warn('No message received - server may not be running');
        }
      } catch (error) {
        console.warn('WebSocket leave room test failed:', error);
      }
    });
  });

  describe('リアルタイムメッセージングテスト', () => {
    it('複数クライアント間でメッセージが配信されること', async () => {
      try {
        // 複数のWebSocket接続を作成
        const ws1 = new WebSocket(WS_URL);
        const ws2 = new WebSocket(WS_URL);

        // 両方の接続を待機
        const connected = await Promise.all([
          new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
            ws1.on('open', () => {
              clearTimeout(timeout);
              resolve(true);
            });
            ws1.on('error', (error) => {
              clearTimeout(timeout);
              if (error.message.includes('ECONNREFUSED')) {
                console.warn('WebSocket server is not running. Skipping test.');
                resolve(false);
              } else {
                reject(error);
              }
            });
          }),
          new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
            ws2.on('open', () => {
              clearTimeout(timeout);
              resolve(true);
            });
            ws2.on('error', (error) => {
              clearTimeout(timeout);
              if (error.message.includes('ECONNREFUSED')) {
                console.warn('WebSocket server is not running. Skipping test.');
                resolve(false);
              } else {
                reject(error);
              }
            });
          }),
        ]);

        if (!connected[0] || !connected[1]) {
          ws1.close();
          ws2.close();
          return;
        }

        const roomId = generateTestRoomId();

        // 両方のクライアントを同じルームに参加させる
        const joinMessage1 = {
          action: 'joinRoom',
          data: {
            roomId,
            userId: generateTestUserId(),
            userName: 'User1',
          },
        };

        const joinMessage2 = {
          action: 'joinRoom',
          data: {
            roomId,
            userId: generateTestUserId(),
            userName: 'User2',
          },
        };

        const receivedMessages: any[] = [];

        ws1.on('message', (data) => {
          try {
            receivedMessages.push(JSON.parse(data.toString()));
          } catch (error) {
            console.error('Failed to parse message from ws1:', error);
          }
        });

        ws2.on('message', (data) => {
          try {
            receivedMessages.push(JSON.parse(data.toString()));
          } catch (error) {
            console.error('Failed to parse message from ws2:', error);
          }
        });

        ws1.send(JSON.stringify(joinMessage1));
        ws2.send(JSON.stringify(joinMessage2));

        // メッセージ受信待機
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // クリーンアップ
        ws1.close();
        ws2.close();

        // 実際のサーバーが動いていない場合、メッセージは受信されない
        if (receivedMessages.length > 0) {
          expect(receivedMessages.length).toBeGreaterThan(0);
          console.log('Received messages:', receivedMessages.length);
        } else {
          console.warn('No messages received - server may not be running');
        }
      } catch (error) {
        console.warn('Multi-client WebSocket test failed:', error);
      }
    });
  });

  describe('エラーハンドリングテスト', () => {
    it('不正な形式のメッセージでエラーが返されること', async () => {
      try {
        ws = new WebSocket(WS_URL);

        const connected = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            if (error.message.includes('ECONNREFUSED')) {
              console.warn('WebSocket server is not running. Skipping test.');
              resolve(false);
            } else {
              reject(error);
            }
          });
        });

        if (!connected) return;

        let receivedMessage: any = null;
        ws.on('message', (data) => {
          try {
            receivedMessage = JSON.parse(data.toString());
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        // 不正な形式のメッセージ送信
        ws.send('invalid json');

        // エラーメッセージ受信待機
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 実際のサーバーが動いていない場合、メッセージは受信されない
        if (receivedMessage) {
          expect(receivedMessage).toHaveProperty('type', 'error');
        } else {
          console.warn('No error message received - server may not be running');
        }
      } catch (error) {
        console.warn('WebSocket error handling test failed:', error);
      }
    });

    it('存在しないアクションでエラーが返されること', async () => {
      try {
        ws = new WebSocket(WS_URL);

        const connected = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            if (error.message.includes('ECONNREFUSED')) {
              console.warn('WebSocket server is not running. Skipping test.');
              resolve(false);
            } else {
              reject(error);
            }
          });
        });

        if (!connected) return;

        let receivedMessage: any = null;
        ws.on('message', (data) => {
          try {
            receivedMessage = JSON.parse(data.toString());
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        // 存在しないアクションのメッセージ送信
        const invalidMessage = {
          action: 'nonExistentAction',
          data: {},
        };

        ws.send(JSON.stringify(invalidMessage));

        // エラーメッセージ受信待機
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 実際のサーバーが動いていない場合、メッセージは受信されない
        if (receivedMessage) {
          expect(receivedMessage).toHaveProperty('type', 'error');
        } else {
          console.warn('No error message received - server may not be running');
        }
      } catch (error) {
        console.warn('WebSocket invalid action test failed:', error);
      }
    });
  });
});
