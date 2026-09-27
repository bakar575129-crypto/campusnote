// XP, seviye ve rozetler: sunucu hesaplar (bkz. server/xp.mjs); istemci yalnızca gösterir. Son bilinen durum cihazda
// saklanır, böylece çevrimdışıyken de seviye görünür.
import {useEffect, useState} from 'react';
import {api} from '@/lib/api';

export interface Progress {
  xp: number; today: number; level: number; start: number; next: number; streak: number;
  recent: {amount: number; reason: string; label: string; at: number}[];
  badges: {id: string; icon: string; name: string; desc: string; earnedAt: number | null}[];
  rules: {reason: string; label: string; amount: number}[];
}

const KEY = 'kalemlik-progress';
let cached: Progress | null = null;
try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { cached = null; }
const subs = new Set<(p: Progress) => void>();
let inflight: Promise<void> | null = null;

export function refreshProgress(): Promise<void> {
  if (!navigator.onLine) return Promise.resolve();
  inflight ||= api<Progress>('/api/progress').then(p => {
    cached = p;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* depolama kapalı */ }
    for (const f of subs) f(p);
  }).catch(() => {}).finally(() => { inflight = null; });
  return inflight;
}

/** XP durumunu getirir; kayıtlar eşitlendikçe sunucu XP verdiği için birkaç saniyelik gecikmeyle yeniler. */
export function useProgress(): Progress | null {
  const [p, setP] = useState(cached);
  useEffect(() => {
    subs.add(setP);
    void refreshProgress();
    const t = setInterval(() => void refreshProgress(), 60_000);
    return () => { subs.delete(setP); clearInterval(t); };
  }, []);
  return p;
}

export const levelPercent = (p: Progress) => Math.min(100, Math.round(((p.xp - p.start) / Math.max(1, p.next - p.start)) * 100));
