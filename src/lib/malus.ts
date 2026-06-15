/** Shown when a non-admin user has malus and cannot start or complete tasks. */
export const MALUS_TASK_BLOCK_MESSAGE =
  'You have an active malus. Complete a punishment to clear it before doing tasks.';

export function hasActiveMalus(malusPoints: number): boolean {
  return malusPoints > 0;
}

/** Non-admin users are blocked from tasks when they have any malus. */
export function isMalusBlockingTasks(
  malusPoints: number,
  isAdmin: boolean,
): boolean {
  return !isAdmin && hasActiveMalus(malusPoints);
}
