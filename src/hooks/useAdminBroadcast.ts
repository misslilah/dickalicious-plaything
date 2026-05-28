import { useCallback, useEffect } from 'react';
import {
  sendAdminMessage,
  subscribeAdminMessages,
  type AdminMessagePayload,
} from './useOnlinePresence';

export type { AdminMessagePayload };

export function useAdminMessageReceiver(
  userId: string | undefined,
  onMessage: (message: string) => void,
) {
  useEffect(() => {
    if (!userId) return;

    return subscribeAdminMessages((payload) => {
      if (payload.senderUserId === userId) return;
      if (payload.targetUserId !== null && payload.targetUserId !== userId) {
        return;
      }
      onMessage(payload.message);
    });
  }, [userId, onMessage]);
}

export function useSendAdminBroadcast(senderUserId: string | undefined) {
  return useCallback(
    async (message: string, targetUserId: string | null) => {
      if (!senderUserId) {
        return { ok: false, error: 'Not signed in.' };
      }
      const trimmed = message.trim();
      if (!trimmed) {
        return { ok: false, error: 'Message cannot be empty.' };
      }
      return sendAdminMessage(trimmed, targetUserId, senderUserId);
    },
    [senderUserId],
  );
}
