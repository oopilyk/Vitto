import { getRecentDays, toDateKey } from '@vitto/core';

interface ActivityCalendarProps {
  activeDateKeys: Set<string>;
  weeks?: number;
}

const DEFAULT_WEEKS = 12;

export function ActivityCalendar({ activeDateKeys, weeks = DEFAULT_WEEKS }: ActivityCalendarProps) {
  const days = getRecentDays(weeks * 7);

  return (
    <div className="activity-calendar" role="img" aria-label={`Activity over the last ${weeks} weeks`}>
      {days.map((day) => {
        const key = toDateKey(day);
        const active = activeDateKeys.has(key);
        return (
          <span
            key={key}
            className={`activity-cell${active ? ' activity-cell-active' : ''}`}
            title={`${day.toLocaleDateString([], { month: 'short', day: 'numeric' })}${active ? ' · active' : ''}`}
          />
        );
      })}
    </div>
  );
}
