import type { AppState } from '../types';
import { createInitialState } from './seed';

/** Local game state is no longer persisted; Supabase holds shared + user data. */
export function loadState(): AppState {
  return createInitialState();
}

export function saveState(_state: AppState): boolean {
  return true;
}

export function resetState(): AppState {
  return createInitialState();
}
