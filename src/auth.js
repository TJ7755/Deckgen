import { input, select } from '@inquirer/prompts';
import { CopilotClient, approveAll } from '@github/copilot-sdk';
import chalk from 'chalk';
import ora from 'ora';
import { normalizeApiKey, upsertEnvVar, sleep } from './utils.js';
import { GH_DEVICE_CLIENT_ID, COPILOT_TOKEN_ENV_VARS, DEFAULT_COPILOT_MODEL } from './constants.js';

// ── Gemini ────────────────────────────────────────────────────────────────────

export async function ensureGeminiApiKey(ctx) {
  if (ctx.geminiApiKey) {
    if ((process.env.GEMINI_API_KEY || '').trim().startsWith('GEMINI_API_KEY=')) {
      await upsertEnvVar('GEMINI_API_KEY', ctx.geminiApiKey);
    }
    return;
  }

  if (ctx.yes) {
    console.error(chalk.red('  No GEMINI_API_KEY found. Set it in .env or pass GEMINI_API_KEY=<key> in the environment.'));
    process.exit(1);
  }

  console.log(chalk.yellow('  No GEMINI_API_KEY found in this project.'));
  const entered = await input({ message: '  Paste your Gemini API key to save in .env:' });
  const cleaned = normalizeApiKey(entered);

  if (!cleaned) {
    console.error(chalk.red('  No API key entered.'));
    process.exit(1);
  }

  ctx.geminiApiKey = cleaned;
  await upsertEnvVar('GEMINI_API_KEY', cleaned);
  console.log(chalk.green('  Saved GEMINI_API_KEY to .env'));
}

// ── GitHub Copilot ────────────────────────────────────────────────────────────

function getCopilotEnvToken() {
  for (const envName of COPILOT_TOKEN_ENV_VARS) {
    const token = String(process.env[envName] || '').trim();
    if (token) return token;
  }
  return '';
}

export function makeCopilotClient(ctx) {
  return ctx.copilotToken
    ? new CopilotClient({ gitHubToken: ctx.copilotToken, useLoggedInUser: false })
    : new CopilotClient();
}

async function runDeviceFlow() {
  const codeRes = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ client_id: GH_DEVICE_CLIENT_ID, scope: 'read:user' }),
  });

  if (!codeRes.ok) {
    throw new Error(`Device flow failed to start: ${codeRes.status} ${codeRes.statusText}`);
  }

  const { device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval } = await codeRes.json();
  const browserUrl = verification_uri_complete || verification_uri;

  console.log(chalk.bold('\n  GitHub authentication required for Copilot.'));
  console.log(`     Opening: ${chalk.cyan(browserUrl)}`);

  if (!verification_uri_complete) {
    console.log(`     Code:    ${chalk.bold.yellow(user_code)}  ${chalk.dim('(enter this on the page)')}\n`);
  } else {
    console.log(`     ${chalk.dim('Code pre-filled — click Authorise in the browser.')}\n`);
  }

  try { (await import('child_process')).spawn('open', [browserUrl], { detached: true, stdio: 'ignore' }).unref(); } catch {}

  let pollMs = Math.max((interval || 5), 5) * 1000;
  const deadline = Date.now() + (expires_in || 900) * 1000;
  const spinner = ora('  Waiting for GitHub authorisation…').start();

  while (Date.now() < deadline) {
    await sleep(pollMs);
    let data;
    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: GH_DEVICE_CLIENT_ID,
          device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      data = await tokenRes.json();
    } catch { continue; }

    if (data.access_token) { spinner.succeed('  GitHub authorisation complete.'); return data.access_token; }
    if (data.error === 'expired_token' || data.error === 'access_denied') {
      spinner.fail('  Authorisation failed.');
      throw new Error(data.error_description || data.error);
    }
    if (data.error === 'slow_down') pollMs += 5000;
  }

  spinner.fail('  Authorisation timed out.');
  throw new Error('Device flow timed out — the one-time code has expired. Run Deckgen again to retry.');
}

