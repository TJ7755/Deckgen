import { callLLM } from '../llm.js';
import { TYPE_PALETTE, allSlides, countSlides, describeProviderCapabilities, getProviderCapabilities } from '../constants.js';
import { parseJSON, preservePlanFields, normaliseVisualFields } from '../utils.js';
import { formatPlanningEvidence, formatContentEvidence } from '../evidence.js';
import chalk from 'chalk';

export async function generateSlideContent(ctx, concepts, brief, assets = [], planningFiles = [], evidence = {}, onProgress = null) {
  const assetsInfo   = assets.length        ? `\nAvailable local images: ${assets.join(', ')}.\n` : '';
  const filesInfo    = planningFiles.length ? `\nProject files: ${planningFiles.join(', ')}.\n`   : '';

  const planningLines = formatPlanningEvidence(evidence);
  const planningInfo  = planningLines.length
    ? `\nPlanning evidence (use for context and citations):\n${planningLines.join('\n')}\n`
    : '';

  const contentLines = formatContentEvidence(evidence.contentEvidence);
  const contentEvidenceInfo = contentLines.length
    ? `\nReal-world data evidence — use these values for chart, stat, and table slides:\n${contentLines.join('\n')}\n`
    : '';

  const providerCapabilities = getProviderCapabilities(ctx.provider);
  const providerCapabilityInfo = `\nProvider capabilities: ${describeProviderCapabilities(ctx.provider)}.\n`;

  const chartInstruction = ctx.provider === 'gemini'
    ? 'Use the googleSearch grounding tool to find real-world data for charts.'
    : providerCapabilities.webSearch === 'native'
      ? contentLines.length
        ? 'Use Codex live web search and the real-world data evidence above to populate chart and stat values with accurate figures.'
        : 'Use Codex live web search to find real-world data for charts, stats, and tables.'
      : contentLines.length
      ? 'Use the real-world data evidence above to populate chart and stat values with accurate figures.'
      : 'Use your knowledge to provide realistic, representative numeric data for charts.';

  const slideList = allSlides(concepts).map(({ image, imageQuery: _iq, ...rest }) => ({ ...rest }));

  const style = ctx.modeConfig?.outlineStyle || 'visual journalism';
  const forbiddenLine = ctx.modeConfig?.allowBullets === true
    ? `Bullet points are permitted: up to 5 per slide, each starting with an action verb or data point. No paragraphs.`
    : `FORBIDDEN: "content" arrays, bullet points, full sentences, explanatory paragraphs.`;

  const txt = await callLLM(
    ctx,
    `Expand this ${style} presentation into full visual content.\n` +
    `Brief: "${brief}"\n` +
    `Slides: ${JSON.stringify(slideList)}\n\n` +
    `${assetsInfo}${filesInfo}${planningInfo}${contentEvidenceInfo}${providerCapabilityInfo}` +
    `Preserve the input slide order exactly. Return one output object for every input slide in the same order.\n` +
    `If a slide already has imageQuery, image, chartConfig, diagram, compareA, compareB, tableHeaders, or tableRows, keep that data unless a richer replacement is required.\n` +
    `Use only the exact field names documented below; do not introduce aliases or extra wrapper fields.\n` +
    `Return STRICT JSON only: {"slides": [/* one object per input slide, in order */]}\n\n` +
    `Rules per type — use ONLY the specified fields, NO "content" arrays, NO bullet points:\n\n` +
    `Title Card:\n` +
    `  {"type":"Title Card","title":"...","tagline":"one evocative phrase — the deck's subhead","imageQuery":"atmospheric search term"}\n\n` +
    `Transition:\n` +
    `  {"type":"Transition","title":"..."}\n\n` +
    `Image Hero (full-bleed photography, most common type):\n` +
    `  {"type":"Image Hero","title":"...","imageQuery":"specific photographic search term","caption":"one-phrase visual description (optional)"}\n\n` +
    `Caption Card (inline image with explanatory label):\n` +
    `  {"type":"Caption Card","title":"...","imageQuery":"...","caption":"short explanatory phrase"}\n\n` +
    `Chart - Bar:\n` +
    `  {"type":"Chart - Bar","title":"...","chartConfig":{/* valid Chart.js config: type, data, options */}} — ${chartInstruction}\n\n` +
    `Chart - Line:\n` +
    `  {"type":"Chart - Line","title":"...","chartConfig":{/* valid Chart.js config */}} — ${chartInstruction}\n\n` +
    `Data Table:\n` +
    `  {"type":"Data Table","title":"...","tableHeaders":["Col1","Col2",...],"tableRows":[["val","val",...],...]}\n\n` +
    `Quote Callout (use a real, verbatim quote):\n` +
    `  {"type":"Quote Callout","title":"...","quote":"verbatim quote text","attribution":"Name, Role/Organisation, Year","imageQuery":"portrait or context photo"}\n\n` +
    `Stat Callout (single striking number or percentage):\n` +
    `  {"type":"Stat Callout","title":"...","stat":"92M","statLabel":"tonnes of textile waste per year — brief explanatory phrase","imageQuery":"visual context for the statistic"}\n\n` +
    `Diagram / flowchart slides:\n` +
    `  {"type":"Diagram","title":"...","diagram":"mermaid flowchart source","caption":"optional short caption"}\n\n` +
    `Comparison (two contrasting items side by side):\n` +
    `  {"type":"Comparison","title":"...","compareA":{"label":"Left item name","value":"optional sub-text","imageQuery":"left image"},"compareB":{"label":"Right item name","value":"optional sub-text","imageQuery":"right image"}}\n\n` +
    `${forbiddenLine}\n` +
    `Write in British English. Be specific and precise — no vague placeholders.`,
    ctx.provider === 'codex' && assets.length
      ? { inputImages: assets }
      : undefined
  );

  const parsed         = parseJSON(txt);
  const enrichedSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  const originalSlides = allSlides(concepts);
  const totalExpected  = countSlides(concepts);

  if (enrichedSlides.length !== totalExpected) {
    process.stderr.write(chalk.yellow(`  Warning: expected ${totalExpected} slides from LLM, received ${enrichedSlides.length}\n`));
  }

  let si = 0;
  return concepts.map(concept => ({
    ...concept,
    slides: (concept.slides || []).map(sourceSlide => {
      const slide = enrichedSlides[si++] || {};
      if (typeof onProgress === 'function') {
        onProgress({ slideNumber: si, conceptTitle: concept.title || 'Untitled', title: slide.title || 'Untitled', type: slide.type || 'Unknown' });
      }
      const outlineSlide = originalSlides[si - 1] || sourceSlide || {};
      const mergedSlide  = normaliseVisualFields(slide, outlineSlide);

      return {
        ...outlineSlide,
        ...slide,
        ...mergedSlide,
        type:  TYPE_PALETTE[slide.type] ? slide.type : (TYPE_PALETTE[outlineSlide.type] ? outlineSlide.type : 'Image Hero'),
        title: slide.title || outlineSlide.title || 'Untitled',
        ...preservePlanFields(outlineSlide),
        ...preservePlanFields(slide),
      };
    }),
  }));
}
