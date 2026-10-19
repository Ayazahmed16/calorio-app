import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qs } from '../api';
import { dayLabel, num } from '../format';
import { Card, ErrorBox, Loading, PageHeader, ProgressBar, Segmented, StatCard } from '../components/ui';

export default function Analytics() {
  const [days, setDays] = useState(7);
  const { data, error, isLoading } = useQuery({ queryKey: ['analytics', days], queryFn: () => api.get(`/analytics/${qs({ days })}`), placeholderData: keepPreviousData });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  const d = data;
  const hasMacros = d.protein_share || d.carbs_share || d.fat_share;

  return (
    <div>
      <PageHeader eyebrow={`${dayLabel(d.range_start, { month: 'short', day: 'numeric', year: 'numeric' })} → ${dayLabel(d.range_end, { month: 'short', day: 'numeric', year: 'numeric' })}`} title="Analytics">
        <Segmented options={[[7, '7 days'], [30, '30 days'], [90, '90 days']]} value={days} onChange={setDays} />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatCard label="Avg calories / day" sub={`over ${d.days_logged} logged day${d.days_logged === 1 ? '' : 's'}`}>{d.avg_calories}</StatCard>
        <StatCard label="Avg protein / day" sub={`goal ${num(d.goal.protein, 0)}g`}>{num(d.avg_protein)}<span className="text-lg text-neutral-400 ml-1">g</span></StatCard>
        <StatCard label="Avg steps / day" sub={`best day ${d.best_steps}`}>{d.avg_steps}</StatCard>
        <StatCard label="Days on target" sub={`at or under ${num(d.goal.calories, 0)} cal`}>{d.on_target}<span className="text-lg text-neutral-400 ml-1">/ {d.days_logged}</span></StatCard>
      </div>

      <Card className="p-6 md:p-8 mb-6">
        <div className="flex justify-between items-center mb-8 flex-wrap gap-2">
          <h2 className="text-xl font-bold text-white">Calories per day</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500"><span className="inline-block w-2 h-2 bg-white mr-1" />within goal <span className="inline-block w-2 h-2 bg-red-400 mx-1 ml-3" />over goal</span>
        </div>
        <div className="flex items-end gap-1 md:gap-2 h-56" role="img" aria-label="Calories per day bar chart">
          {d.rows.map((r) => (
            <div key={r.date} className="group relative flex-1 h-full flex flex-col justify-end items-center min-w-0">
              {r.cal > 0 ? (
                <>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1f1f1f] border border-white/20 px-2 py-1 font-mono text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                    {dayLabel(r.date, { month: 'short', day: 'numeric' })} · {r.cal}
                  </div>
                  <div className={`w-full rounded-t-sm transition-all duration-500 group-hover:brightness-125 ${r.over ? 'bg-red-400' : 'bg-white'}`} style={{ height: `${r.height}%` }} />
                </>
              ) : <div className="w-full h-[2px] bg-white/10" />}
            </div>
          ))}
        </div>
        {d.show_labels && (
          <div className="flex gap-1 md:gap-2 mt-3">
            {d.rows.map((r) => <span key={r.date} className="flex-1 text-center font-mono text-[9px] text-neutral-500 min-w-0 overflow-hidden">{r.label}</span>)}
          </div>
        )}
      </Card>

      <Card className="p-6 md:p-8">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-white">Macro split</h2><span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">share of calories</span></div>
        {hasMacros ? (
          <>
            <div className="flex h-3 rounded-full overflow-hidden mb-6">
              <div className="bg-white" style={{ width: `${d.protein_share}%` }} /><div className="bg-neutral-400" style={{ width: `${d.carbs_share}%` }} /><div className="bg-neutral-600" style={{ width: `${d.fat_share}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-4 font-mono text-xs">
              {[['Protein', d.protein_share, 'bg-white'], ['Carbs', d.carbs_share, 'bg-neutral-400'], ['Fat', d.fat_share, 'bg-neutral-600']].map(([l, v, c]) => (
                <div key={l}><span className={`inline-block w-2 h-2 mr-2 ${c}`} /><span className="text-neutral-400">{l}</span><div className="text-2xl text-white mt-1">{v}%</div></div>
              ))}
            </div>
          </>
        ) : <p className="font-mono text-xs text-neutral-500">Log some meals to see your macro split.</p>}
        <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-neutral-600">Calories burned in this period: {d.total_burned}</p>
        <div className="mt-4"><ProgressBar value={0} /></div>
      </Card>
    </div>
  );
}
