import { useCallback, useState } from 'react';
import {
  useAdminMessageReceiver,
  type ReceivedAdminMessage,
} from '../hooks/useAdminBroadcast';
import { useAppStore } from '../hooks/useAppStore';
import { AdminMessagePopup } from './AdminMessagePopup';

export function AdminMessageListener() {
  const { session } = useAppStore();
  const [queue, setQueue] = useState<ReceivedAdminMessage[]>([]);

  const handleMessage = useCallback((payload: ReceivedAdminMessage) => {
    setQueue((prev) => [...prev, payload]);
  }, []);

  useAdminMessageReceiver(session?.userId, handleMessage);

  const current = queue[0];
  if (!current) return null;

  return (
    <AdminMessagePopup
      message={current.message}
      senderUsername={current.senderUsername}
      onDismiss={() => setQueue((prev) => prev.slice(1))}
    />
  );
}