export async function ensureCopilotAuth(ctx) {
  const envToken = getCopilotEnvToken();
  if (envToken) {
    ctx.copilotToken = envToken;
    console.log(chalk.dim('  Using GitHub token from environment.'));
    return;
  }

  const client = new CopilotClient();
  let authenticated = false;
  let login = '';
  try {
    await client.start();
    const status = await client.getAuthStatus();
    authenticated = status.isAuthenticated;
    login = status.login || '';
  } catch {}
  finally { await client.stop().catch(() => {}); }

  if (authenticated) {
    ctx.copilotToken = '';
    console.log(chalk.dim(`  Authenticated as ${login || 'GitHub user'} via stored credentials.`));
    return;
  }

  if (ctx.yes) {
    console.error(chalk.red('  No GitHub credentials found. Run without --yes to authenticate interactively.'));
    process.exit(1);
  }

  console.log(chalk.yellow('  No GitHub credentials found. Starting device-flow login…'));
  const token = await runDeviceFlow();
  ctx.copilotToken = token;
  await upsertEnvVar('COPILOT_GITHUB_TOKEN', token);
  console.log(chalk.green('  Token saved to .env as COPILOT_GITHUB_TOKEN.'));
}

// ── Codex ───────────────────────────────────────────────────────────────────

function getCodexEnvToken() {
  return String(process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || '').trim();
}

export async function ensureCodexAuth(ctx) {
  const envToken = getCodexEnvToken();
  if (envToken) {
    ctx.codexApiKey = envToken;
    console.log(chalk.dim('  Using Codex/OpenAI token from environment.'));
    return;
  }

  if (ctx.yes) {
    console.error(chalk.red('  No CODEX_API_KEY or OPENAI_API_KEY found. Run without --yes to authenticate interactively.'));
    process.exit(1);
  }

  console.log(chalk.yellow('  No Codex/OpenAI API key found in this project.'));
  const entered = await input({ message: '  Paste your OpenAI API key to save in .env as CODEX_API_KEY:' });
  const cleaned = normalizeApiKey(entered);

  if (!cleaned) {
    console.error(chalk.red('  No API key entered.'));
    process.exit(1);
  }

  ctx.codexApiKey = cleaned;
  await upsertEnvVar('CODEX_API_KEY', cleaned);
  console.log(chalk.green('  Saved CODEX_API_KEY to .env'));
}

export async function listCopilotModels(ctx) {
  const client = makeCopilotClient(ctx);
  try {
    await client.start();
    const models = await client.listModels();
    return models.filter(m => m.policy?.state !== 'disabled');
  } catch { return []; }
  finally { await client.stop().catch(() => {}); }
}

export async function pickCopilotModel(ctx) {
  ctx.copilotModel = String(process.env.DECKGEN_COPILOT_MODEL || '').trim() || DEFAULT_COPILOT_MODEL;

  const modelSpinner = ora('  Fetching available Copilot models…').start();
  const availableModels = await listCopilotModels(ctx);
  modelSpinner.stop();

  if (availableModels.length === 0) {
    console.log(chalk.dim(`  Could not fetch model list — using ${ctx.copilotModel}.`));
    return;
  }

  if (ctx.yes) {
    const found = availableModels.find(m => m.id === ctx.copilotModel);
    if (!found) ctx.copilotModel = availableModels[0].id;
    return;
  }

  const defaultModel = availableModels.find(m => m.id === ctx.copilotModel) || availableModels[0];
  ctx.copilotModel = await select({
    message: '  Select Copilot model:',
    choices: availableModels.map(m => ({ name: `${m.name}  ${chalk.dim('(' + m.id + ')')}`, value: m.id })),
    default: defaultModel.id,
  });
  await upsertEnvVar('DECKGEN_COPILOT_MODEL', ctx.copilotModel).catch(() => {});
}

// ── Auth status (for doctor command) ─────────────────────────────────────────

export async function checkGeminiAuthStatus(ctx) {
  if (ctx.geminiApiKey) return { ok: true, detail: 'API key present' };
  return { ok: false, detail: 'GEMINI_API_KEY not set' };
}

export async function checkCopilotAuthStatus() {
  const envToken = getCopilotEnvToken();
  if (envToken) return { ok: true, detail: 'Token found in environment' };

  try {
    const client = new CopilotClient();
    await client.start();
    const status = await client.getAuthStatus();
    await client.stop().catch(() => {});
    if (status.isAuthenticated) {
      return { ok: true, detail: `Authenticated as ${status.login || 'GitHub user'}` };
    }
    return { ok: false, detail: 'Not authenticated' };
  } catch {
    return { ok: false, detail: 'Could not reach Copilot' };
  }
}

export async function checkCodexAuthStatus() {
  const envToken = getCodexEnvToken();
  if (envToken) return { ok: true, detail: 'Token found in environment' };

  return { ok: false, detail: 'CODEX_API_KEY or OPENAI_API_KEY not set' };
}
