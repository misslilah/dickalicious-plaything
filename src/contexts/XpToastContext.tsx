import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { XpGainToast } from '../components/XpGainToast';

interface XpToastContextValue {
  showXpGain: (amount: number) => void;
}

const XpToastContext = createContext<XpToastContextValue | null>(null);

export function XpToastProvider({ children }: { children: ReactNode }) {
  const [amount, setAmount] = useState<number | null>(null);

  const showXpGain = useCallback((xp: number) => {
    if (xp <= 0) return;
    setAmount(xp);
  }, []);

  const dismiss = useCallback(() => {
    setAmount(null);
  }, []);

  const value = useMemo(() => ({ showXpGain }), [showXpGain]);

  return (
    <XpToastContext.Provider value={value}>
      {children}
      <XpGainToast amount={amount} onDismiss={dismiss} />
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
