import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../api';
import { dayLabel, num } from '../format';
import { Button, Card, ConfirmDialog, Empty, ErrorBox, Icon, Loading, LinkButton, PageHeader, Pager } from '../components/ui';
import { useToast } from '../toast';

export default function Activity() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const f = { from: params.get('from') || '', to: params.get('to') || '', page: Number(params.get('page') || 1) };
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, error, isLoading } = useQuery({ queryKey: ['activity', f], queryFn: () => api.get(`/activity/${qs(f)}`), placeholderData: keepPreviousData });
  const del = useMutation({
    mutationFn: (id) => api.del(`/activity/${id}/`),
    onSuccess: () => { toast('Activity deleted'); setPendingDelete(null); queryClient.invalidateQueries({ queryKey: ['activity'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => { toast(e.message, 'error'); setPendingDelete(null); },
  });
  const update = (patch) => {
    const next = { ...f, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'page' && v === 1))));
  };
  const filtered = !!(f.from || f.to);

  return (
    <div>
      <PageHeader eyebrow="History" title="All Activity"><LinkButton to="/activity/new">Add Activity</LinkButton></PageHeader>
      <form className="flex flex-wrap items-end gap-4 mb-6" onSubmit={(e) => e.preventDefault()}>
        <div><label className="lbl" htmlFor="a-from">From</label><input id="a-from" type="date" className="field" value={f.from} onChange={(e) => update({ from: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="a-to">To</label><input id="a-to" type="date" className="field" value={f.to} onChange={(e) => update({ to: e.target.value })} /></div>
        {filtered && <Button type="button" variant="ghost" onClick={() => setParams({})}>Clear</Button>}
      </form>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {isLoading && <Loading />}
      {data && (
        <Card className="overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-8 py-4 bg-white/[0.03] border-b border-white/10 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="col-span-3">Date</span><span className="col-span-3">Steps</span><span className="col-span-2">Calories burned</span><span className="col-span-3">Type</span><span className="col-span-1" />
          </div>
          {data.results.length === 0 && <Empty>{filtered ? 'No activity matches these dates.' : 'No activity logged yet.'}</Empty>}
          {data.results.map((a) => (
            <div key={a.id} className="grid grid-cols-12 gap-x-4 gap-y-2 px-6 md:px-8 py-4 border-b border-white/5 hover:bg-white/5 items-center">
              <span className="col-span-6 md:col-span-3 font-mono text-xs text-neutral-400">{dayLabel(a.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span className="col-span-6 md:col-span-3 text-white font-medium">{a.steps} steps</span>
              <span className="col-span-6 md:col-span-2 whitespace-nowrap font-mono text-sm text-white">{num(a.calories_burned)} cal</span>
              <span className="col-span-6 md:col-span-3 font-mono text-[10px] uppercase tracking-widest text-neutral-400">{a.activity_type || '—'}</span>
              <span className="col-span-12 md:col-span-1 flex justify-end gap-1">
                <Link to={`/activity/${a.id}/edit`} title="Edit" className="p-2 text-neutral-500 hover:text-white"><Icon name="edit" size={18} /></Link>
                <button type="button" title="Delete" onClick={() => setPendingDelete(a)} className="p-2 text-neutral-500 hover:text-red-400 cursor-pointer"><Icon name="delete" size={18} /></button>
              </span>
            </div>
          ))}
        </Card>
      )}
      {data && <Pager page={data.page} numPages={data.num_pages} onPage={(p) => update({ page: p })} />}
      <ConfirmDialog open={!!pendingDelete} title="Delete this activity?" busy={del.isPending}
        message={pendingDelete ? `${pendingDelete.steps} steps on ${pendingDelete.date}. This cannot be undone.` : ''}
        onConfirm={() => del.mutate(pendingDelete.id)} onCancel={() => setPendingDelete(null)} />
    </div>
  );
}
