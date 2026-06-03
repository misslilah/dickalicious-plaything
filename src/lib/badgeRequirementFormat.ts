import type { Badge, Category, Task } from '../types';

const SECONDS_PER_DAY = 86400;

export function formatBadgeDurationDays(seconds: number): string {
  const days = seconds / SECONDS_PER_DAY;
  const formatted = Number.isInteger(days)
    ? String(days)
    : parseFloat(days.toFixed(2)).toString();
  return `${formatted} ${days === 1 ? 'day' : 'days'}`;
}

export function formatBadgeRequirementSummary(
  badge: Badge,
  tasks: Task[],
  categories: Category[],
): string | null {
  const req = badge.requirement;
  if (!req) return null;

  if (req.type === 'bubble_pops') {
    const min = req.minBubblePops ?? 0;
    return `Bubble pops: ${min}`;
  }

  const timePart =
    req.durationSeconds != null && req.durationSeconds > 0
      ? ` · ${formatBadgeDurationDays(req.durationSeconds)} total`
      : ' · complete once';

  if (req.type === 'task') {
    const task = tasks.find((t) => t.id === req.taskId);
    return `Task: ${task?.title ?? 'Unknown task'}${timePart}`;
  }

  const category = categories.find((c) => c.id === req.categoryId);
  return `Category: ${category?.name ?? 'Unknown category'}${timePart}`;
}

export function formatBadgeUnlockHint(
  badge: Badge,
  tasks: Task[],
  categories: Category[],
): string {
  const auto = formatBadgeRequirementSummary(badge, tasks, categories);
  if (badge.description.trim()) {
    return auto ? `${badge.description} (${auto})` : badge.description;
  }
  return auto ?? badge.title;
}
