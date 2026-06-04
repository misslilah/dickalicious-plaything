import { useState, type DragEvent } from 'react';

export type SortableItemProps = {
  draggable: boolean;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
};

export function useSortableList(
  itemIds: string[],
  onReorder: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string } | void>,
  { disabled = false, busy = false }: { disabled?: boolean; busy?: boolean } = {},
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sortableEnabled = !disabled && !busy && itemIds.length > 1;

  const getSortableItemProps = (id: string): SortableItemProps => ({
    draggable: sortableEnabled,
    isDragging: dragId === id,
    isOver: overId === id && dragId !== id,
    onDragStart: (event) => {
      if (!sortableEnabled) return;
      if ((event.target as HTMLElement).closest('button')) {
        event.preventDefault();
        return;
      }
      setDragId(id);
      setOverId(null);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
    onDragOver: (event) => {
      if (!sortableEnabled || !dragId || dragId === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setOverId(id);
    },
    onDrop: (event) => {
      event.preventDefault();
      if (!sortableEnabled || !dragId || dragId === id) return;
      const from = itemIds.indexOf(dragId);
      const to = itemIds.indexOf(id);
      setDragId(null);
      setOverId(null);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...itemIds];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      void onReorder(next);
    },
  });

  return { getSortableItemProps, sortableEnabled };
}
