import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { ensureGeminiApiKey, ensureCopilotAuth, ensureCodexAuth, pickGeminiModel, pickCopilotModel } from '../auth.js';
import { collectPlanningEvidence } from '../evidence.js';
import { generateOutline, reviseOutline } from '../pipeline/outline.js';
import { generateDesignSystem } from '../pipeline/design.js';
import { FALLBACK_CONCEPTS, DEPTH_SETTINGS } from '../constants.js';
import { MODE_CONFIGS, VALID_MODES, getModeConfig, DEFAULT_MODE } from '../modes.js';
import { getLocalAssets, getPlanningFiles, slugify, makeDeckStamp, saveDeckgenRunState } from '../utils.js';
import {
  printPhaseHeader, printOutline, printRunSummary,
  statusOk, statusWarn, statusInfo, statusHint,
} from '../ui.js';
import { TYPE_PALETTE } from '../constants.js';

function startPhase(ctx, name) {
  const phase = { name, start: Date.now(), end: null, status: 'ok' };
  ctx.phases.push(phase);
  return phase;
}

function endPhase(phase, status = 'ok') {
  phase.end = Date.now();
  phase.status = status;
}

export async function planCommand(ctx) {
  console.log(chalk.bold('\n  deckgen plan\n'));

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (ctx.provider === 'gemini') {
    await ensureGeminiApiKey(ctx);
    await pickGeminiModel(ctx);
  } else if (ctx.provider === 'codex') {
    await ensureCodexAuth(ctx);
  } else {
    await ensureCopilotAuth(ctx);
    await pickCopilotModel(ctx);
  }

  // ── Mode ──────────────────────────────────────────────────────────────────
  if (!ctx.mode || !VALID_MODES.includes(ctx.mode)) {
    if (ctx.yes) {
      ctx.mode = DEFAULT_MODE;
    } else {
      ctx.mode = await select({
        message: '  Presentation mode:',
        choices: Object.entries(MODE_CONFIGS).map(([value, m]) => ({
          name: `${m.label}  ${chalk.dim(m.description)}`,
          value,
        })),
        default: DEFAULT_MODE,
      });
    }
  }
  ctx.modeConfig = getModeConfig(ctx.mode);

  // ── Brief ─────────────────────────────────────────────────────────────────
  if (!ctx.brief) {
    if (ctx.yes) { console.error(chalk.red('  --yes requires --brief <text>.')); process.exit(1); }
    ctx.brief = await input({ message: '  Brief — what is this deck about?' });
  }
  if (!ctx.brief.trim()) { console.log(chalk.dim('  Brief empty. Exiting.')); process.exit(0); }

  // ── Depth ─────────────────────────────────────────────────────────────────
  const depthSource = ctx.modeConfig.depthSettings || DEPTH_SETTINGS;
  const validDepths = Object.keys(depthSource);
  if (!ctx.depth || !validDepths.includes(ctx.depth)) {
    if (ctx.yes) {
      ctx.depth = validDepths.includes('standard') ? 'standard' : validDepths[Math.floor(validDepths.length / 2)];
    } else {
      ctx.depth = await select({
        message: '  Depth:',
        choices: Object.entries(depthSource).map(([value, s]) => ({
          name: `${s.label}  ${chalk.dim(s.guide)}`,
          value,
        })),
        default: validDepths.includes('standard') ? 'standard' : validDepths[0],
      });
    }
  }

  await saveDeckgenRunState({
    command: 'plan',
    provider: ctx.provider,
    mode: ctx.mode,
    brief: ctx.brief,
    depth: ctx.depth,
    variant: ctx.variant,
    codexThreadId: ctx.codexThreadId || '',
  }).catch(() => {});

  const assets        = await getLocalAssets();
  const planningFiles = await getPlanningFiles();

  // ── 1/2 Evidence ─────────────────────────────────────────────────────────
  printPhaseHeader(1, 2, 'Evidence');
  const evPhase = startPhase(ctx, 'Evidence');
  const evSpinner = ora('  Searching web and workspace…').start();
  const evidence = await collectPlanningEvidence(ctx.brief, planningFiles, ctx.modeConfig);
  evSpinner.stop();
  const webCount = evidence.webEvidence.length;
  const localCount = evidence.workspaceEvidence.length;
  statusOk(`Found ${webCount} web source${webCount === 1 ? '' : 's'}, ${localCount} workspace snippet${localCount === 1 ? '' : 's'}`, Date.now() - evPhase.start);
  endPhase(evPhase);

  // ── 2/2 Outline ───────────────────────────────────────────────────────────
  printPhaseHeader(2, 2, 'Outline');
  const providerLabel = ctx.provider === 'copilot'
    ? `GitHub Copilot (${ctx.copilotModel})`
    : ctx.provider === 'codex'
      ? `Codex (${ctx.codexModel})`
      : `Gemini (${ctx.geminiModel})`;
  const outlinePhase  = startPhase(ctx, 'Outline');
  const outSpinner    = ora(`  Generating via ${providerLabel}…`).start();

  let concepts;
  try {
    concepts = await generateOutline(ctx, ctx.brief, ctx.depth, assets, planningFiles, evidence);
    outSpinner.stop();
    statusOk(`Draft outline: ${concepts.length} concept${concepts.length === 1 ? '' : 's'}`, Date.now() - outlinePhase.start);
    endPhase(outlinePhase);
  } catch (err) {
    outSpinner.stop();
    statusWarn(`API error — using fallback outline. ${chalk.dim(err.message)}`);
    concepts = FALLBACK_CONCEPTS;
    endPhase(outlinePhase, 'warn');
  }

  printOutline(concepts, TYPE_PALETTE);

  // ── Revision loop ─────────────────────────────────────────────────────────
  if (!ctx.yes) {
    while (true) {
      const instruction = await input({ message: '  Proceed? [Enter] or type a revision instruction:' });
      const v = instruction.trim().toLowerCase();
      if (v === '' || v === 'y' || v === 'yes') break;
      if (v === 'n' || v === 'no') { console.log(chalk.dim('  Aborted.')); process.exit(0); }

      const revPhase = startPhase(ctx, 'Revision');
      const revSpinner = ora('  Revising outline…').start();
      try {
        concepts = await reviseOutline(ctx, concepts, instruction, assets, planningFiles, evidence);
        revSpinner.stop();
        statusOk('Outline revised', Date.now() - revPhase.start);
        endPhase(revPhase);
      } catch (err) {
        revSpinner.stop();
        statusWarn('Revision failed — keeping previous outline.');
        endPhase(revPhase, 'warn');
      }
      printOutline(concepts, TYPE_PALETTE);
    }
  }

  // ── Design system preview ─────────────────────────────────────────────────
  console.log('');
  const dsSpinner = ora('  Generating design system preview…').start();
  let design = null;
  try {
    design = await generateDesignSystem(ctx, ctx.brief, concepts);
  } catch {}
  dsSpinner.stop();

  if (design) {
    statusOk(`Design: ${chalk.cyan(design.displayFont)} × ${chalk.cyan(design.bodyFont)}  ${chalk.dim(design.aesthetic || '')}`);
    if (design.signatureMove) statusInfo(`Signature move: ${design.signatureMove}`);
  } else {
    statusWarn('Design system generation failed — defaults will be used at build time.');
  }

  // ── Save plan artefact ────────────────────────────────────────────────────
  const slug    = slugify(ctx.brief);
  const stamp   = makeDeckStamp();
  const planDir = path.join(process.cwd(), 'output', `${slug}_${stamp}`);
  await fs.mkdir(planDir, { recursive: true });

  const planPath = path.join(planDir, 'plan.json');
  const planData = { brief: ctx.brief, depth: ctx.depth, provider: ctx.provider, concepts, design, generatedAt: new Date().toISOString() };
  await fs.writeFile(planPath, JSON.stringify(planData, null, 2) + '\n', 'utf-8');

  statusOk(`Plan saved — ${path.relative(process.cwd(), planPath)}`);
  console.log('');
  statusHint(`To build from this plan: deckgen generate --brief "${ctx.brief}" --depth ${ctx.depth} --yes`);

  printRunSummary(ctx, path.relative(process.cwd(), planDir));
}
