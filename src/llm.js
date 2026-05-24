import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { GEMINI_MODEL, SYSTEM_PROMPT } from './constants.js';
import { makeCopilotClient } from './auth.js';

export async function callGemini(ctx, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ctx.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ctx.modeConfig?.systemPrompt || SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    const apiMsg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Gemini API error (${res.status}) model ${GEMINI_MODEL}: ${apiMsg}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content: ' + JSON.stringify(data));
  return text;
}

export async function callCopilot(ctx, prompt) {
  const client = makeCopilotClient(ctx);
  try {
    const session = await client.createSession({
      model: ctx.copilotModel,
      streaming: false,
      workingDirectory: process.cwd(),
      enableConfigDiscovery: false,
      onPermissionRequest: approveAll,
      systemMessage: { mode: 'append', content: ctx.modeConfig?.systemPrompt || SYSTEM_PROMPT },
    });

    const response = await session.sendAndWait({ prompt }, 120_000);
    const text = response?.data?.content;
    if (!text) throw new Error('Copilot returned no content: ' + JSON.stringify(response));
    return text;
  } catch (err) {
    throw new Error(`GitHub Copilot error (model ${ctx.copilotModel}): ${err?.message || String(err)}`);
  } finally {
    await client.stop().catch(() => {});
  }
}

export function callLLM(ctx, prompt) {
  return ctx.provider === 'copilot' ? callCopilot(ctx, prompt) : callGemini(ctx, prompt);
}
