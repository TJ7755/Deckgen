import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { ensureGeminiApiKey, ensureCopilotAuth, pickCopilotModel } from '../auth.js';
import { collectPlanningEvidence, collectContentEvidence } from '../evidence.js';
import { generateOutline, reviseOutline } from '../pipeline/outline.js';
import { generateSlideContent } from '../pipeline/content.js';
import { generateDesignSystem } from '../pipeline/design.js';
import { resolveSlideImages } from '../pipeline/images.js';
import { writeGeneratedArtifacts } from '../pipeline/artefacts.js';
import { buildRevealHTML, sanitiseGeneratedHtml } from '../pipeline/html.js';
import { FALLBACK_CONCEPTS, DEPTH_SETTINGS, TYPE_PALETTE, countSlides, allSlides } from '../constants.js';
import { MODE_CONFIGS, VALID_MODES, getModeConfig, DEFAULT_MODE } from '../modes.js';
import { getLocalAssets, getPlanningFiles, slugify, makeDeckStamp, runCommand, truncateText } from '../utils.js';
import {
  printPhaseHeader, printSectionHeader, printOutline, printExpandedConcept,
  printRunSummary, statusOk, statusWarn, statusErr, statusInfo, statusHint,
} from '../ui.js';

// ── Phase tracking ────────────────────────────────────────────────────────────

function startPhase(ctx, name) {
  const phase = { name, start: Date.now(), end: null, status: 'ok' };
  ctx.phases.push(phase);
  return phase;
}

function endPhase(phase, status = 'ok') {
  phase.end = Date.now();
  phase.status = status;
}

// ── Outline review loop ───────────────────────────────────────────────────────

async function reviewOutline(ctx, concepts, assets, planningFiles, evidence) {
  while (true) {
    const choice = await select({
      message: '  Review outline:',
      choices: [
        { name: 'Continue with this outline', value: 'continue' },
        ...concepts.map((concept, i) => ({
          name: `Expand concept ${i + 1}: ${concept.title}`,
          value: `expand:${i}`,
        })),
        { name: 'Revise — type an instruction', value: 'revise' },
        { name: 'Abort', value: 'abort' },
      ],
    });

    if (choice === 'continue') return concepts;
    if (choice === 'abort') { console.log(chalk.dim('  Aborted. No files created.')); process.exit(0); }

    if (choice.startsWith('expand:')) {
      const idx = parseInt(choice.split(':')[1], 10);
      printExpandedConcept(concepts[idx], idx);
      continue;
    }

    if (choice === 'revise') {
      const instruction = await input({ message: '  Revision instruction:' });
      if (!instruction.trim()) continue;

      const revSpinner = ora('  Revising outline…').start();
      try {
        concepts = await reviseOutline(ctx, concepts, instruction, assets, planningFiles, evidence);
        revSpinner.stop();
        statusOk('Outline revised');
        printOutline(concepts, TYPE_PALETTE);
      } catch (err) {
        revSpinner.stop();
        statusWarn(`Revision failed — keeping previous outline. ${chalk.dim(err.message)}`);
      }
    }
  }
}

// ── Serve ─────────────────────────────────────────────────────────────────────

function canBindPort(port) {
  return new Promise(resolve => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => { tester.close(() => resolve(true)); });
    tester.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(start, end) {
  for (let port = start; port <= end; port++) {
    if (await canBindPort(port)) return port;
  }
  throw new Error(`No free port found between ${start} and ${end}`);
}

async function serveDeck(deckDir) {
  const port = await findAvailablePort(8000, 8010);
  const url  = `http://localhost:${port}`;

  return new Promise((resolve, reject) => {
    const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: deckDir, stdio: 'inherit' });
    server.on('error', reject);
    server.on('spawn', async () => {
      try { spawn('open', [url], { detached: true, stdio: 'ignore' }).unref(); } catch {}
      console.log(`\n  ${chalk.cyan(`Serving at ${url}`)}`);
      console.log(chalk.dim('  Press Ctrl+C to stop.\n'));
    });
    server.on('exit', code => {
      if (code && code !== 0) { reject(new Error(`Server exited with code ${code}`)); return; }
      resolve();
    });
  });
}

// ── Preflight checks ──────────────────────────────────────────────────────────

async function preflight(ctx) {
  const { spawn } = await import('child_process');

  const checkTool = (cmd, args) => new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: 'pipe' });
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });

  printSectionHeader('Preflight');

  const python = await checkTool('python3', ['--version']);
  const git    = await checkTool('git',     ['--version']);

  if (!python) statusWarn('python3 not found — local serving will not be available');
  if (!git)    {
    statusErr('git not found — required to clone reveal.js');
    process.exit(1);
  }

  if (python && git) statusOk('System tools available');

  try {
    await fs.access(process.cwd(), fs.constants.W_OK);
  } catch {
    statusErr('Current directory is not writable');
    process.exit(1);
  }

  console.log('');
}

