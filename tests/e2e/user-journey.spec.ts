/**
 * E2Eテスト - ユーザージャーニーテスト
 * 主要なユーザーシナリオのエンドツーエンドテスト
 */

import { Page, expect, test } from '@playwright/test';

test.describe('ユーザージャーニー - ルーム作成から参加まで', () => {
  test('ホストがルームを作成し、参加者が参加できること', async ({ browser }) => {
    // 2つのページ（ホスト用、参加者用）を作成
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const participantPage = await participantContext.newPage();

    try {
      // ホスト: ホームページにアクセス
      await hostPage.goto('/');
      await expect(hostPage).toHaveTitle(/Commentia/);

      // ホスト: ルーム作成ボタンをクリック
      await hostPage.click('text=ルームを作成');
      await expect(hostPage).toHaveURL(/\/create-room/);

      // ホスト: ルーム作成フォームを入力
      await hostPage.fill('input[name="hostName"]', 'ホストユーザー');
      await hostPage.click('button[type="submit"]');

      // ホスト: ルーム作成完了を待機
      await hostPage.waitForURL(/\/room\/.*/, { timeout: 10000 });

      // ルームコードを取得
      const roomCodeElement = hostPage.locator('[data-testid="room-code"]');
      await expect(roomCodeElement).toBeVisible();
      const roomCode = await roomCodeElement.textContent();

      // QRコードが表示されていることを確認
      const qrCodeElement = hostPage.locator('[data-testid="qr-code"]');
      await expect(qrCodeElement).toBeVisible();

      // 参加者: ホームページにアクセス
      await participantPage.goto('/');

      // 参加者: ルーム参加ボタンをクリック
      await participantPage.click('text=ルームに参加');
      await expect(participantPage).toHaveURL(/\/join-room/);

      // 参加者: ルームコードで参加
      if (roomCode) {
        await participantPage.fill('input[name="userName"]', '参加者ユーザー');
        await participantPage.fill('input[name="roomCode"]', roomCode.trim());
        await participantPage.click('button[type="submit"]');

        // 参加者: ルームページに遷移することを確認
        await participantPage.waitForURL(/\/room\/.*/, { timeout: 10000 });
      }

      // ホスト: 参加者がリストに表示されることを確認
      const participantList = hostPage.locator('[data-testid="participant-list"]');
      await expect(participantList).toContainText('参加者ユーザー');

      // 参加者数が2人になることを確認
      const participantCount = hostPage.locator('[data-testid="participant-count"]');
      await expect(participantCount).toContainText('2');
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });

  test('コメント投稿とリアルタイム同期のテスト', async ({ browser }) => {
    // 2つのページ（ユーザー1、ユーザー2）を作成
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();

    const user1Page = await user1Context.newPage();
    const user2Page = await user2Context.newPage();

    try {
      // ユーザー1: ルーム作成
      await user1Page.goto('/');
      await user1Page.click('text=ルームを作成');
      await user1Page.fill('input[name="hostName"]', 'ユーザー1');
      await user1Page.click('button[type="submit"]');
      await user1Page.waitForURL(/\/room\/.*/, { timeout: 10000 });

      // ルームコードを取得
      const roomCodeElement = user1Page.locator('[data-testid="room-code"]');
      const roomCode = await roomCodeElement.textContent();

      // ユーザー2: ルーム参加
      await user2Page.goto('/');
      await user2Page.click('text=ルームに参加');

      if (roomCode) {
        await user2Page.fill('input[name="userName"]', 'ユーザー2');
        await user2Page.fill('input[name="roomCode"]', roomCode.trim());
        await user2Page.click('button[type="submit"]');
        await user2Page.waitForURL(/\/room\/.*/, { timeout: 10000 });
      }

      // ユーザー1: コメント投稿
      const commentText = 'テストコメント from ユーザー1';
      await user1Page.fill('[data-testid="comment-input"]', commentText);
      await user1Page.click('[data-testid="comment-submit"]');

      // 両方のページでコメントが表示されることを確認
      const user1CommentList = user1Page.locator('[data-testid="comment-list"]');
      const user2CommentList = user2Page.locator('[data-testid="comment-list"]');

      await expect(user1CommentList).toContainText(commentText);
      await expect(user1CommentList).toContainText('ユーザー1');

      await expect(user2CommentList).toContainText(commentText);
      await expect(user2CommentList).toContainText('ユーザー1');

      // ユーザー2: 返信コメント投稿
      const replyText = '返信コメント from ユーザー2';
      await user2Page.fill('[data-testid="comment-input"]', replyText);
      await user2Page.click('[data-testid="comment-submit"]');

      // 両方のページで返信コメントが表示されることを確認
      await expect(user1CommentList).toContainText(replyText);
      await expect(user1CommentList).toContainText('ユーザー2');

      await expect(user2CommentList).toContainText(replyText);
      await expect(user2CommentList).toContainText('ユーザー2');
    } finally {
      await user1Context.close();
      await user2Context.close();
    }
  });

  test('いいね機能のテスト', async ({ browser }) => {
    // 2つのページ（投稿者、いいね者）を作成
    const posterContext = await browser.newContext();
    const likerContext = await browser.newContext();

    const posterPage = await posterContext.newPage();
    const likerPage = await likerContext.newPage();

    try {
      // 投稿者: ルーム作成
      await posterPage.goto('/');
      await posterPage.click('text=ルームを作成');
      await posterPage.fill('input[name="hostName"]', '投稿者');
      await posterPage.click('button[type="submit"]');
      await posterPage.waitForURL(/\/room\/.*/, { timeout: 10000 });

      // ルームコードを取得
      const roomCodeElement = posterPage.locator('[data-testid="room-code"]');
      const roomCode = await roomCodeElement.textContent();

      // いいね者: ルーム参加
      await likerPage.goto('/');
      await likerPage.click('text=ルームに参加');

      if (roomCode) {
        await likerPage.fill('input[name="userName"]', 'いいね者');
        await likerPage.fill('input[name="roomCode"]', roomCode.trim());
        await likerPage.click('button[type="submit"]');
        await likerPage.waitForURL(/\/room\/.*/, { timeout: 10000 });
      }

      // 投稿者: コメント投稿
      const commentText = 'いいねテスト用コメント';
      await posterPage.fill('[data-testid="comment-input"]', commentText);
      await posterPage.click('[data-testid="comment-submit"]');

      // コメントが両方のページに表示されるまで待機
      const posterCommentList = posterPage.locator('[data-testid="comment-list"]');
      const likerCommentList = likerPage.locator('[data-testid="comment-list"]');

      await expect(posterCommentList).toContainText(commentText);
      await expect(likerCommentList).toContainText(commentText);

      // いいね者: いいねボタンをクリック
      const likeButton = likerPage.locator('[data-testid="like-button"]').first();
      await expect(likeButton).toBeVisible();
      await likeButton.click();

      // いいね数が両方のページで更新されることを確認
      const posterLikeCount = posterPage.locator('[data-testid="like-count"]').first();
      const likerLikeCount = likerPage.locator('[data-testid="like-count"]').first();

      await expect(posterLikeCount).toContainText('1');
      await expect(likerLikeCount).toContainText('1');

      // いいねボタンの状態が変わることを確認
      await expect(likeButton).toHaveClass(/liked/);

      // いいね取消
      await likeButton.click();
      await expect(posterLikeCount).toContainText('0');
      await expect(likerLikeCount).toContainText('0');
    } finally {
      await posterContext.close();
      await likerContext.close();
    }
  });
});

test.describe('レスポンシブデザインテスト', () => {
  test('モバイルサイズでの表示テスト', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }, // iPhone X サイズ
    });
    const page = await context.newPage();

    try {
      await page.goto('/');

      // ナビゲーションメニューが適切に表示されること
      const nav = page.locator('nav');
      await expect(nav).toBeVisible();

      // ボタンがタッチに適したサイズであること
      const createRoomButton = page.locator('text=ルームを作成');
      await expect(createRoomButton).toBeVisible();

      const buttonBox = await createRoomButton.boundingBox();
      expect(buttonBox?.height).toBeGreaterThan(44); // 44px 最小タッチターゲット

      // ルーム作成フォームのテスト
      await createRoomButton.click();

      const hostNameInput = page.locator('input[name="hostName"]');
      await expect(hostNameInput).toBeVisible();

      // フォーム要素が画面に収まっていること
      const formBox = await hostNameInput.boundingBox();
      expect(formBox?.x).toBeGreaterThanOrEqual(0);
      expect(formBox?.y).toBeGreaterThanOrEqual(0);
    } finally {
      await context.close();
    }
  });

  test('タブレットサイズでの表示テスト', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 }, // iPad サイズ
    });
    const page = await context.newPage();

    try {
      await page.goto('/');

      // レイアウトが適切に調整されていること
      const main = page.locator('main');
      await expect(main).toBeVisible();

      // サイドバーやグリッドレイアウトの確認
      const createRoomButton = page.locator('text=ルームを作成');
      await createRoomButton.click();

      await page.fill('input[name="hostName"]', 'タブレットユーザー');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/room\/.*/, { timeout: 10000 });

      // コメントセクションとQRコードが横並びで表示されること
      const commentSection = page.locator('[data-testid="comment-section"]');
      const qrSection = page.locator('[data-testid="qr-section"]');

      await expect(commentSection).toBeVisible();
      await expect(qrSection).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe('エラーハンドリングテスト', () => {
  test('ネットワークエラー時の処理テスト', async ({ page }) => {
    // ネットワークを無効にする
    await page.context().setOffline(true);

    await page.goto('/');

    // オフライン状態の表示確認
    const offlineIndicator = page.locator('[data-testid="network-status"]');
    await expect(offlineIndicator).toContainText('オフライン');

    // ネットワークを有効にする
    await page.context().setOffline(false);

    // オンライン状態に戻ることを確認
    await expect(offlineIndicator).toContainText('オンライン');
  });

  test('存在しないルームへのアクセステスト', async ({ page }) => {
    // 存在しないルームIDでアクセス
    await page.goto('/room/non-existent-room-id');

    // エラーメッセージが表示されること
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toContainText('ルームが見つかりません');

    // ホームページに戻るリンクがあること
    const homeLink = page.locator('text=ホームに戻る');
    await expect(homeLink).toBeVisible();
  });

  test('無効なルームコードでの参加テスト', async ({ page }) => {
    await page.goto('/');
    await page.click('text=ルームに参加');

    await page.fill('input[name="userName"]', 'テストユーザー');
    await page.fill('input[name="roomCode"]', '000000'); // 存在しないルームコード
    await page.click('button[type="submit"]');

    // エラーメッセージが表示されること
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toContainText('ルームが見つかりません');
  });
});
