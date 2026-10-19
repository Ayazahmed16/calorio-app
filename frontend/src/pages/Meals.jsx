import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../api';
import { MEAL_TYPES, dayLabel, num } from '../format';
import { Button, Card, ConfirmDialog, Empty, ErrorBox, Icon, Loading, LinkButton, PageHeader, Pager } from '../components/ui';
import FoodThumb from '../components/FoodThumb';
import { useToast } from '../toast';

export default function Meals() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const f = { type: params.get('type') || '', from: params.get('from') || '', to: params.get('to') || '', page: Number(params.get('page') || 1) };
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ['meals', f], queryFn: () => api.get(`/meals/${qs(f)}`), placeholderData: keepPreviousData,
  });
  const del = useMutation({
    mutationFn: (id) => api.del(`/meals/${id}/`),
    onSuccess: () => { toast('Meal deleted'); setPendingDelete(null); queryClient.invalidateQueries({ queryKey: ['meals'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => { toast(e.message, 'error'); setPendingDelete(null); },
  });

  const update = (patch) => {
    const next = { ...f, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'page' && v === 1))));
  };
  const filtered = !!(f.type || f.from || f.to);

  return (
    <div>
      <PageHeader eyebrow="History" title="All Meals"><LinkButton to="/meals/new">Add Meal</LinkButton></PageHeader>

      <form className="flex flex-wrap items-end gap-4 mb-6" onSubmit={(e) => e.preventDefault()}>
        <div className="min-w-40">
          <label className="lbl" htmlFor="f-type">Meal type</label>
          <select id="f-type" className="field" value={f.type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">All</option>
            {MEAL_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div><label className="lbl" htmlFor="f-from">From</label><input id="f-from" type="date" className="field" value={f.from} onChange={(e) => update({ from: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="f-to">To</label><input id="f-to" type="date" className="field" value={f.to} onChange={(e) => update({ to: e.target.value })} /></div>
        {filtered && <Button type="button" variant="ghost" onClick={() => setParams({})}>Clear</Button>}
      </form>

      {error && <ErrorBox>{error.message}</ErrorBox>}
      {isLoading && <Loading />}
      {data && (
        <Card className="overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-8 py-4 bg-white/[0.03] border-b border-white/10 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="col-span-2">Date</span><span className="col-span-2">Type</span><span className="col-span-3">Food</span><span className="col-span-1">Qty</span><span className="col-span-2">Calories</span><span className="col-span-1">Protein</span><span className="col-span-1" />
          </div>
          {data.results.length === 0 && <Empty>{filtered ? 'No meals match these filters.' : 'No meals logged yet.'}</Empty>}
          {data.results.map((m) => (
            <div key={m.id} className="grid grid-cols-12 gap-x-4 gap-y-2 px-6 md:px-8 py-4 border-b border-white/5 hover:bg-white/5 items-center">
              <span className="col-span-8 md:col-span-2 font-mono text-xs text-neutral-400">{dayLabel(m.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span className="col-span-4 md:col-span-2 text-right md:text-left font-mono text-[10px] uppercase tracking-widest text-neutral-400">{m.meal_type}</span>
              <span className="col-span-8 md:col-span-3 text-white font-medium flex items-center gap-3 min-w-0"><FoodThumb image={m.food_image} emoji={m.food_emoji} size={36} /><span className="truncate">{m.food_name}</span></span>
              <span className="col-span-4 md:col-span-1 text-right md:text-left font-mono text-xs text-neutral-300">{num(m.quantity_grams)}g</span>
              <span className="col-span-5 md:col-span-2 whitespace-nowrap font-mono text-xs md:text-sm text-white">{num(m.calories)} cal</span>
              <span className="col-span-4 md:col-span-1 font-mono text-xs text-neutral-300">{num(m.protein)}g</span>
              <span className="col-span-3 md:col-span-1 flex justify-end gap-1">
                <Link to={`/meals/${m.id}/edit`} title="Edit" className="p-2 text-neutral-500 hover:text-white"><Icon name="edit" size={18} /></Link>
                <button type="button" title="Delete" onClick={() => setPendingDelete(m)} className="p-2 text-neutral-500 hover:text-red-400 cursor-pointer"><Icon name="delete" size={18} /></button>
              </span>
            </div>
          ))}
        </Card>
      )}
      {data && <Pager page={data.page} numPages={data.num_pages} onPage={(p) => update({ page: p })} />}

      <ConfirmDialog open={!!pendingDelete} title="Delete this meal?" busy={del.isPending}
        message={pendingDelete ? `${pendingDelete.food_name} (${num(pendingDelete.quantity_grams)} g) on ${pendingDelete.date}. This cannot be undone.` : ''}
        onConfirm={() => del.mutate(pendingDelete.id)} onCancel={() => setPendingDelete(null)} />
    </div>
  );
}