// ── Main generate command ─────────────────────────────────────────────────────

export async function generateCommand(ctx) {
  console.log(chalk.bold('\n  deckgen generate\n'));

  await preflight(ctx);

  // ── Auth and provider setup ───────────────────────────────────────────────
  if (!ctx.provider || (!process.env.DECKGEN_PROVIDER && !ctx.yes)) {
    ctx.provider = 'gemini';
    if (!ctx.args?.providerSet) {
      try {
        ctx.provider = await select({
          message: '  Model provider:',
          choices: [
            { name: 'Gemini API', value: 'gemini' },
            { name: 'GitHub Copilot', value: 'copilot' },
          ],
        });
      } catch {}
    }
  }

  if (ctx.provider === 'gemini') {
    await ensureGeminiApiKey(ctx);
    statusOk('Authenticated via Gemini');
  } else {
    await ensureCopilotAuth(ctx);
    await pickCopilotModel(ctx);
    statusOk(`Authenticated via GitHub Copilot  ${chalk.dim(ctx.copilotModel)}`);
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

  // ── Colour variant ────────────────────────────────────────────────────────
  const validVariants = ['dark', 'light', 'alt'];
  if (!ctx.variant || !validVariants.includes(ctx.variant)) {
    if (ctx.yes) {
      ctx.variant = 'dark';
    } else {
      ctx.variant = await select({
        message: '  Colour variant:',
        choices: [
          { name: 'Dark',        value: 'dark'  },
          { name: 'Light',       value: 'light' },
          { name: 'Alt (amber)', value: 'alt'   },
        ],
      });
    }
  }

  console.log('');

  const assets        = await getLocalAssets();
  const planningFiles = await getPlanningFiles();
  if (assets.length > 0) statusInfo(`Found ${assets.length} image${assets.length === 1 ? '' : 's'} in current folder`);

  // ── 1/5 Evidence ─────────────────────────────────────────────────────────
  printPhaseHeader(1, 5, 'Evidence');
  const evPhase   = startPhase(ctx, 'Evidence');
  const evSpinner = ora('  Searching web and workspace…').start();
  const evidence  = await collectPlanningEvidence(ctx.brief, planningFiles, ctx.modeConfig);
  evSpinner.stop();
  const webCount   = evidence.webEvidence.length;
  const localCount = evidence.workspaceEvidence.length;
  statusOk(`Found ${webCount} web source${webCount === 1 ? '' : 's'}, ${localCount} workspace snippet${localCount === 1 ? '' : 's'}`, Date.now() - evPhase.start);
  endPhase(evPhase);

  // ── 2/5 Outline ───────────────────────────────────────────────────────────
  printPhaseHeader(2, 5, 'Outline');
  const providerLabel = ctx.provider === 'copilot' ? `GitHub Copilot (${ctx.copilotModel})` : 'Gemini';
  const outlinePhase  = startPhase(ctx, 'Outline');
  const outSpinner    = ora(`  Generating via ${providerLabel}…`).start();

  let concepts;
  try {
    concepts = await generateOutline(ctx, ctx.brief, ctx.depth, assets, planningFiles, evidence);
    outSpinner.stop();
    const total = countSlides(concepts);
    statusOk(`Draft: ${concepts.length} concept${concepts.length === 1 ? '' : 's'}, ${total} slide${total === 1 ? '' : 's'}`, Date.now() - outlinePhase.start);
    endPhase(outlinePhase);
  } catch (err) {
    outSpinner.stop();
    statusWarn(`API error — using fallback outline. ${chalk.dim(err.message)}`);
    concepts = FALLBACK_CONCEPTS;
    endPhase(outlinePhase, 'warn');
  }

  printOutline(concepts, TYPE_PALETTE);

  if (!ctx.yes) {
    concepts = await reviewOutline(ctx, concepts, assets, planningFiles, evidence);
  }

  // ── 3/5 Design ────────────────────────────────────────────────────────────
  printPhaseHeader(3, 5, 'Design');
  const dsPhase   = startPhase(ctx, 'Design');
  const dsSpinner = ora('  Generating visual design system…').start();
  let design = {};
  try {
    const ds = await generateDesignSystem(ctx, ctx.brief, concepts);
    dsSpinner.stop();
    if (ds) {
      design = ds;
      statusOk(`${chalk.cyan(ds.displayFont)} × ${chalk.cyan(ds.bodyFont)}  ${chalk.dim(ds.aesthetic || '')}`, Date.now() - dsPhase.start);
      if (ds.signatureMove) statusInfo(`Signature move: ${ds.signatureMove}`);
    } else {
      statusWarn('Design system failed — using defaults');
    }
    endPhase(dsPhase, ds ? 'ok' : 'warn');
  } catch (err) {
    dsSpinner.stop();
    statusWarn(`Design error — using defaults. ${chalk.dim(err.message)}`);
    endPhase(dsPhase, 'warn');
  }

  // ── 4/5 Content ───────────────────────────────────────────────────────────
  printPhaseHeader(4, 5, 'Content');
  const total         = countSlides(concepts);
  const contentPhase  = startPhase(ctx, 'Content');
  const contentSpinner = ora(`  Generating slide content… (0 / ${total})`).start();

  if (ctx.provider === 'copilot') {
    contentSpinner.text = '  Searching web for chart and stat data…';
    evidence.contentEvidence = await collectContentEvidence(allSlides(concepts), ctx.brief);
    contentSpinner.text = `  Generating slide content… (0 / ${total})`;
  }

  let richConcepts;
  try {
    richConcepts = await generateSlideContent(
      ctx,
      concepts,
      ctx.brief,
      assets,
      planningFiles,
      evidence,
      ({ slideNumber, title }) => {
        contentSpinner.text = `  Generating slide content… (${slideNumber} / ${total}) "${truncateText(title, 40)}"`;
      }
    );
    contentSpinner.stop();
    statusOk(`Content complete — ${total} slide${total === 1 ? '' : 's'}`, Date.now() - contentPhase.start);
    endPhase(contentPhase);
  } catch (err) {
    contentSpinner.stop();
    statusWarn(`Content generation failed — using outline only. ${chalk.dim(err.message)}`);
    richConcepts = concepts.map(c => ({ ...c, slides: (c.slides || []).map(s => ({ ...s })) }));
    endPhase(contentPhase, 'warn');
  }

  // ── 5/5 Build ─────────────────────────────────────────────────────────────
  printPhaseHeader(5, 5, 'Build');
  const buildPhase = startPhase(ctx, 'Build');

  const slug    = slugify(ctx.brief);
  const stamp   = makeDeckStamp();
  const deckDir = path.join(process.cwd(), 'output', `${slug}_${stamp}`);
  await fs.mkdir(deckDir, { recursive: true });

  const revealDir = path.join(deckDir, 'reveal.js');
  const hasReveal = await fs.access(revealDir).then(() => true).catch(() => false);
  const revealSpinner = ora(hasReveal ? '  Updating reveal.js…' : '  Cloning reveal.js…').start();
  try {
    if (hasReveal) {
      await runCommand('git', ['-C', revealDir, 'pull', '--ff-only'], deckDir);
    } else {
      await runCommand('git', ['clone', '--depth', '1', 'https://github.com/hakimel/reveal.js.git', 'reveal.js'], deckDir);
    }
    revealSpinner.stop();
    statusOk('reveal.js ready');
  } catch (err) {
    revealSpinner.stop();
    statusErr(`reveal.js clone failed: ${err.message}`);
    process.exit(1);
  }

  const imgSpinner = ora('  Resolving images…').start();
  try {
    await resolveSlideImages(richConcepts, revealDir);
    imgSpinner.stop();
    statusOk('Images resolved');
  } catch (err) {
    imgSpinner.stop();
    statusWarn(`Some images could not be resolved. ${chalk.dim(err.message)}`);
  }

  await writeGeneratedArtifacts(richConcepts, revealDir);

  const html     = buildRevealHTML(richConcepts, ctx.variant, ctx.brief, design, ctx.modeConfig);
  const safeHtml = sanitiseGeneratedHtml(html);
  const filePath = path.join(revealDir, 'index.html');
  await fs.writeFile(filePath, safeHtml, 'utf-8');

  const finalTotal    = countSlides(richConcepts);
  const relPath       = path.relative(process.cwd(), filePath);
  statusOk(`Wrote ${finalTotal} slide${finalTotal === 1 ? '' : 's'} — ${chalk.cyan(relPath)}`, Date.now() - buildPhase.start);
  endPhase(buildPhase);

  ctx.slideCount   = finalTotal;
  ctx.conceptCount = richConcepts.length;

  // ── Run summary ───────────────────────────────────────────────────────────
  printRunSummary(ctx, path.relative(process.cwd(), deckDir));

  // ── Serve ─────────────────────────────────────────────────────────────────
  let shouldServe;
  if (ctx.serve === true)  { shouldServe = true; }
  else if (ctx.serve === false || ctx.yes) { shouldServe = false; }
  else {
    const answer = await input({ message: '  Start local server now? [Y/n]' });
    shouldServe = ['', 'y', 'yes'].includes(answer.trim().toLowerCase());
  }

  if (!shouldServe) {
    statusHint(`cd ${path.relative(process.cwd(), revealDir)} && python3 -m http.server 8000`);
    console.log('');
    return;
  }

  await serveDeck(revealDir);
}
