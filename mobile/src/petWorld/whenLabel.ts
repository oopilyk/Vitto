/** "Today", "Yesterday", or the weekday for this past week; a date before that. */
export const whenLabel = (iso: string, now = new Date()): string => {
  const at = new Date(iso);
  const startOf = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return at.toLocaleDateString('en-US', { weekday: 'long' });
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
