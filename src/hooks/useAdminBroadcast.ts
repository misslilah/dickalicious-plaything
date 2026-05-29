import { useCallback, useEffect } from 'react';
import {
  sendAdminMessage,
  subscribeAdminMessages,
  type AdminMessagePayload,
} from './useOnlinePresence';

export type { AdminMessagePayload };

export type ReceivedAdminMessage = {
  message: string;
  senderUsername: string;
};

export function useAdminMessageReceiver(
  userId: string | undefined,
  onMessage: (payload: ReceivedAdminMessage) => void,
) {
  useEffect(() => {
    if (!userId) return;

    return subscribeAdminMessages((payload) => {
      if (payload.senderUserId === userId) return;
      if (payload.targetUserId !== null && payload.targetUserId !== userId) {
        return;
      }
      onMessage({
        message: payload.message,
        senderUsername: payload.senderUsername,
      });
    });
  }, [userId, onMessage]);
}

export function useSendAdminBroadcast(
  senderUserId: string | undefined,
  senderUsername: string | undefined,
) {
  return useCallback(
    async (message: string, targetUserId: string | null) => {
      if (!senderUserId || !senderUsername?.trim()) {
        return { ok: false, error: 'Not signed in.' };
      }
      const trimmed = message.trim();
      if (!trimmed) {
        return { ok: false, error: 'Message cannot be empty.' };
      }
      return sendAdminMessage(
        trimmed,
        targetUserId,
        senderUserId,
        senderUsername.trim(),
      );
    },
    [senderUserId, senderUsername],
  );
}
