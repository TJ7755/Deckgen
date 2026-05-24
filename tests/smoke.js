/**
 * Smoke tests for Deckgen.
 * These tests exercise pure functions and module boundaries without
 * touching the LLM, network, or filesystem beyond /tmp.
 */

import { strict as assert } from 'assert';
import chalk from 'chalk';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ${chalk.green('✓')}  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ${chalk.red('✕')}  ${name}`);
    console.log(`     ${chalk.dim(err.message)}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ${chalk.green('✓')}  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ${chalk.red('✕')}  ${name}`);
    console.log(`     ${chalk.dim(err.message)}`);
    failed++;
  }
}

// ── src/utils.js ─────────────────────────────────────────────────────────────

console.log(chalk.bold('\n  src/utils.js'));
const {
  slugify, makeDeckStamp, normalizeProvider, normalizeApiKey,
  truncateText, parseJSON, preservePlanFields, normaliseVisualFields,
  extractSearchTerms, formatElapsed,
} = await import('../src/utils.js');

test('slugify converts brief to URL-safe slug', () => {
  assert.equal(slugify('The Future of Nuclear Energy'), 'the_future_of_nuclear_energy');
});

test('slugify truncates at 40 characters', () => {
  assert.ok(slugify('a'.repeat(60)).length <= 40);
});

test('makeDeckStamp produces timestamp string', () => {
  assert.match(makeDeckStamp(), /^\d{8}_\d{6}$/);
});

test('normalizeProvider: gemini variant', () => {
  assert.equal(normalizeProvider('GEMINI'), 'gemini');
  assert.equal(normalizeProvider(''),       'gemini');
  assert.equal(normalizeProvider(null),     'gemini');
});

test('normalizeProvider: copilot variant', () => {
  assert.equal(normalizeProvider('copilot'), 'copilot');
  assert.equal(normalizeProvider('Copilot'), 'copilot');
});

test('normalizeApiKey strips prefix', () => {
  assert.equal(normalizeApiKey('GEMINI_API_KEY=abc123'), 'abc123');
  assert.equal(normalizeApiKey('  abc123  '),            'abc123');
});

test('truncateText preserves short strings', () => {
  assert.equal(truncateText('hello'), 'hello');
});

test('truncateText truncates long strings with ellipsis', () => {
  const result = truncateText('a'.repeat(300), 100);
  assert.ok(result.length <= 100);
  assert.ok(result.endsWith('…'));
});

test('extractSearchTerms filters stop words', () => {
  const terms = extractSearchTerms('the future of nuclear energy and the world');
  assert.ok(!terms.includes('the'));
  assert.ok(!terms.includes('and'));
  assert.ok(terms.includes('future') || terms.includes('nuclear') || terms.includes('energy'));
});

test('formatElapsed formats milliseconds', () => {
  assert.equal(formatElapsed(500),  '500ms');
  assert.equal(formatElapsed(2500), '2.5s');
});

test('parseJSON handles plain JSON', () => {
  const result = parseJSON('{"a":1}');
  assert.equal(result.a, 1);
});

test('parseJSON strips markdown fences', () => {
  const result = parseJSON('```json\n{"a":2}\n```');
  assert.equal(result.a, 2);
});

test('parseJSON extracts JSON from surrounding text', () => {
  const result = parseJSON('Here is the result: {"a":3} and that is all');
  assert.equal(result.a, 3);
});

test('preservePlanFields returns defaults for missing fields', () => {
  const result = preservePlanFields({});
  assert.equal(result.summary, '');
  assert.deepEqual(result.rationale, []);
  assert.deepEqual(result.evidenceRefs, []);
});

test('preservePlanFields preserves existing fields', () => {
  const result = preservePlanFields({ summary: 'test', rationale: ['1. reason'], evidenceRefs: [1, 2] });
  assert.equal(result.summary, 'test');
  assert.deepEqual(result.rationale, ['1. reason']);
  assert.deepEqual(result.evidenceRefs, [1, 2]);
});

test('normaliseVisualFields picks imageQuery from aliases', () => {
  const result = normaliseVisualFields({ imagePrompt: 'a cat' });
  assert.equal(result.imageQuery, 'a cat');
});

test('normaliseVisualFields picks chartConfig from aliases', () => {
  const config = { type: 'bar', data: {} };
  const result = normaliseVisualFields({ chartData: config });
  assert.deepEqual(result.chartConfig, config);
});

// ── src/constants.js ──────────────────────────────────────────────────────────

console.log(chalk.bold('\n  src/constants.js'));
const { TYPE_PALETTE, DEPTH_SETTINGS, FALLBACK_CONCEPTS, countSlides, allSlides } = await import('../src/constants.js');

test('TYPE_PALETTE contains required slide types', () => {
  assert.ok(TYPE_PALETTE['Title Card']);
  assert.ok(TYPE_PALETTE['Image Hero']);
  assert.ok(TYPE_PALETTE['Chart - Bar']);
  assert.ok(TYPE_PALETTE['Quote Callout']);
  assert.ok(TYPE_PALETTE['Stat Callout']);
});

test('DEPTH_SETTINGS has all five levels', () => {
  const keys = Object.keys(DEPTH_SETTINGS);
  assert.ok(keys.includes('overview'));
  assert.ok(keys.includes('focused'));
  assert.ok(keys.includes('standard'));
  assert.ok(keys.includes('thorough'));
  assert.ok(keys.includes('comprehensive'));
});

test('countSlides totals slides across concepts', () => {
  const concepts = [
    { slides: [{ type: 'Image Hero' }, { type: 'Stat Callout' }] },
    { slides: [{ type: 'Chart - Bar' }] },
  ];
  assert.equal(countSlides(concepts), 3);
});

test('allSlides flattens slides from all concepts', () => {
  const concepts = [
    { slides: [{ type: 'Image Hero' }] },
    { slides: [{ type: 'Chart - Bar' }, { type: 'Quote Callout' }] },
  ];
  const slides = allSlides(concepts);
  assert.equal(slides.length, 3);
  assert.equal(slides[0].type, 'Image Hero');
  assert.equal(slides[2].type, 'Quote Callout');
});

test('FALLBACK_CONCEPTS has opener and payoff roles', () => {
  assert.ok(FALLBACK_CONCEPTS.some(c => c.role === 'opener'));
  assert.ok(FALLBACK_CONCEPTS.some(c => c.role === 'payoff'));
});

// ── src/pipeline/html.js ──────────────────────────────────────────────────────

console.log(chalk.bold('\n  src/pipeline/html.js'));
const { buildRevealHTML, sanitiseGeneratedHtml } = await import('../src/pipeline/html.js');

test('buildRevealHTML returns valid HTML document', () => {
  const concepts = [
    { role: 'opener', title: 'Open', slides: [{ type: 'Title Card', title: 'Test Deck', tagline: 'A test deck' }] },
    { role: 'payoff', title: 'Close', slides: [{ type: 'Image Hero', title: 'The End' }] },
  ];
  const html = buildRevealHTML(concepts, 'dark', 'Smoke test brief', {});
  assert.ok(html.includes('<!doctype html>'));
  assert.ok(html.includes('Smoke test brief'));
  assert.ok(html.includes('Test Deck'));
});

test('buildRevealHTML escapes HTML entities in titles', () => {
  const concepts = [{
    role: 'opener', title: 'Open',
    slides: [{ type: 'Title Card', title: '<script>alert("xss")</script>' }],
  }];
  const html = buildRevealHTML(concepts, 'dark', 'Test', {});
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('sanitiseGeneratedHtml fixes escaped script tags', () => {
  const input = 'prefix <\\/script> suffix';
  const output = sanitiseGeneratedHtml(input);
  assert.ok(output.includes('</script>'));
  assert.ok(!output.includes('<\\/script>'));
});

test('sanitiseGeneratedHtml adds doctype if missing', () => {
  const output = sanitiseGeneratedHtml('<html></html>');
  assert.ok(output.startsWith('<!doctype html>'));
});

test('sanitiseGeneratedHtml does not duplicate doctype', () => {
  const input = '<!doctype html>\n<html></html>';
  const output = sanitiseGeneratedHtml(input);
  const count = (output.match(/<!doctype html>/gi) || []).length;
  assert.equal(count, 1);
});

// ── src/evidence.js ───────────────────────────────────────────────────────────

console.log(chalk.bold('\n  src/evidence.js'));
const { formatPlanningEvidence } = await import('../src/evidence.js');

test('formatPlanningEvidence formats web evidence', () => {
  const evidence = {
    webEvidence: [{ title: 'Example', url: 'https://example.com', snippet: 'Some text' }],
    workspaceEvidence: [],
  };
  const lines = formatPlanningEvidence(evidence);
  assert.ok(lines[0].startsWith('[1]'));
  assert.ok(lines[0].includes('web:'));
  assert.ok(lines[0].includes('Example'));
});

test('formatPlanningEvidence numbers refs sequentially across sources', () => {
  const evidence = {
    webEvidence: [
      { title: 'A', url: 'https://a.com', snippet: '' },
      { title: 'B', url: 'https://b.com', snippet: '' },
    ],
    workspaceEvidence: [
      { source: 'README.md', snippet: 'context' },
    ],
  };
  const lines = formatPlanningEvidence(evidence);
  assert.ok(lines[0].startsWith('[1]'));
  assert.ok(lines[1].startsWith('[2]'));
  assert.ok(lines[2].startsWith('[3]'));
  assert.ok(lines[2].includes('workspace:'));
});

// ── src/cli.js ────────────────────────────────────────────────────────────────

console.log(chalk.bold('\n  src/cli.js (parseArgs indirectly via context construction)'));

const { default: child_process } = await import('child_process');
const { promisify } = await import('util');
const exec = promisify(child_process.exec);

await testAsync('--help exits cleanly', async () => {
  const { stdout } = await exec('node index.js --help', { cwd: '/Users/TJ7755/Documents/Coding/Deckgen' });
  assert.ok(stdout.includes('deckgen'));
  assert.ok(stdout.includes('generate'));
  assert.ok(stdout.includes('doctor'));
});

await testAsync('--version exits cleanly', async () => {
  const { stdout } = await exec('node index.js --version', { cwd: '/Users/TJ7755/Documents/Coding/Deckgen' });
  assert.match(stdout.trim(), /deckgen \d+\.\d+/);
});

await testAsync('doctor command runs without error', async () => {
  const { stdout, stderr } = await exec('node index.js doctor', {
    cwd: '/Users/TJ7755/Documents/Coding/Deckgen',
    timeout: 20000,
  }).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || '', code: err.code }));
  assert.ok(stdout.includes('doctor') || stdout.includes('System'));
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${chalk.bold('Results')}: ${chalk.green(`${passed} passed`)}, ${failed > 0 ? chalk.red(`${failed} failed`) : chalk.dim('0 failed')}\n`);

if (failed > 0) process.exit(1);
