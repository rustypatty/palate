import type { WineTake } from '../types';

/**
 * The coach's answer about one snapped bottle: a verdict you can act on, what the wine is, how it
 * will taste, how it compares with wines you've rated, value and serving. One Claude request
 * (about 3¢, no web search) using your profile and ratings; the catalog supplies the facts.
 */

export interface BottleCoach {
  verdict: 'buy' | 'consider' | 'skip';
  headline: string;
  what_it_is: string;
  taste: string;
  fit: string;
  value: string;
  serve: string;
  caveat: string;
}

export interface CoachRequest {
  producer: string;
  name: string;
  vintage: string;
  region: string;
  country: string;
  style: string;
  grapes: string[];
  shelfPrice: number | null;
  /** Lowest recent US retail from the catalog, when known. */
  typicalPrice: number | null;
  store: string;
  /** Your profile and rated wines (shelfContext). */
  context: string;
}

export type CoachOutcome = { ok: true; coach: BottleCoach } | { ok: false; reason: string };

export async function coachBottle(req: CoachRequest, signal?: AbortSignal): Promise<CoachOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./coachClient')).coachBottleWithClaude(apiKey, req, signal);
}

/** A wine already in Palate, to describe for you (no verdict: it's yours or on your list). */
export interface DescribeRequest {
  producer: string;
  name: string;
  vintage: string;
  region: string;
  country: string;
  style: string;
  grapes: string[];
  price: number | null;
  /** Your rating, notes and whether you own it or want to try it. */
  mine: string;
  /** Your profile and rated wines (shelfContext). */
  context: string;
}

export type DescribeOutcome = { ok: true; take: Omit<WineTake, 'writtenAt' | 'rating'> } | { ok: false; reason: string };

/** Palate's written description of one wine (about 3¢, no web search). */
export async function describeWine(req: DescribeRequest, signal?: AbortSignal): Promise<DescribeOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./coachClient')).describeWineWithClaude(apiKey, req, signal);
}

export const VERDICT_LABEL: Record<BottleCoach['verdict'], string> = { buy: 'Buy it', consider: 'Worth considering', skip: 'Skip it' };
