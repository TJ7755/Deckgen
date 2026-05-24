import { spawn } from 'child_process';
import chalk from 'chalk';
import { printSectionHeader, statusOk, statusWarn, statusErr, statusInfo } from '../ui.js';
import { checkGeminiAuthStatus, checkCopilotAuthStatus, checkCodexAuthStatus } from '../auth.js';
import { normalizeApiKey } from '../utils.js';

function checkCommand(cmd, args = ['--version']) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: 'pipe' });
    let out = '';
    child.stdout?.on('data', d => { out += d; });
    child.stderr?.on('data', d => { out += d; });
    child.on('error', () => resolve({ ok: false, detail: 'not found' }));
    child.on('close', code => resolve({ ok: code === 0, detail: out.split('\n')[0].trim().slice(0, 60) }));
  });
}

async function checkNetwork() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://www.google.com', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.ok || res.status < 500, detail: `HTTP ${res.status}` };
  } catch {
    return { ok: false, detail: 'unreachable' };
  }
}

async function checkOutputDir() {
  try {
    const { default: fs } = await import('fs/promises');
    const { default: path } = await import('path');
    const outDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outDir, { recursive: true });
    const testFile = path.join(outDir, '.deckgen-probe');
    await fs.writeFile(testFile, '');
    await fs.unlink(testFile);
    return { ok: true, detail: 'writable' };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

function row(label, result) {
  const pad = label.padEnd(22);
  if (result.ok) {
    statusOk(`${pad} ${chalk.dim(result.detail || '')}`);
  } else {
    statusErr(`${pad} ${result.detail || 'failed'}`);
  }
}

export async function doctorCommand(ctx) {
  console.log(chalk.bold('\n  deckgen doctor\n'));

  printSectionHeader('System');
  const python = await checkCommand('python3', ['--version']);
  row('python3', python);

  const git = await checkCommand('git', ['--version']);
  row('git', git);

  const network = await checkNetwork();
  row('network', network);

  const outputDir = await checkOutputDir();
  row('output directory', outputDir);

  printSectionHeader('Providers');

  const geminiKey = normalizeApiKey(process.env.GEMINI_API_KEY || '');
  const geminiCtx = { ...ctx, geminiApiKey: geminiKey };
  const gemini = await checkGeminiAuthStatus(geminiCtx);
  row('Gemini API key', gemini);

  const copilot = await checkCopilotAuthStatus();
  row('GitHub Copilot', copilot);

  const codex = await checkCodexAuthStatus();
  row('Codex', codex);

  printSectionHeader('Environment');
  statusInfo(`Node.js   ${process.version}`);
  statusInfo(`CWD       ${process.cwd()}`);
  if (process.env.DECKGEN_PROVIDER) {
    statusInfo(`Provider  ${process.env.DECKGEN_PROVIDER}  ${chalk.dim('(DECKGEN_PROVIDER env)')}`);
  }

  const allOk = python.ok && git.ok && network.ok && outputDir.ok && (gemini.ok || copilot.ok || codex.ok);

  console.log('');
  if (allOk) {
    statusOk('Environment is ready.');
  } else {
    const problems = [];
    if (!python.ok) problems.push('python3 not found — required to serve presentations locally');
    if (!git.ok)    problems.push('git not found — required to clone reveal.js');
    if (!network.ok) problems.push('network unreachable — required for evidence search and image resolution');
    if (!outputDir.ok) problems.push('output directory not writable');
    if (!gemini.ok && !copilot.ok && !codex.ok) problems.push('no provider authenticated — set GEMINI_API_KEY, CODEX_API_KEY, or authenticate via Copilot');

    for (const p of problems) {
      statusWarn(p);
    }
  }

  console.log('');
  process.exit(allOk ? 0 : 1);
}
