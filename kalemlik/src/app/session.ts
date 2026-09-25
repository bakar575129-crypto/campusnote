import {useSyncExternalStore} from 'react';
import {api} from '@/lib/api';
import type {User} from '@/lib/types';
import {loadUser, syncNow, unloadUser} from '@/lib/store';

export interface AppConfig {version: string; registrationOpen: boolean; ocrEnabled: boolean; mailEnabled: boolean; billingEnabled: boolean}
type State = {status: 'loading' | 'signed-out' | 'signed-in'; user: User | null; config: AppConfig | null; offline: boolean};

const LAST_USER = 'klm:last-user';
let state: State = {status: 'loading', user: null, config: null, offline: false};
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => { state = {...state, ...patch}; for (const s of subs) s(); };
export const useSession = () => useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => state);
export const getSession = () => state;

function remember(user: User | null) {
  try { if (user) localStorage.setItem(LAST_USER, JSON.stringify(user)); else localStorage.removeItem(LAST_USER); } catch { /* özel pencere */ }
}
function remembered(): User | null {
  try { const raw = localStorage.getItem(LAST_USER); return raw ? JSON.parse(raw) as User : null; } catch { return null; }
}

async function enter(user: User) {
  remember(user);
  await loadUser(user.id);
  set({status: 'signed-in', user});
  void syncNow();
}

/** Açılışta oturumu doğrular. İnternet yoksa son kullanıcının cihazdaki verisiyle çevrimdışı açılır. */
export async function bootstrap() {
  api<AppConfig>('/api/config').then(config => set({config})).catch(() => {});
  try {
    const {user} = await api<{user: User}>('/api/auth/me');
    await enter(user);
  } catch (error) {
    const e = error as {status?: number};
    const last = remembered();
    if (e.status === 0 && last) { await loadUser(last.id); set({status: 'signed-in', user: last, offline: true}); return; }
    if (e.status === 401) remember(null);
    set({status: 'signed-out', user: null});
  }
}

export async function login(email: string, password: string) {
  const {user} = await api<{user: User}>('/api/auth/login', {method: 'POST', json: {email, password}});
  await enter(user);
}
export async function register(name: string, email: string, password: string) {
  const {user} = await api<{user: User}>('/api/auth/register', {method: 'POST', json: {name, email, password}});
  await enter(user);
}
export async function logout() {
  await api('/api/auth/logout', {method: 'POST'}).catch(() => {});
  remember(null);
  unloadUser();
  set({status: 'signed-out', user: null});
}
/** Sunucu oturumu reddettiğinde: veriler cihazda kalır, kullanıcı yeniden giriş yapınca eşitlenir. */
export function sessionExpired() {
  unloadUser();
  set({status: 'signed-out', user: null});
}
export function setUser(user: User) { remember(user); set({user}); }
