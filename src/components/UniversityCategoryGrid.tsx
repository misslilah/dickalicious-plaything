import { useState } from 'react';
import { CategoryCard } from './CategoryCard';
import { useAppStore } from '../hooks/useAppStore';
import {
  canJoinCategory,
  getCategoryCompletionStats,
  getCategoryUnlockBlockReason,
  isCategoryFullyComplete,
  isCategoryUnlocked,
} from '../lib/categoryProgression';
import type { Category } from '../types';

export function UniversityCategoryGrid({
  categories,
  tutorialCategoryId,
}: {
  categories: Category[];
  tutorialCategoryId?: string | null;
}) {
  const { state, joinCategory, isEffectiveAdmin } = useAppStore();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');

  const taskCountByCategory = (categoryId: string) =>
    state.tasks.filter(
      (task) => (task.taskScope ?? 'category') === 'category' && task.categoryId === categoryId,
    ).length;

  const handleJoin = async (categoryId: string) => {
    setJoinError('');
    setJoiningId(categoryId);
    const result = await joinCategory(categoryId);
    setJoiningId(null);
    if (!result.ok) setJoinError(result.error);
  };

  if (categories.length === 0) {
    return <p className="muted">No categories here yet.</p>;
  }

  return (
    <>
      {joinError ? (
        <p className="login-error" role="alert">
          {joinError}
        </p>
      ) : null}
      <div className="category-grid">
        {categories.map((cat) => {
          const isMember = state.joinedCategoryIds.includes(cat.id);
          const unlocked = isCategoryUnlocked(state, cat);
          const lockReason = getCategoryUnlockBlockReason(state, cat);
          const completion = getCategoryCompletionStats(state, cat.id);
          const joinGate = canJoinCategory(state, cat, state.progress.currentLevel);
          return (
            <CategoryCard
              key={cat.id}
              category={cat}
              taskCount={taskCountByCategory(cat.id)}
              completionPercent={completion.percent}
              completedCount={completion.completed}
              isMember={isMember}
              isCompleted={isCategoryFullyComplete(state, cat.id)}
              isUnlocked={unlocked}
              lockReason={lockReason}
              canJoin={joinGate.ok}
              joinDisabledReason={joinGate.ok ? null : joinGate.reason}
              onJoin={isEffectiveAdmin ? undefined : () => void handleJoin(cat.id)}
              joining={joiningId === cat.id}
              tutorialTarget={
                cat.id === tutorialCategoryId ? 'category-card' : undefined
              }
            />
          );
        })}
      </div>
    </>
  );
}
