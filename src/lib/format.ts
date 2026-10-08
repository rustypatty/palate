import type { Wine } from '../types';
import { fold } from './text';

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function formatPrice(n: number): string {
  return Number.isInteger(n) ? money.format(n) : moneyCents.format(n);
}

export function vintageLabel(w: Pick<Wine, 'vintage'>): string {
  return w.vintage === null ? '' : String(w.vintage);
}

export function wineTitle(w: Pick<Wine, 'producer' | 'name'>): string {
  return w.name || w.producer || 'Untitled wine';
}

/** "Marchesi di Barolo Barolo": who made it and which wine, without saying the producer twice. */
export function producerAndName(w: Pick<Wine, 'producer' | 'name'>): string {
  const p = w.producer.trim();
  const n = w.name.trim();
  if (!p || !n) return n || p || 'Untitled wine';
  return fold(n).startsWith(fold(p)) ? n : `${p} ${n}`;
}

/** "Producer Name 2019" — used for image search queries and accessible labels. */
export function fullName(w: Pick<Wine, 'producer' | 'name' | 'vintage'>): string {
  return [w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' ').trim();
}

export function placeLabel(w: Pick<Wine, 'region' | 'country'>): string {
  return [w.region, w.country].filter(Boolean).join(', ');
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
