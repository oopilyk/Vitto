import { useMemo, useState } from 'react';
import { type HealthEvent, type TrendWindow, stepTrends } from '@vitto/core';
import { SegmentedControl, SettingsPage, SettingsSection } from '../components/settingsKit';
import { StatGrid, StatTile, TrendBars } from '../components/TrendBars';

interface Props {
  events: HealthEvent[];
  stepGoal: number;
  petName: string;
  /** Distance in miles rather than kilometres. */
  miles?: boolean;
  onClose: () => void;
}

const WINDOWS: { value: `${TrendWindow}`; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
];

/** An average walking stride. */
const METRES_PER_STEP = 0.762;
const count = (value: number) => Math.round(value).toLocaleString();
const shortDay = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Steps over the last week or month, from the Today card's "Trends": each
 * day against the goal, the average, the best day, the run of goal days, and
 * whether weekends are the slow part of the week.
 */
export function StepTrendsScreen({ events, stepGoal, petName, miles = false, onClose }: Props) {
  const [window, setWindow] = useState<TrendWindow>(7);
  const trends = useMemo(() => stepTrends(events, stepGoal, window), [events, stepGoal, window]);
  const over = `${trends.countedDays} ${trends.countedDays === 1 ? 'day' : 'days'}`;

  return (
    <SettingsPage title="Step trends" backLabel="Today" onBack={onClose}>
      <SegmentedControl options={WINDOWS} value={`${window}`} onChange={(value) => setWindow(Number(value) as TrendWindow)} />

      <SettingsSection first title="Steps each day" description={`Against your goal of ${count(stepGoal)}. Today is lighter: it isn't over yet.`}>
        <TrendBars bars={trends.days.map((day) => ({ date: day.date, value: day.steps, isToday: day.isToday }))} goal={stepGoal} format={count} unit="steps" />
      </SettingsSection>

      <SettingsSection
        title="At a glance"
        description={trends.average !== null ? `Averages over ${over}, not counting today or days with no steps.` : 'Once a few days of steps are in, your averages show up here.'}
      >
        <StatGrid>
          <StatTile
            value={trends.average === null ? '—' : count(trends.average)}
            label="steps a day"
            note={trends.change === null ? undefined : `${trends.change > 0 ? '+' : ''}${trends.change}% vs the ${window} days before`}
          />
          <StatTile value={`${trends.goalDays}/${window}`} label="days at goal" />
          <StatTile
            value={String(trends.streak)}
            label={trends.streak === 1 ? 'goal day in a row' : 'goal days in a row'}
            note={trends.streak > 0 ? `${petName} loves the routine` : 'Hit the goal today to start one'}
          />
          <StatTile value={trends.best ? count(trends.best.steps) : '—'} label="best day" note={trends.best ? shortDay(trends.best.date) : undefined} />
          <StatTile value={count(trends.total)} label={`steps in ${window} days`} note={`About ${(trends.total * (miles ? METRES_PER_STEP / 1609.344 : METRES_PER_STEP / 1000)).toFixed(1)} ${miles ? 'mi' : 'km'}`} />
          {trends.weekdayAverage !== null && trends.weekendAverage !== null ? (
            <StatTile
              value={count(trends.weekendAverage)}
              label="a weekend day"
              note={`${count(trends.weekdayAverage)} on weekdays`}
            />
          ) : null}
        </StatGrid>
      </SettingsSection>
    </SettingsPage>
  );
}
