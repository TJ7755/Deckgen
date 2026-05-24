import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { normalizeProvider, normalizeApiKey } from './utils.js';
import { printHelp, printVersion } from './ui.js';

dotenv.config();

const COMMANDS = new Set(['generate', 'plan', 'doctor', 'resume']);

function parseArgs(argv) {
  const args = {
    command:     null,
    provider:    null,
    mode:        null,
    brief:       null,
    depth:       null,
    variant:     null,
    yes:         false,
    help:        false,
    version:     false,
    serve:       null,
    providerSet: false,
  };

  let i = 0;

  // Check for sub-command as first non-flag argument
  if (argv[0] && !argv[0].startsWith('-')) {
    if (COMMANDS.has(argv[0])) {
      args.command = argv[0];
      i = 1;
    }
  }

  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help'    || a === '-h') { args.help    = true; continue; }
    if (a === '--version' || a === '-v') { args.version = true; continue; }
    if (a === '--yes'     || a === '-y') { args.yes     = true; continue; }
    if (a === '--serve')                 { args.serve   = true; continue; }
    if (a === '--no-serve')              { args.serve   = false; continue; }

    if (a === '--provider' && argv[i + 1]) {
      args.provider = normalizeProvider(argv[++i]);
      args.providerSet = true;
      continue;
    }
    if (a === '--mode'    && argv[i + 1]) { args.mode    = argv[++i]; continue; }
    if (a === '--brief'   && argv[i + 1]) { args.brief   = argv[++i]; continue; }
    if (a === '--depth'   && argv[i + 1]) { args.depth   = argv[++i]; continue; }
    if (a === '--variant' && argv[i + 1]) { args.variant = argv[++i]; continue; }
  }

  return args;
}

function buildContext(args) {
  const defaultProvider = normalizeProvider(process.env.DECKGEN_PROVIDER || 'gemini');
  const geminiApiKey    = normalizeApiKey(process.env.GEMINI_API_KEY || '');

  return {
    provider:    args.provider || defaultProvider,
    mode:        args.mode     || process.env.DECKGEN_MODE || '',
    brief:       args.brief    || '',
    depth:       args.depth    || '',
    variant:     args.variant  || '',
    yes:         args.yes,
    serve:       args.serve,
    geminiApiKey,
    copilotToken:  '',
    copilotModel:  String(process.env.DECKGEN_COPILOT_MODEL || '').trim() || 'gpt-5.4-mini',
    startTime:   Date.now(),
    phases:      [],
    args,        // keep reference so commands can read providerSet, etc.
  };
}

function loadPackageJson() {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
  } catch {
    return { name: 'deckgen', version: 'unknown' };
  }
}

export async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    printVersion(loadPackageJson());
    process.exit(0);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const command = args.command || 'generate';

  if (command === 'resume') {
    console.log(chalk.yellow('\n  Resume is not yet available.\n'));
    console.log(chalk.dim('  Interrupted runs must be restarted from the beginning.\n'));
    process.exit(1);
  }

  const ctx = buildContext(args);

  if (command === 'doctor') {
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand(ctx);
    return;
  }

  if (command === 'plan') {
    const { planCommand } = await import('./commands/plan.js');
    await planCommand(ctx);
    return;
  }

  // Default: generate
  const { generateCommand } = await import('./commands/generate.js');
  await generateCommand(ctx);
}
