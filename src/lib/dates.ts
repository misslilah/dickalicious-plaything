export function todayKey(resetHour = 0): string {
  const now = new Date();
  const adjusted = new Date(now);
  if (now.getHours() < resetHour) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return formatDateKey(adjusted);
}

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isYesterday(dateKey: string, resetHour = 0): boolean {
  const today = parseDateKey(todayKey(resetHour));
  const target = parseDateKey(dateKey);
  const diff = today.getTime() - target.getTime();
  return diff >= 86400000 && diff < 172800000;
}

export function formatDisplayDate(key: string): string {
  const d = parseDateKey(key);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
