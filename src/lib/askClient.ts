import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { AskAnswer, AskTurn } from './ask';
import { claudeClient } from './claude';
import { reason, streamParsed } from './wineListClient';

const MODEL = 'claude-opus-5-5';

export interface AskContext {
  /** One line per wine, from wineLines. */
  lines: string;
  count: number;
  /** Your wine profile and taste summary. */
  about: string;
  year: number;
}

const AnswerSchema = z.object({
  from_your_wines: z.boolean().describe('True when the answer draws on my list of wines.'),
  headline: z.string().describe('A one-line headline answering the question, without its last clause. E.g. "Three bottles, and two are".'),
  headline_italic: z.string().describe('The headline’s closing clause, shown in italics. E.g. "Mencía from Bierzo." Keep the whole headline under 12 words.'),
  body: z.string().describe('The answer in plain words, 2–5 short sentences. Name my wines by producer and name. No markdown, no bullet lists.'),
  wine_ids: z.array(z.string()).describe('The ids (in square brackets in my list) of every wine of mine the answer names, in the order named. Empty if none.'),
  store_actions: z.array(z.enum(['totalwine', 'pogos'])).describe('Only when the answer recommends buying something: the stores to look at, Total Wine first. Otherwise empty.'),
  colour: z.enum(['red', 'white', 'any']).describe('The colour of wine the answer is about, if one; else "any".'),
});

// Keep the schema and the app's shape in step.
const toAnswer = (o: z.infer<typeof AnswerSchema>): AskAnswer => ({
  fromList: o.from_your_wines,
  headline: o.headline,
  italic: o.headline_italic,
  body: o.body,
  wineIds: o.wine_ids,
  stores: o.store_actions,
  colour: o.colour,
});

function system(c: AskContext): string {
  return [
    'You are Palate, my wine app, answering my questions in a chat. Be warm, specific and brief, like a knowledgeable friend.',
    'What you can answer:',
    '- Questions about my wines, from the list below only.',
    '- General wine questions (decanting, styles, pairing, regions) from your own knowledge, linked to one of my bottles when one fits.',
    '- "What should I try next?"-style recommendations from my ratings; then offer the stores.',
    '- Anything not about wine: answer only "I’m just for wine." (headline "I’m just for", italic "wine.", empty body).',
    'Rules:',
    '- Never invent facts about my bottles. Ratings, prices, notes, bottles at home, tasted dates and best years come only from the list. If the list doesn’t have the answer, say so.',
    '- You cannot change my wines; never offer to.',
    '- Don’t mention costs of this app or of your answers.',
    `It is ${c.year}.`,
    c.about,
    `My ${c.count} wines (id | wine | colour | place | grapes | price paid | my rating | bottles at home | tasted | best years | my notes):\n${c.lines}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** An earlier answer, as it goes back to Claude in the conversation. */
function answerText(a: AskAnswer): string {
  return [`${a.headline} ${a.italic}`.trim(), a.body, a.wineIds.length ? `(Wines named: ${a.wineIds.join(', ')})` : ''].filter(Boolean).join('\n');
}

/** What streamed so far, for showing the answer as it's written. */
function partialAnswer(p: unknown): Partial<AskAnswer> | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Partial<z.infer<typeof AnswerSchema>>;
  return { fromList: o.from_your_wines, headline: o.headline ?? '', italic: o.headline_italic ?? '', body: o.body ?? '' };
}

export async function askWinesWithClaude(
  apiKey: string,
  c: AskContext,
  turns: AskTurn[],
  question: string,
  signal?: AbortSignal,
  onPartial?: (a: Partial<AskAnswer>) => void,
): Promise<{ ok: true; answer: AskAnswer } | { ok: false; reason: string }> {
  // Browser use is intentional: the key is the user's own. No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 300_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const t of turns) if (t.a) messages.push({ role: 'user', content: t.q }, { role: 'assistant', content: answerText(t.a) });
  messages.push({ role: 'user', content: question });
  try {
    const { stop, parsed } = await streamParsed<z.infer<typeof AnswerSchema>>(
      client,
      {
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // The wine list is the big, unchanging part: cached, so follow-up questions cost much less.
        system: [{ type: 'text', text: system(c), cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'medium', format: betaZodOutputFormat(AnswerSchema) },
        messages,
      },
      signal,
      onPartial && ((p) => {
        const a = partialAnswer(p);
        if (a) onPartial(a);
      }),
    );
    if (stop === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (stop === 'max_tokens' || !parsed) return { ok: false, reason: 'the answer was cut short — try again' };
    return { ok: true, answer: toAnswer(parsed) };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const why = reason(e);
    if (why) return { ok: false, reason: why };
    throw e;
  }
}
