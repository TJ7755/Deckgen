import chalk from 'chalk';
import { truncateText, formatElapsed } from './utils.js';

// ── Terminal design tokens ────────────────────────────────────────────────────
// Colour semantics:
//   white/bold  — primary information, step headers
//   green       — success
//   yellow      — warning / optional
//   red         — error / fatal
//   cyan        — paths, URLs, key values
//   dim         — secondary information, timing, noise

const SEPARATOR_WIDTH = 54;
const PHASE_DASH = '─';

function pad(str, width) {
  const visible = String(str).replace(/\[[0-9;]*m/g, '');
  const needed = width - visible.length;
  return needed > 0 ? str + PHASE_DASH.repeat(needed) : str;
}

// ── Phase headers ─────────────────────────────────────────────────────────────

export function printPhaseHeader(n, total, label) {
  const inner = `  ${n}/${total}  ${label}  `;
  const full = `\n${PHASE_DASH.repeat(2)}${inner}`;
  console.log(chalk.bold(pad(full, SEPARATOR_WIDTH)));
}

export function printSectionHeader(label) {
  const inner = `  ${label}  `;
  const full = `\n${PHASE_DASH.repeat(2)}${inner}`;
  console.log(chalk.bold(pad(full, SEPARATOR_WIDTH)));
}

// ── Status rows ───────────────────────────────────────────────────────────────

export function statusOk(label, elapsedMs) {
  const timing = elapsedMs !== undefined ? chalk.dim(` ${formatElapsed(elapsedMs)}`) : '';
  console.log(`  ${chalk.green('✓')}  ${label}${timing}`);
}

export function statusWarn(label, elapsedMs) {
  const timing = elapsedMs !== undefined ? chalk.dim(` ${formatElapsed(elapsedMs)}`) : '';
  console.log(`  ${chalk.yellow('△')}  ${chalk.yellow(label)}${timing}`);
}

export function statusErr(label) {
  console.log(`  ${chalk.red('✕')}  ${chalk.red(label)}`);
}

export function statusInfo(label) {
  console.log(`     ${chalk.dim(label)}`);
}

export function statusHint(label) {
  console.log(`  ${chalk.dim('→')}  ${chalk.dim(label)}`);
}

// ── Run summary ───────────────────────────────────────────────────────────────

export function printRunSummary(ctx, outputPath) {
  const elapsed = Date.now() - ctx.startTime;
  const sep = PHASE_DASH.repeat(SEPARATOR_WIDTH);

  console.log(`\n${chalk.dim(sep)}`);

  const brief = truncateText(ctx.brief || '', 52);
  const providerLabel = ctx.provider === 'copilot'
    ? `GitHub Copilot  ${chalk.dim('·')}  ${ctx.copilotModel}`
    : 'Gemini';

  console.log(`\n  ${chalk.bold('Brief')}    ${chalk.cyan(brief)}`);
  if (ctx.mode) {
    const modeLabel = ctx.modeConfig?.label || ctx.mode;
    console.log(`  ${chalk.bold('Mode')}     ${modeLabel}`);
  }
  console.log(`  ${chalk.bold('Provider')} ${providerLabel}`);

  if (ctx.slideCount !== undefined && ctx.conceptCount !== undefined) {
    console.log(`  ${chalk.bold('Slides')}   ${ctx.slideCount} across ${ctx.conceptCount} concept${ctx.conceptCount === 1 ? '' : 's'}`);
  }

  if (outputPath) {
    console.log(`  ${chalk.bold('Output')}   ${chalk.cyan(outputPath)}`);
  }

  if (ctx.phases && ctx.phases.length > 0) {
    console.log(`\n  ${chalk.bold('Phase breakdown')}`);
    const nameWidth = Math.max(...ctx.phases.map(p => p.name.length));
    for (const phase of ctx.phases) {
      const duration = phase.end ? formatElapsed(phase.end - phase.start) : '—';
      const icon = phase.status === 'ok' ? chalk.green('✓') : phase.status === 'warn' ? chalk.yellow('△') : chalk.red('✕');
      const name = phase.name.padEnd(nameWidth + 2);
      console.log(`    ${name} ${chalk.dim(String(duration).padStart(6))}  ${icon}`);
    }
    console.log(`    ${'Total'.padEnd(nameWidth + 2)} ${chalk.dim(String(formatElapsed(elapsed)).padStart(6))}`);
  }

  console.log(`\n${chalk.dim(sep)}\n`);
}

// ── Outline display ───────────────────────────────────────────────────────────

export function printOutline(concepts, TYPE_PALETTE) {
  const total = concepts.reduce((n, c) => n + (c.slides?.length || 0), 0);
  console.log(chalk.bold(`\n  Deck structure — ${concepts.length} concept${concepts.length === 1 ? '' : 's'}, ${total} slide${total === 1 ? '' : 's'}:`));

  const roleColours = { opener: 'cyan', payoff: 'magenta', transition: 'yellow', supporting: 'white' };

  concepts.forEach((concept, ci) => {
    const roleFn = chalk[roleColours[concept.role] || 'white'] || chalk.white;
    console.log(`\n  ${chalk.bold(`${ci + 1}.`)} ${roleFn(`[${concept.role}]`)} ${chalk.bold(concept.title)}`);

    if (concept.summary) {
      console.log(`     ${chalk.dim('summary:')} ${chalk.dim(concept.summary)}`);
    }
    if ((concept.evidenceRefs || []).length > 0) {
      console.log(`     ${chalk.dim('evidence refs:')} ${chalk.dim(`[${concept.evidenceRefs.join(', ')}]`)}`);
    }
    (concept.rationale || []).forEach((line, idx) => {
      console.log(`     ${chalk.dim(`${idx + 1}.`)} ${chalk.dim(line)}`);
    });

    (concept.slides || []).forEach(slide => {
      const colorFn = chalk[TYPE_PALETTE[slide.type] || 'gray'] || chalk.gray;
      const imgInfo = slide.imageQuery
        ? chalk.dim(` [search: "${slide.imageQuery}"]`)
        : slide.image ? chalk.cyan(` [${slide.image}]`) : '';
      console.log(`     ${chalk.dim('↳')} ${colorFn(slide.type)}: ${chalk.italic(`"${slide.title}"`)}${imgInfo}`);

      if (slide.summary) {
        console.log(`        ${chalk.dim('summary:')} ${chalk.dim(slide.summary)}`);
      }
      if ((slide.evidenceRefs || []).length > 0) {
        console.log(`        ${chalk.dim('evidence refs:')} ${chalk.dim(`[${slide.evidenceRefs.join(', ')}]`)}`);
      }
      (slide.rationale || []).forEach((line, idx) => {
        console.log(`        ${chalk.dim(`${idx + 1}.`)} ${chalk.dim(line)}`);
      });
    });
  });
  console.log('');
}

export function printExpandedConcept(concept, index) {
  const roleColours = { opener: 'cyan', payoff: 'magenta', transition: 'yellow', supporting: 'white' };
  const roleFn = chalk[roleColours[concept.role] || 'white'] || chalk.white;

  console.log(chalk.bold(`\n  ${index + 1}. ${roleFn(`[${concept.role}]`)} ${concept.title}`));
  if (concept.summary) console.log(`     ${chalk.dim('summary:')} ${concept.summary}`);
  if ((concept.evidenceRefs || []).length > 0) {
    console.log(`     ${chalk.dim('evidence refs:')} [${concept.evidenceRefs.join(', ')}]`);
  }
  (concept.rationale || []).forEach((line, idx) => {
    console.log(`     ${chalk.dim(`${idx + 1}.`)} ${line}`);
  });

  (concept.slides || []).forEach(slide => {
    const { TYPE_PALETTE: _ } = {};
    console.log(`     ${chalk.dim('↳')} ${slide.type}: ${chalk.italic(`"${slide.title}"`)}`);
    if (slide.summary) console.log(`        ${chalk.dim('summary:')} ${slide.summary}`);
    (slide.rationale || []).forEach((line, idx) => {
      console.log(`        ${chalk.dim(`${idx + 1}.`)} ${line}`);
    });
  });
  console.log('');
}

// ── Help text ─────────────────────────────────────────────────────────────────

export function printHelp() {
  const sep = PHASE_DASH.repeat(SEPARATOR_WIDTH);
  console.log(`
${sep}
  ${chalk.bold('deckgen')} — presentation deck generator

  ${chalk.bold('Usage')}
    deckgen [command] [options]

  ${chalk.bold('Commands')}
    ${chalk.cyan('generate')}   Build a presentation deck   ${chalk.dim('(default)')}
    ${chalk.cyan('plan')}       Generate outline and design plan only
    ${chalk.cyan('doctor')}     Check environment and credentials
    ${chalk.cyan('resume')}     Resume an interrupted run   ${chalk.dim('(not yet available)')}

  ${chalk.bold('Options')}
    --provider <gemini|copilot>   LLM provider  ${chalk.dim('(default: gemini)')}
    --mode     <mode>             journalistic | teaching | corporate | pitch | keynote | workshop
    --brief    <text>             Deck subject; skips the interactive prompt
    --depth    <level>            overview | focused | standard | thorough | comprehensive
    --variant  <theme>            dark | light | alt
    --serve                       Start local server after build
    --no-serve                    Skip serve prompt
    --yes, -y                     Accept defaults; requires --brief for non-interactive use
    --version, -v                 Print version
    --help, -h                    Show this help text

  ${chalk.bold('Non-interactive example')}
    deckgen generate --provider gemini --mode journalistic \\
      --brief "The future of nuclear energy" \\
      --depth standard --variant dark --yes --no-serve

${sep}
`);
}

export function printVersion(pkg) {
  console.log(`${pkg.name} ${pkg.version}`);
}
