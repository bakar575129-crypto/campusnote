import {useEffect, useSyncExternalStore} from 'react';
import {api} from './api';

export interface PlanInfo {
  plan: {id: string; name: string; storageBytes: number; notebookLimit: number | null; ocrDailyLimit: number; subscription: null | {status: string; periodEnd: number; cancelAtPeriodEnd: boolean; provider: string}};
  plans: {id: string; name: string; storageBytes: number; notebookLimit: number | null; ocrDailyLimit: number; priceMonthly: number; currency: string}[];
  billingEnabled: boolean;
  supportEmail: string;
  usage: {usedBytes: number; fileCount: number; quotaBytes: number};
  notebooks: {active: number; limit: number | null};
  ocr: {today: number; limit: number};
  files: {id: string; kind: string; mime: string; name: string; size: number; createdAt: number; inUse: boolean}[];
}

let info: PlanInfo | null = null;
const subs = new Set<() => void>();
export async function refreshPlan() {
  try { info = await api<PlanInfo>('/api/storage'); for (const s of subs) s(); } catch { /* çevrimdışı: son bilinen */ }
  return info;
}
export function usePlan() {
  const value = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => info);
  useEffect(() => { if (!info) void refreshPlan(); }, []);
  return value;
}
export const getPlan = () => info;
