import { callLLM } from '../llm.js';
import { parseJSON } from '../utils.js';

export async function generateDesignSystem(ctx, brief, concepts) {
  const topics = concepts.slice(0, 6).map(c => c.title).join(', ');
  const txt = await callLLM(
    ctx,
    `Choose a cohesive visual design system for a Reveal.js presentation.\n` +
    `Topic: "${brief}"\n` +
    `Key story beats: ${topics}\n\n` +
    `Design requirements (mandatory):\n` +
    `- Pick two distinctive Google Fonts: a display font for headings, a body font for text\n` +
    `- Banned fonts: Inter, Roboto, Arial, Open Sans, Space Grotesk, Helvetica, Nunito, Lato, Montserrat\n` +
    `- ${ctx.modeConfig?.designGuidance || 'The aesthetic must feel specific to the topic — not a generic presentation template. Avoid purple-on-white, warm beige gradients, and startup aesthetics.'}\n` +
    `- Commit to a strong palette: dominant background, high-contrast text, a sharp accent\n` +
    `- The transition/divider background must be visually distinct from the main background\n` +
    `- No surface gradients — solid colours only\n` +
    `- Describe one signature move: what makes this deck visually memorable\n\n` +
    `Return STRICT JSON only:\n` +
    `{\n` +
    `  "aesthetic": "two or three words",\n` +
    `  "displayFont": "exact Google Font name for headings",\n` +
    `  "bodyFont": "exact Google Font name for body text",\n` +
    `  "backgroundColor": "#rrggbb",\n` +
    `  "textColor": "#rrggbb",\n` +
    `  "accentColor": "#rrggbb",\n` +
    `  "sectionDividerColor": "#rrggbb",\n` +
    `  "signatureMove": "one sentence"\n` +
    `}`
  );

  try {
    const parsed = parseJSON(txt);
    const isHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    if (!parsed.displayFont || !parsed.bodyFont || !isHex(parsed.backgroundColor)) return null;
    return parsed;
  } catch {
    return null;
  }
}
