import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

// ── Text utilities ────────────────────────────────────────────────────────────

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const slugify = s =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'untitled';

export const makeDeckStamp = () =>
  new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');

export function normalizeProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'copilot' ? 'copilot' : 'gemini';
}

export function normalizeApiKey(value) {
  return String(value || '').trim().replace(/^GEMINI_API_KEY=/, '').trim();
}

export function truncateText(value, max = 220) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function stripHtml(value) {
  return decodeHtmlEntities(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

export function normaliseFileName(value, fallback = 'asset') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || fallback;
}

export function extractSearchTerms(text) {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'about',
    'plan', 'mode', 'should', 'make', 'sure', 'also', 'deck', 'decks', 'slide',
    'slides', 'reveal', 'revealjs',
  ]);
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9.+-]{1,}/g) || [];
  const unique = [];
  for (const token of tokens) {
    if (stopWords.has(token)) continue;
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= 8) break;
  }
  return unique;
}

export function extractSnippet(text, terms, max = 220) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  for (const term of terms) {
    const index = lower.indexOf(String(term).toLowerCase());
    if (index !== -1) {
      const start = Math.max(0, index - 120);
      const end = Math.min(source.length, index + Math.max(max, term.length + 80));
      return truncateText(source.slice(start, end).replace(/\s+/g, ' '), max);
    }
  }
  return truncateText(source.replace(/\s+/g, ' '), max);
}

export function formatElapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── JSON / data parsing ───────────────────────────────────────────────────────

export function parseJSON(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const firstIdx = cleaned.search(/[\[{]/);
  if (firstIdx === -1) return JSON.parse(cleaned);

  const openChar = cleaned[firstIdx];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  for (let i = firstIdx; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(firstIdx, i + 1);
        try { return JSON.parse(candidate); } catch { break; }
      }
    }
  }
  return JSON.parse(cleaned);
}

export function preservePlanFields(source = {}) {
  return {
    summary:      source.summary || '',
    rationale:    Array.isArray(source.rationale)    ? source.rationale    : [],
    evidenceRefs: Array.isArray(source.evidenceRefs) ? source.evidenceRefs : [],
    notes:        source.notes || '',
    searchNotes:  source.searchNotes || '',
  };
}

export function normaliseVisualFields(source = {}, fallback = {}) {
  const pickText = (...values) => {
    for (const v of values) if (typeof v === 'string' && v.trim()) return v;
    return '';
  };
  const pickObject = (...values) => {
    for (const v of values) {
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) return v;
    }
    return null;
  };

  const diagramSource = pickText(
    source.diagram, source.mermaid, source.flowchart, source.diagramSource, source.diagramConfig,
    fallback.diagram, fallback.mermaid, fallback.flowchart, fallback.diagramSource, fallback.diagramConfig,
  );

  const chartConfig = pickObject(
    source.chartConfig, source.chart, source.chartData, source.chartSpec,
    fallback.chartConfig, fallback.chart, fallback.chartData, fallback.chartSpec,
  );

  const compareA = pickObject(source.compareA, fallback.compareA);
  const compareB = pickObject(source.compareB, fallback.compareB);

  return {
    ...source,
    imageQuery: pickText(source.imageQuery, source.imagePrompt, source.searchQuery, fallback.imageQuery, fallback.imagePrompt, fallback.searchQuery),
    image:      pickText(source.image, source.imageUrl, source.imageURL, source.backgroundImage, fallback.image, fallback.imageUrl, fallback.imageURL, fallback.backgroundImage),
    chartConfig,
    diagram: diagramSource,
    compareA: compareA ? normaliseVisualFields(compareA) : compareA,
    compareB: compareB ? normaliseVisualFields(compareB) : compareB,
  };
}

// ── File system ───────────────────────────────────────────────────────────────

export async function pathExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

export async function getLocalAssets() {
  try {
    const files = await fs.readdir(process.cwd());
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    return files.filter(f => allowed.includes(path.extname(f).toLowerCase()));
  } catch { return []; }
}

export async function getPlanningFiles() {
  try {
    const entries = await fs.readdir(process.cwd(), { withFileTypes: true });
    const blocked = new Set(['.git', 'node_modules', 'output', 'src']);
    return entries
      .filter(e => e.isFile() && !e.name.startsWith('.') && !blocked.has(e.name))
      .map(e => e.name)
      .filter(n => !['.env', '.DS_Store', 'package-lock.json'].includes(n));
  } catch { return []; }
}

export async function upsertEnvVar(key, value) {
  const envPath = path.join(process.cwd(), '.env');
  const line = `${key}=${value}`;
  let existing = '';
  try {
    existing = await fs.readFile(envPath, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (pattern.test(existing)) {
    const updated = existing.replace(pattern, line);
    await fs.writeFile(envPath, updated.endsWith('\n') ? updated : `${updated}\n`, 'utf-8');
    return;
  }
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  await fs.writeFile(envPath, `${existing}${separator}${line}\n`, 'utf-8');
}

export async function downloadBinary(url, destinationPath, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Deckgen/1.0' }, signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    await fs.writeFile(destinationPath, Buffer.from(await res.arrayBuffer()));
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTextWithTimeout(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Deckgen/1.0' },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// ── Subprocess ────────────────────────────────────────────────────────────────

export function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'pipe' });
    let errText = '';
    child.stdout.on('data', chunk => process.stdout.write(chunk));
    child.stderr.on('data', chunk => { errText += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) { resolve(); return; }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}${errText ? `: ${errText.trim()}` : ''}`));
    });
  });
}

export function runCommandQuiet(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'pipe' });
    let errText = '';
    child.stderr.on('data', chunk => { errText += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) { resolve(); return; }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}${errText ? `: ${errText.trim()}` : ''}`));
    });
  });
}
