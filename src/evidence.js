import fs from 'fs/promises';
import path from 'path';
import {
  fetchTextWithTimeout,
  decodeHtmlEntities,
  stripHtml,
  truncateText,
  extractSearchTerms,
  extractSnippet,
} from './utils.js';

// ── Web search ────────────────────────────────────────────────────────────────

function extractDuckDuckGoLinks(html, limit = 4) {
  const results = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkRe)) {
    const href = decodeHtmlEntities(match[1]);
    const rawTitle = stripHtml(match[2]);
    let url = href;

    try {
      const parsed = new URL(href, 'https://html.duckduckgo.com/');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) url = decodeURIComponent(uddg);
    } catch {}

    if (!rawTitle || !url) continue;
    results.push({ title: rawTitle, url });
    if (results.length >= limit) break;
  }
  return results;
}

async function searchWebEvidence(query, limit = 4) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];

  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
  const html = await fetchTextWithTimeout(searchUrl, 7000);
  if (!html) return [];

  const links = extractDuckDuckGoLinks(html, limit);
  const items = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const pageHtml = await fetchTextWithTimeout(link.url, 7000);
    const pageText = stripHtml(pageHtml || '');
    items.push({
      kind: 'web',
      number: i + 1,
      title: link.title,
      url: link.url,
      snippet: pageText ? truncateText(pageText, 240) : '',
    });
  }

  return items;
}

// ── Workspace search ──────────────────────────────────────────────────────────

async function searchWorkspaceEvidence(brief, planningFiles = []) {
  const terms = extractSearchTerms(brief);
  const evidence = [];

  for (const fileName of planningFiles.slice(0, 5)) {
    try {
      const filePath = path.join(process.cwd(), fileName);
      const fileText = await fs.readFile(filePath, 'utf-8');
      const snippet = extractSnippet(fileText, terms.length ? terms : [fileName], 240);
      evidence.push({ kind: 'workspace', source: fileName, snippet });
    } catch {}
  }

  return evidence;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function collectPlanningEvidence(brief, planningFiles = [], modeConfig = {}) {
  const suffix = modeConfig.evidenceQuerySuffix ? ` ${modeConfig.evidenceQuerySuffix}` : '';
  const webEvidence = await searchWebEvidence(`${brief}${suffix}`);
  const workspaceEvidence = await searchWorkspaceEvidence(brief, planningFiles);
  return { webEvidence, workspaceEvidence };
}

export function formatPlanningEvidence(evidence = {}) {
  const lines = [];
  let ref = 1;

  for (const item of evidence.webEvidence || []) {
    const snippet = item.snippet ? ` — ${item.snippet}` : '';
    lines.push(`[${ref}] web: ${item.title} (${item.url})${snippet}`);
    ref += 1;
  }

  for (const item of evidence.workspaceEvidence || []) {
    const label = item.anchor ? `${item.source}#${item.anchor}` : item.source;
    lines.push(`[${ref}] workspace: ${label} — ${item.snippet}`);
    ref += 1;
  }

  return lines;
}

// ── Content evidence (Copilot grounding substitute) ───────────────────────────

const DATA_SLIDE_TYPES = new Set(['Chart - Bar', 'Chart - Line', 'Stat Callout', 'Data Table', 'Quote Callout']);

export async function collectContentEvidence(slides, brief) {
  const dataSlides = (slides || []).filter(s => DATA_SLIDE_TYPES.has(s.type)).slice(0, 8);
  if (dataSlides.length === 0) return {};

  const results = await Promise.allSettled(
    dataSlides.map(async slide => {
      const query = `${brief} ${slide.title} data statistics`;
      const items = await searchWebEvidence(query, 2);
      return { title: slide.title, items };
    })
  );

  const bySlide = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.items.length > 0) {
      bySlide[r.value.title] = r.value.items;
    }
  }
  return bySlide;
}

export function formatContentEvidence(contentEvidence = {}) {
  const lines = [];
  let ref = 1;
  for (const [slideTitle, items] of Object.entries(contentEvidence)) {
    lines.push(`Slide "${slideTitle}":`);
    for (const item of items) {
      const snippet = item.snippet ? ` — ${item.snippet}` : '';
      lines.push(`  [${ref}] ${item.title} (${item.url})${snippet}`);
      ref += 1;
    }
  }
  return lines;
}
