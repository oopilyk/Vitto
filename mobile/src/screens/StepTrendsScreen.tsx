import { useMemo, useState } from 'react';
import { type HealthEvent, type TrendWindow, stepTrends } from '@vitto/core';
import { SegmentedControl, SettingsPage, SettingsSection } from '../components/settingsKit';
import { StatGrid, StatTile, TrendBars } from '../components/TrendBars';
import { formatLocale, t, tn } from '../i18n';

interface Props {
  events: HealthEvent[];
  stepGoal: number;
  petName: string;
  /** Distance in miles rather than kilometres. */
  miles?: boolean;
  onClose: () => void;
}

const WINDOWS: { value: `${TrendWindow}`; label: string }[] = [
  { value: '7', label: t('7 days') },
  { value: '30', label: t('30 days') },
];

/** An average walking stride. */
const METRES_PER_STEP = 0.762;
const count = (value: number) => Math.round(value).toLocaleString(formatLocale());
const shortDay = (date: Date) => date.toLocaleDateString(formatLocale(), { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Steps over the last week or month, from the Today card's "Trends": each
 * day against the goal, the average, the best day, the run of goal days, and
 * whether weekends are the slow part of the week.
 */
export function StepTrendsScreen({ events, stepGoal, petName, miles = false, onClose }: Props) {
  const [window, setWindow] = useState<TrendWindow>(7);
  const trends = useMemo(() => stepTrends(events, stepGoal, window), [events, stepGoal, window]);

  return (
    <SettingsPage title={t('Step trends')} backLabel={t('Today')} onBack={onClose}>
      <SegmentedControl options={WINDOWS} value={`${window}`} onChange={(value) => setWindow(Number(value) as TrendWindow)} />

      <SettingsSection first title={t('Steps each day')} description={t("Against your goal of {steps}. Today is lighter: it isn't over yet.", { steps: count(stepGoal) })}>
        <TrendBars bars={trends.days.map((day) => ({ date: day.date, value: day.steps, isToday: day.isToday }))} goal={stepGoal} format={count} unit={t('steps')} />
      </SettingsSection>

      <SettingsSection
        title={t('At a glance')}
        description={
          trends.average !== null
            ? tn(trends.countedDays, 'Averages over {count} day, not counting today or days with no steps.', 'Averages over {count} days, not counting today or days with no steps.')
            : t('Once a few days of steps are in, your averages show up here.')
        }
      >
        <StatGrid>
          <StatTile
            value={trends.average === null ? '—' : count(trends.average)}
            label={t('steps a day')}
            note={trends.change === null ? undefined : t('{change}% vs the {days} days before', { change: `${trends.change > 0 ? '+' : ''}${trends.change}`, days: window })}
          />
          <StatTile value={`${trends.goalDays}/${window}`} label={t('days at goal')} />
          <StatTile
            value={String(trends.streak)}
            label={tn(trends.streak, 'goal day in a row', 'goal days in a row')}
            note={trends.streak > 0 ? t('{pet} loves the routine', { pet: petName }) : t('Hit the goal today to start one')}
          />
          <StatTile value={trends.best ? count(trends.best.steps) : '—'} label={t('best day')} note={trends.best ? shortDay(trends.best.date) : undefined} />
          <StatTile
            value={count(trends.total)}
            label={t('steps in {days} days', { days: window })}
            note={
              miles
                ? t('About {distance} mi', { distance: (trends.total * (METRES_PER_STEP / 1609.344)).toFixed(1) })
                : t('About {distance} km', { distance: (trends.total * (METRES_PER_STEP / 1000)).toFixed(1) })
            }
          />
          {trends.weekdayAverage !== null && trends.weekendAverage !== null ? (
            <StatTile
              value={count(trends.weekendAverage)}
              label={t('a weekend day')}
              note={t('{steps} on weekdays', { steps: count(trends.weekdayAverage) })}
            />
          ) : null}
        </StatGrid>
      </SettingsSection>
    </SettingsPage>
  );
}
