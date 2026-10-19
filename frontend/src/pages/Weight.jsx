import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError, qs } from '../api';
import { dayLabel, num, todayISO } from '../format';
import { Button, Card, ConfirmDialog, Empty, ErrorBox, Field, Icon, Loading, PageHeader, Pager, StatCard } from '../components/ui';
import { useToast } from '../toast';

function Trend({ series }) {
  const chart = useMemo(() => {
    if (series.length < 2) return null;
    const lo = Math.min(...series.map((e) => e.weight_kg)), hi = Math.max(...series.map((e) => e.weight_kg));
    const span = hi - lo || 1;
    const t0 = new Date(series[0].date).getTime(), t1 = new Date(series[series.length - 1].date).getTime();
    const tspan = Math.max(t1 - t0, 1);
    const pts = series.map((e) => ({
      x: 20 + ((new Date(e.date).getTime() - t0) / tspan) * 560, y: 20 + (1 - (e.weight_kg - lo) / span) * 160, e,
    }));
    return { pts, lo, hi };
  }, [series]);
  if (!chart) return <p className="font-mono text-xs text-neutral-500 py-16 text-center">Log at least two weights to see your trend.</p>;
  return (
    <>
      <div className="flex justify-between items-center mb-3"><h3 className="text-lg font-bold text-white">Last 90 days</h3><span className="font-mono text-[10px] text-neutral-500">{num(chart.lo)} – {num(chart.hi)} kg</span></div>
      <svg viewBox="0 0 600 200" className="w-full h-48" role="img" aria-label="Weight trend">
        {[20, 100, 180].map((y) => <line key={y} x1="20" y1={y} x2="580" y2={y} stroke="rgba(255,255,255,.08)" />)}
        <polyline points={chart.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {chart.pts.map((p) => <circle key={p.e.id} cx={p.x} cy={p.y} r="3.5" fill="#0a0a0a" stroke="#fff" strokeWidth="2"><title>{dayLabel(p.e.date, { month: 'short', day: 'numeric' })}: {num(p.e.weight_kg)} kg</title></circle>)}
      </svg>
    </>
  );
}

export default function Weight() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ date: todayISO(), weight_kg: '' });
  const [err, setErr] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, error, isLoading } = useQuery({ queryKey: ['weight', page], queryFn: () => api.get(`/weight/${qs({ page })}`), placeholderData: keepPreviousData });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['weight'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); };
  const save = useMutation({
    mutationFn: () => api.post('/weight/', { date: form.date, weight_kg: form.weight_kg === '' ? '' : Number(form.weight_kg) }),
    onSuccess: (r) => { toast('Weight saved'); setForm({ ...form, weight_kg: '' }); setErr(null); refresh(); return r; },
    onError: (e) => setErr(e),
  });
  const del = useMutation({
    mutationFn: (id) => api.del(`/weight/${id}/`),
    onSuccess: () => { toast('Weight entry deleted'); setPendingDelete(null); refresh(); },
    onError: (e) => { toast(e.message, 'error'); setPendingDelete(null); },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  const { latest, lowest, change_30d: change } = data;

  return (
    <div>
      <PageHeader eyebrow="Body" title="Weight" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <StatCard label="Current" sub={latest ? dayLabel(latest.date, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined}>{latest ? <>{num(latest.weight_kg)}<span className="text-lg text-neutral-400 ml-1">kg</span></> : '—'}</StatCard>
        <StatCard label="Change (30 days)" sub="needs an entry 30+ days old">{change !== null && change !== undefined ? <>{change > 0 ? '+' : ''}{num(change)}<span className="text-lg text-neutral-400 ml-1">kg</span></> : '—'}</StatCard>
        <StatCard label="Lowest" sub={lowest ? dayLabel(lowest.date, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined}>{lowest ? <>{num(lowest.weight_kg)}<span className="text-lg text-neutral-400 ml-1">kg</span></> : '—'}</StatCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <h2 className="text-lg font-bold text-white mb-5">Log weight</h2>
          <form onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }} noValidate>
            <Field label="Date" htmlFor="w-date" error={fieldError(err, 'date')}><input id="w-date" className="field" type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Weight (kg)" htmlFor="w-kg" error={fieldError(err, 'weight_kg')} hint="Saving a date that already has an entry updates it.">
              <input id="w-kg" className="field" type="number" step="0.1" min="20" max="400" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
            </Field>
            <Button type="submit" className="w-full" loading={save.isPending}>Save</Button>
          </form>
        </Card>
        <Card className="lg:col-span-2 p-6"><Trend series={data.series} /></Card>
      </div>

      <Card className="overflow-hidden">
        {data.results.length === 0 && <Empty>No weight logged yet.</Empty>}
        {data.results.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-6 md:px-8 py-4 border-b border-white/5 hover:bg-white/5">
            <span className="font-mono text-xs text-neutral-400"><span className="hidden sm:inline">{dayLabel(e.date)}</span><span className="sm:hidden">{dayLabel(e.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
            <span className="text-white font-semibold whitespace-nowrap">{num(e.weight_kg)} kg</span>
            <button type="button" title="Delete" onClick={() => setPendingDelete(e)} className="p-2 text-neutral-500 hover:text-red-400 cursor-pointer"><Icon name="delete" size={18} /></button>
          </div>
        ))}
      </Card>
      <Pager page={data.page} numPages={data.num_pages} onPage={setPage} />
      <ConfirmDialog open={!!pendingDelete} title="Delete this weight entry?" busy={del.isPending}
        message={pendingDelete ? `${num(pendingDelete.weight_kg)} kg on ${pendingDelete.date}.` : ''}
        onConfirm={() => del.mutate(pendingDelete.id)} onCancel={() => setPendingDelete(null)} />
    </div>
  );
}
