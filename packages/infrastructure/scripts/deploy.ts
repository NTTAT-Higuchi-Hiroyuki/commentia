#!/usr/bin/env node

/**
 * Commentia デプロイメントスクリプト
 *
 * 使用法:
 * npm run deploy -- --stage dev
 * npm run deploy -- --stage staging --domain commentia-staging.example.com
 * npm run deploy -- --stage prod --domain commentia.example.com --cert-arn arn:aws:acm:...
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface DeploymentConfig {
  stage: 'dev' | 'staging' | 'prod';
  region?: string;
  account?: string;
  customDomainName?: string;
  certificateArn?: string;
  enableEncryption?: boolean;
  enableDeletionProtection?: boolean;
  enableCloudFrontLogging?: boolean;
  dryRun?: boolean;
  stacksToDeploy?: string[];
}

class CommentiaDeployer {
  private config: DeploymentConfig;

  constructor(config: DeploymentConfig) {
    this.config = config;
  }

  async deploy(): Promise<void> {
    console.log('🚀 Starting Commentia deployment...');
    console.log('📋 Configuration:', {
      stage: this.config.stage,
      region: this.config.region || process.env.CDK_DEFAULT_REGION || 'us-east-1',
      account: this.config.account || process.env.CDK_DEFAULT_ACCOUNT || 'unknown',
      customDomainName: this.config.customDomainName || 'none',
      enableEncryption: this.config.enableEncryption ?? this.config.stage !== 'dev',
      dryRun: this.config.dryRun || false,
    });

    try {
      // 1. 前提条件チェック
      await this.validatePrerequisites();

      // 2. ビルド
      await this.buildProject();

      // 3. CDK Bootstrap（初回のみ）
      if (this.config.stage === 'prod') {
        await this.bootstrapCdk();
      }

      // 4. デプロイメント実行
      if (this.config.dryRun) {
        console.log('🔍 Dry run mode - showing diff only');
        await this.showDiff();
      } else {
        await this.executeDeployment();
      }

      // 5. デプロイメント後検証
      if (!this.config.dryRun) {
        await this.postDeploymentValidation();
      }

      console.log('✅ Deployment completed successfully!');
    } catch (error) {
      console.error('❌ Deployment failed:', error);
      process.exit(1);
    }
  }

  private async validatePrerequisites(): Promise<void> {
    console.log('🔍 Validating prerequisites...');

    // AWS CLI の確認
    try {
      await execAsync('aws --version');
    } catch {
      throw new Error('AWS CLI is not installed or not in PATH');
    }

    // AWS認証情報の確認
    try {
      await execAsync('aws sts get-caller-identity');
    } catch {
      throw new Error('AWS credentials are not configured');
    }

    // CDK CLI の確認
    try {
      await execAsync('npx cdk --version');
    } catch {
      throw new Error('AWS CDK is not installed');
    }

    // Node.js バージョンの確認
    const nodeVersion = process.version;
    const majorVersion = Number.parseInt(nodeVersion.slice(1));
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, current version: ${nodeVersion}`);
    }

    console.log('✅ Prerequisites validated');
  }

  private async buildProject(): Promise<void> {
    console.log('🔨 Building project...');

    try {
      await execAsync('npm run build', { cwd: process.cwd() });
      console.log('✅ Project built successfully');
    } catch (error) {
      throw new Error(`Build failed: ${error}`);
    }
  }

  private async bootstrapCdk(): Promise<void> {
    console.log('🏗️ Bootstrapping CDK...');

    const region = this.config.region || process.env.CDK_DEFAULT_REGION || 'us-east-1';
    const account = this.config.account || process.env.CDK_DEFAULT_ACCOUNT;

    if (!account) {
      throw new Error('Account ID is required for bootstrapping');
    }

    try {
      await execAsync(`npx cdk bootstrap aws://${account}/${region}`, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STAGE: this.config.stage,
        },
      });
      console.log('✅ CDK bootstrapped successfully');
    } catch (_error) {
      // Bootstrap エラーは既存環境では無視
      console.log('⚠️ Bootstrap may have already been run');
    }
  }

  private async showDiff(): Promise<void> {
    console.log('📊 Showing deployment diff...');

    try {
      const { stdout } = await execAsync('npx cdk diff', {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STAGE: this.config.stage,
          CUSTOM_DOMAIN_NAME: this.config.customDomainName || '',
          CERTIFICATE_ARN: this.config.certificateArn || '',
        },
      });
      console.log(stdout);
    } catch (_error) {
      console.log('No changes detected or diff command failed');
    }
  }

  private async executeDeployment(): Promise<void> {
    console.log('🚀 Executing deployment...');

    const deploymentOrder = this.getDeploymentOrder();

    for (const stackPattern of deploymentOrder) {
      console.log(`📦 Deploying ${stackPattern}...`);

      try {
        const command = this.buildDeployCommand(stackPattern);
        await execAsync(command, {
          cwd: process.cwd(),
          env: {
            ...process.env,
            STAGE: this.config.stage,
            CUSTOM_DOMAIN_NAME: this.config.customDomainName || '',
            CERTIFICATE_ARN: this.config.certificateArn || '',
          },
        });
        console.log(`✅ ${stackPattern} deployed successfully`);
      } catch (error) {
        throw new Error(`Failed to deploy ${stackPattern}: ${error}`);
      }
    }
  }

  private getDeploymentOrder(): string[] {
    if (this.config.stacksToDeploy && this.config.stacksToDeploy.length > 0) {
      return this.config.stacksToDeploy;
    }

    // デフォルトの依存関係に基づく順序
    return [
      `*Database*${this.config.stage}`, // Database first
      `*Api*${this.config.stage}`, // API second
      `*WebSocket*${this.config.stage}`, // WebSocket third
      `*Frontend*${this.config.stage}`, // Frontend last
    ];
  }

  private buildDeployCommand(stackPattern: string): string {
    const baseCommand = `npx cdk deploy "${stackPattern}"`;
    const options = ['--require-approval never', '--progress events', '--concurrency 2'];

    if (this.config.stage === 'prod') {
      options.push('--termination-protection');
    }

    return `${baseCommand} ${options.join(' ')}`;
  }

  private async postDeploymentValidation(): Promise<void> {
    console.log('🔍 Running post-deployment validation...');

    try {
      // スタックの状態確認
      const { stdout } = await execAsync('npx cdk list', {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STAGE: this.config.stage,
        },
      });

      const expectedStacks = [
        `CommentiaDatabaseStack-${this.config.stage}`,
        `CommentiaApiStack-${this.config.stage}`,
        `CommentiaWebSocketStack-${this.config.stage}`,
        `CommentiaFrontendStack-${this.config.stage}`,
      ];

      for (const stack of expectedStacks) {
        if (!stdout.includes(stack)) {
          console.warn(`⚠️ Stack ${stack} was not found in deployed stacks`);
        } else {
          console.log(`✅ Stack ${stack} is deployed`);
        }
      }

      // 環境設定ファイルの生成
      await this.generateEnvironmentConfig();

      console.log('✅ Post-deployment validation completed');
    } catch (error) {
      console.warn('⚠️ Post-deployment validation failed:', error);
    }
  }

  private async generateEnvironmentConfig(): Promise<void> {
    console.log('📝 Generating environment configuration...');

    try {
      // CDK Output の取得
      const { stdout: _stdout } = await execAsync('npx cdk list --json', {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STAGE: this.config.stage,
        },
      });

      // 環境設定ファイルの作成
      const envConfig = {
        STAGE: this.config.stage,
        DEPLOYMENT_TIME: new Date().toISOString(),
        REGION: this.config.region || process.env.CDK_DEFAULT_REGION || 'us-east-1',
        ACCOUNT: this.config.account || process.env.CDK_DEFAULT_ACCOUNT,
        CUSTOM_DOMAIN: this.config.customDomainName || '',
      };

      const configPath = path.join(process.cwd(), `.env.${this.config.stage}`);
      const configContent = Object.entries(envConfig)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      fs.writeFileSync(configPath, configContent);
      console.log(`✅ Environment config written to ${configPath}`);
    } catch (error) {
      console.warn('⚠️ Failed to generate environment configuration:', error);
    }
  }

  async destroy(): Promise<void> {
    console.log('🗑️ Starting stack destruction...');

    if (this.config.stage === 'prod') {
      throw new Error('Production stack destruction is not allowed through this script');
    }

    try {
      await execAsync(`npx cdk destroy "*${this.config.stage}" --force`, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STAGE: this.config.stage,
        },
      });
      console.log('✅ Stacks destroyed successfully');
    } catch (error) {
      throw new Error(`Failed to destroy stacks: ${error}`);
    }
  }
}

// CLI interface
function parseArgs(): DeploymentConfig {
  const args = process.argv.slice(2);
  const config: DeploymentConfig = {
    stage: 'dev',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--stage':
        config.stage = args[++i] as 'dev' | 'staging' | 'prod';
        break;
      case '--region':
        config.region = args[++i];
        break;
      case '--account':
        config.account = args[++i];
        break;
      case '--domain':
        config.customDomainName = args[++i];
        break;
      case '--cert-arn':
        config.certificateArn = args[++i];
        break;
      case '--encrypt':
        config.enableEncryption = true;
        break;
      case '--no-encrypt':
        config.enableEncryption = false;
        break;
      case '--protect':
        config.enableDeletionProtection = true;
        break;
      case '--no-protect':
        config.enableDeletionProtection = false;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--destroy': {
        // 破棄モード
        const deployer = new CommentiaDeployer(config);
        deployer.destroy().catch(console.error);
        return config; // 早期リターン
      }
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (args[i].startsWith('--')) {
          console.warn(`Unknown option: ${args[i]}`);
        }
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
Commentia Deployment Script

Usage:
  npm run deploy:infrastructure -- [options]

Options:
  --stage <stage>         Deployment stage (dev|staging|prod) [default: dev]
  --region <region>       AWS region [default: us-east-1]
  --account <account>     AWS account ID
  --domain <domain>       Custom domain name
  --cert-arn <arn>        Certificate ARN for custom domain
  --encrypt               Enable encryption (default for staging/prod)
  --no-encrypt            Disable encryption
  --protect               Enable deletion protection (default for prod)
  --no-protect            Disable deletion protection
  --dry-run               Show diff only, don't deploy
  --destroy               Destroy stacks (not allowed for prod)
  --help                  Show this help

Examples:
  npm run deploy:infrastructure -- --stage dev
  npm run deploy:infrastructure -- --stage staging --domain staging.commentia.com
  npm run deploy:infrastructure -- --stage prod --domain commentia.com --cert-arn arn:aws:acm:...
  npm run deploy:infrastructure -- --stage dev --dry-run
`);
}

// Main execution
async function main(): Promise<void> {
  const config = parseArgs();

  if (config.stage === 'prod' && !config.customDomainName) {
    console.warn('⚠️ Warning: Production deployment without custom domain');
  }

  const deployer = new CommentiaDeployer(config);
  await deployer.deploy();
}

// スクリプトとして実行された場合のみ main を呼び出し
if (require.main === module) {
  main().catch(console.error);
}

export { CommentiaDeployer, type DeploymentConfig };
