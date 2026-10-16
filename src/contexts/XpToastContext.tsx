import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { XpGainToast, type XpGainBurst } from '../components/XpGainToast';
import { useAppStore } from '../hooks/useAppStore';
import { playXpGainSound } from '../lib/xpGainSound';

interface XpToastContextValue {
  showXpGain: (amount: number) => void;
}

const XpToastContext = createContext<XpToastContextValue | null>(null);

export function XpToastProvider({ children }: { children: ReactNode }) {
  const { state, session, authReady, dataLoading, adminUserPreview } = useAppStore();
  const [burst, setBurst] = useState<XpGainBurst | null>(null);
  const lastXpRef = useRef<number | null>(null);
  const burstIdRef = useRef(0);
  const hydrateKey = `${session?.userId ?? 'anon'}:${adminUserPreview ? '1' : '0'}`;
  const hydrateKeyRef = useRef(hydrateKey);

  const showXpGain = useCallback((xp: number) => {
    const amount = Math.round(xp);
    if (amount <= 0) return;
    playXpGainSound();
    burstIdRef.current += 1;
    setBurst({ id: burstIdRef.current, amount });
  }, []);

  useEffect(() => {
    if (hydrateKeyRef.current !== hydrateKey) {
      hydrateKeyRef.current = hydrateKey;
      lastXpRef.current = null;
    }
    if (!authReady || dataLoading) {
      lastXpRef.current = null;
      return;
    }

    const current = state.progress.totalXp;
    const previous = lastXpRef.current;
    if (previous == null) {
      lastXpRef.current = current;
      return;
    }

    const delta = current - previous;
    lastXpRef.current = current;
    if (delta > 0) showXpGain(delta);
  }, [
    authReady,
    dataLoading,
    hydrateKey,
    showXpGain,
    state.progress.totalXp,
  ]);

  const dismiss = useCallback(() => {
    setBurst(null);
  }, []);

  const value = useMemo(() => ({ showXpGain }), [showXpGain]);

  return (
    <XpToastContext.Provider value={value}>
      {children}
      <XpGainToast burst={burst} onDismiss={dismiss} />
    </XpToastContext.Provider>
  );
}

export function useXpToast(): XpToastContextValue {
  const ctx = useContext(XpToastContext);
  if (!ctx) {
    throw new Error('useXpToast must be used within XpToastProvider');
  }
  return ctx;
}

export function useOptionalXpToast(): XpToastContextValue | null {
  return useContext(XpToastContext);
}
