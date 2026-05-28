import { useCallback, useState } from 'react';
import { useAdminMessageReceiver } from '../hooks/useAdminBroadcast';
import { useAppStore } from '../hooks/useAppStore';
import { AdminMessagePopup } from './AdminMessagePopup';

export function AdminMessageListener() {
  const { session } = useAppStore();
  const [queue, setQueue] = useState<string[]>([]);

  const handleMessage = useCallback((text: string) => {
    setQueue((prev) => [...prev, text]);
  }, []);

  useAdminMessageReceiver(session?.userId, handleMessage);

  const current = queue[0];
  if (!current) return null;

  return (
    <AdminMessagePopup
      message={current}
      onDismiss={() => setQueue((prev) => prev.slice(1))}
    />
  );
}
