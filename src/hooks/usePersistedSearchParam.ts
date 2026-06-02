import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  adminNavToSearchParams,
  hasAdminNavInUrl,
  loadAdminNavFromStorage,
  parseAdminNavFromSearchParams,
  saveAdminNavFromSearchParams,
  saveAdminNavToStorage,
  type AdminNavSnapshot,
  type AdminSectionId,
  ADMIN_SECTIONS,
} from '../lib/adminNavPersistence';

function readStoredValue<T extends string>(
  snapshot: AdminNavSnapshot | null,
  key: keyof AdminNavSnapshot,
  allowed: readonly T[],
  defaultValue: T,
): T {
  if (!snapshot) return defaultValue;
  const raw = snapshot[key];
  if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  return defaultValue;
}

/** Restore admin URL from sessionStorage when landing on `/admin` without query params. */
export function useRestoreAdminNavFromStorage(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const restoredRef = useRef(false);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (hasAdminNavInUrl(searchParams)) {
      saveAdminNavFromSearchParams(searchParams);
      return;
    }
    const stored = loadAdminNavFromStorage();
    if (stored) {
      setSearchParams(adminNavToSearchParams(stored), { replace: true });
    }
  }, [searchParams, setSearchParams]);
}

/**
 * Enum-like state synced to URL search params and admin sessionStorage snapshot.
 */
export function usePersistedSearchParam<T extends string>(
  paramKey: keyof AdminNavSnapshot,
  allowed: readonly T[],
  defaultValue: T,
): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = useMemo(() => {
    const parsed = parseAdminNavFromSearchParams(searchParams);
    const fromUrl = parsed[paramKey];
    if (typeof fromUrl === 'string' && (allowed as readonly string[]).includes(fromUrl)) {
      return fromUrl as T;
    }
    const stored = loadAdminNavFromStorage();
    return readStoredValue(stored, paramKey, allowed, defaultValue);
  }, [searchParams, paramKey, allowed, defaultValue]);

  const setValue = useCallback(
    (next: T) => {
      setSearchParams(
        (prev) => {
          const parsed = parseAdminNavFromSearchParams(prev);
          const nextNav: AdminNavSnapshot = { ...parsed, [paramKey]: next };
          if (next === defaultValue) {
            delete nextNav[paramKey];
          }
          const nextParams = adminNavToSearchParams(nextNav);
          saveAdminNavToStorage(nextNav);
          return nextParams;
        },
        { replace: true },
      );
    },
    [paramKey, defaultValue, setSearchParams],
  );

  return [value, setValue];
}

export function useAdminSection(): [AdminSectionId, (section: AdminSectionId) => void] {
  return usePersistedSearchParam('section', ADMIN_SECTIONS, 'categories');
}
