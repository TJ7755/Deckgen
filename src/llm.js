import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { Codex } from '@openai/codex-sdk';
import fs from 'fs/promises';
import path from 'path';
import { GEMINI_MODEL, SYSTEM_PROMPT, DEFAULT_CODEX_MODEL } from './constants.js';
import { makeCopilotClient } from './auth.js';
import { parseJsonObject } from './utils.js';

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

async function loadCodexThreadId(ctx) {
  if (ctx.codexThreadId) return ctx.codexThreadId;

  const persistedPath = path.join(process.cwd(), '.deckgen', 'codex-thread-id.json');
  try {
    const text = await fs.readFile(persistedPath, 'utf-8');
    const data = parseJsonObject(text);
    const threadId = String(data?.threadId || '').trim();
    if (threadId) {
      ctx.codexThreadId = threadId;
      return threadId;
    }
  } catch {}

  return '';
}

async function saveCodexThreadId(threadId) {
  if (!threadId) return;

  const dir = path.join(process.cwd(), '.deckgen');
  const filePath = path.join(dir, 'codex-thread-id.json');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ threadId, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
}

export async function callCodex(ctx, prompt, options = {}) {
  const codex = new Codex({
    apiKey: ctx.codexApiKey || undefined,
    config: ctx.codexConfig || undefined,
  });
  const threadOptions = {
    model: ctx.codexModel || DEFAULT_CODEX_MODEL,
    workingDirectory: process.cwd(),
    skipGitRepoCheck: true,
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
    networkAccessEnabled: true,
    webSearchMode: 'live',
  };

  try {
    const threadId = await loadCodexThreadId(ctx);
    const thread = threadId
      ? codex.resumeThread(threadId, {
          ...threadOptions,
        })
      : codex.startThread(threadOptions);

    const input = Array.isArray(options.inputImages) && options.inputImages.length
      ? [
          { type: 'text', text: prompt },
          ...options.inputImages.map(imagePath => ({ type: 'local_image', path: imagePath })),
        ]
      : prompt;

    const streamed = await thread.runStreamed(input);
    let finalResponse = '';

    for await (const event of streamed.events) {
      if (event.type === 'thread.started' && event.thread_id) {
        ctx.codexThreadId = event.thread_id;
        await saveCodexThreadId(event.thread_id).catch(() => {});
      }
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        finalResponse = event.item.text || finalResponse;
      }
      if (event.type === 'turn.failed') {
        throw new Error(event.error?.message || 'Codex turn failed');
      }
    }

    ctx.codexThreadId = thread.id || ctx.codexThreadId || null;
    await saveCodexThreadId(ctx.codexThreadId).catch(() => {});

    if (!finalResponse) throw new Error('Codex returned no content');
    return finalResponse;
  } catch (err) {
    throw new Error(`Codex error (model ${ctx.codexModel || DEFAULT_CODEX_MODEL}): ${err?.message || String(err)}`);
  }
}

export function callLLM(ctx, prompt, options = {}) {
  if (ctx.provider === 'copilot') return callCopilot(ctx, prompt);
  if (ctx.provider === 'codex') return callCodex(ctx, prompt, options);
  return callGemini(ctx, prompt);
}
