import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { resizeImage } from './image';
import { LabelReadError, type LabelReading } from './labelReader';

const MODEL = 'claude-opus-5-5';

const LabelSchema = z.object({
  is_wine_label: z.boolean().describe('False if the photo does not show a wine bottle or label.'),
  producer: z.string().describe('Winery / producer / house, as printed. Empty if not visible.'),
  wine_name: z
    .string()
    .describe('Cuvée or wine name, e.g. "Lytton Springs" or "Brut Réserve". If the wine is named only by grape or appellation, use that. Empty if unknown.'),
  vintage: z.string().describe('Four-digit year as printed, "NV" for non-vintage, or empty if not visible.'),
  country: z.string().describe('Country in English, e.g. "France", "United States". Empty if not determinable.'),
  region: z.string().describe('Most specific region or appellation shown, e.g. "Sancerre", "Dry Creek Valley".'),
  grapes: z.array(z.string()).describe('Grape varieties printed on the label, or the standard grapes for the appellation if clearly implied. Empty if unsure.'),
  style: z.enum(['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown']),
  confidence: z.enum(['high', 'medium', 'low']).describe('How sure you are about producer and wine name.'),
  uncertain: z.string().describe('One short sentence about anything unreadable or guessed; empty if nothing.'),
});


const PROMPT = `This is a photo of a wine bottle or label, taken by someone standing in a wine store.
Read the label and fill in the fields. Only report what the label shows or what follows directly from it (for example, the country of a named appellation, or that Sancerre blanc is Sauvignon Blanc). Never invent a vintage or cuvée name you cannot read — leave it empty and say so in "uncertain". Keep the producer's spelling and accents as printed.`;

// Keep the schema and the public type in step.
const _check: z.infer<typeof LabelSchema> extends LabelReading ? true : never = true;
void _check;

async function toBase64Jpeg(photo: Blob): Promise<string> {
  // ~1500px is plenty for label text and keeps the upload quick on mobile data.
  const { blob } = await resizeImage(photo, 1500);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function readLabelWithClaude(apiKey: string, photo: Blob, signal?: AbortSignal): Promise<LabelReading> {
  // Browser use is intentional: the key belongs to the person using the app and never leaves their device except to call Anthropic.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 });
  const data = await toBase64Jpeg(photo);

  try {
    const response = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(LabelSchema) },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal') throw new LabelReadError('Claude couldn’t read this photo. Try another angle.');
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new LabelReadError('Couldn’t make sense of the label. Try a closer photo.');
    return response.parsed_output;
  } catch (e) {
    if (e instanceof LabelReadError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new LabelReadError('Your Anthropic API key was rejected. Check it on the My palate page.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new LabelReadError('Your API key doesn’t have access to this model.');
    if (e instanceof Anthropic.RateLimitError) throw new LabelReadError('Too many requests right now — try again in a moment.');
    if (e instanceof Anthropic.APIConnectionError) throw new LabelReadError('No connection. Reading labels needs internet — type the name instead.');
    if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) {
      throw new LabelReadError('Your Anthropic account is out of credit. Add credit under Plans & Billing at console.anthropic.com.');
    }
    if (e instanceof Anthropic.APIError) throw new LabelReadError(`Anthropic API error (${e.status ?? 'unknown'}). Try again.`);
    throw e;
  }
}

/** Checks a key with a tiny request so the settings page can say whether it works. */
export async function testApiKey(key: string): Promise<true | string> {
  const client = new Anthropic({ apiKey: key.trim(), dangerouslyAllowBrowser: true, maxRetries: 0 });
  try {
    await client.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: 'hi' }] });
    return true;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return 'Anthropic says this key isn’t valid — it may have been deleted or not copied completely. Create a new key in the Anthropic Console and tap Copy right away.';
    }
    if (e instanceof Anthropic.PermissionDeniedError) return 'This key isn’t allowed to use Claude. Check the key’s workspace permissions in the Anthropic Console.';
    if (e instanceof Anthropic.APIConnectionError) return 'Couldn’t reach Anthropic. Check your connection.';
    if (e instanceof Anthropic.APIError) return `Anthropic returned an error (${e.status ?? 'unknown'}).`;
    return 'Couldn’t check the key.';
  }
}

