import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../api';
import { num } from '../format';
import { Card, ConfirmDialog, Empty, ErrorBox, Icon, Loading, LinkButton, PageHeader, Pager, Segmented } from '../components/ui';
import FoodThumb from '../components/FoodThumb';
import { useToast } from '../toast';

export default function Foods() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') || '';
  const q = params.get('q') || '';
  const page = Number(params.get('page') || 1);
  const [search, setSearch] = useState(q);
  const [pendingDelete, setPendingDelete] = useState(null);

  // debounce the search box into the URL
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) setParams(Object.fromEntries(Object.entries({ scope, q: search }).filter(([, v]) => v)));
    }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, isLoading } = useQuery({ queryKey: ['foods', { scope, q, page }], queryFn: () => api.get(`/foods/${qs({ scope, q, page })}`), placeholderData: keepPreviousData });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['foods'] });
  const fav = useMutation({ mutationFn: (id) => api.post(`/foods/${id}/favorite/`), onSuccess: refresh, onError: (e) => toast(e.message, 'error') });
  const del = useMutation({
    mutationFn: (id) => api.del(`/foods/${id}/`),
    onSuccess: (r) => { toast(r.deleted_meals ? `Food deleted (and ${r.deleted_meals} logged meal${r.deleted_meals === 1 ? '' : 's'})` : 'Food deleted'); setPendingDelete(null); refresh(); queryClient.invalidateQueries({ queryKey: ['meals'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => { toast(e.message, 'error'); setPendingDelete(null); },
  });
  const goto = (patch) => setParams(Object.fromEntries(Object.entries({ scope, q, page: 1, ...patch }).filter(([k, v]) => v && !(k === 'page' && v === 1))));

  return (
    <div>
      <PageHeader eyebrow="Library" title="Foods"><LinkButton to="/foods/new">Add Food</LinkButton></PageHeader>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <input type="search" className="field flex-1 min-w-52 max-w-md" placeholder="Search foods..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search foods" />
        <Segmented options={[['', 'All'], ['favorites', 'Favorites'], ['mine', 'Mine']]} value={scope} onChange={(s) => goto({ scope: s })} />
      </div>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      {isLoading && <Loading />}
      {data && (
        <Card className="overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-8 py-4 bg-white/[0.03] border-b border-white/10 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="col-span-4">Name</span><span className="col-span-2">Calories</span><span className="col-span-2">Protein</span><span className="col-span-1">Carbs</span><span className="col-span-1">Fat</span><span className="col-span-2 text-right">Actions</span>
          </div>
          {data.results.length === 0 && <Empty>{q ? `No foods match "${q}".` : scope === 'favorites' ? 'No favorites yet. Tap a star to add one.' : 'No foods yet. Add your first one.'}</Empty>}
          {data.results.map((f) => (
            <div key={f.id} className="grid grid-cols-12 gap-x-4 gap-y-2 px-6 md:px-8 py-4 border-b border-white/5 hover:bg-white/5 items-center">
              <span className="col-span-12 md:col-span-4 text-white font-medium flex items-center gap-2 min-w-0">
                <button type="button" onClick={() => fav.mutate(f.id)} aria-label={f.favorite ? `Remove ${f.name} from favorites` : `Add ${f.name} to favorites`} aria-pressed={f.favorite}
                  className={`text-lg leading-none cursor-pointer ${f.favorite ? 'text-white' : 'text-neutral-600 hover:text-white'}`}>{f.favorite ? '★' : '☆'}</button>
                <FoodThumb image={f.image} emoji={f.emoji} size={34} />
                <span className="truncate">{f.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">{f.category}</span>
                {f.custom && <span className="font-mono text-[9px] uppercase tracking-widest text-white border border-white/30 px-1.5 py-0.5">Mine</span>}
              </span>
              <span className="col-span-12 md:col-span-2 whitespace-nowrap font-mono text-sm text-white">{num(f.calories)} cal</span>
              {[['P', f.protein, 'md:col-span-2'], ['C', f.carbs, 'md:col-span-1'], ['F', f.fat, 'md:col-span-1']].map(([l, v, c]) => (
                <span key={l} className={`col-span-4 ${c} font-mono text-xs text-neutral-300`}><span className="md:hidden text-neutral-500">{l}&nbsp;</span>{num(v)}g</span>
              ))}
              <span className="col-span-12 md:col-span-2 flex md:justify-end gap-3">
                {f.can_edit && <Link to={`/foods/${f.id}/edit`} className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-white">Edit</Link>}
                {f.can_edit && <button type="button" onClick={() => setPendingDelete(f)} className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-red-400 cursor-pointer">Delete</button>}
              </span>
            </div>
          ))}
        </Card>
      )}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-600"><Icon name="info" size={12} /> Values are per 100 g</p>
      {data && <Pager page={data.page} numPages={data.num_pages} onPage={(p) => goto({ page: p })} />}
      <ConfirmDialog open={!!pendingDelete} title="Delete this food?" busy={del.isPending}
        message={pendingDelete ? `"${pendingDelete.name}" will be removed. Any meals you logged with it are deleted too. This cannot be undone.` : ''}
        onConfirm={() => del.mutate(pendingDelete.id)} onCancel={() => setPendingDelete(null)} />
    </div>
  );
}
