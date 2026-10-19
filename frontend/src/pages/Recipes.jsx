import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qs } from '../api';
import { Button, ErrorBox, Loading, PageHeader } from '../components/ui';

export default function Recipes() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const [search, setSearch] = useState(q);
  const { data, error, isLoading } = useQuery({ queryKey: ['recipes', q, category], queryFn: () => api.get(`/recipes/${qs({ q, category })}`), placeholderData: keepPreviousData, staleTime: 60_000 });

  return (
    <div>
      <PageHeader eyebrow="Ideas · TheMealDB" title="Recipes" />
      <form className="flex flex-wrap gap-3 mb-5 max-w-2xl" onSubmit={(e) => { e.preventDefault(); setParams(search.trim() ? { q: search.trim() } : {}); }}>
        <input type="search" className="field flex-1 min-w-52" placeholder="Search recipes, e.g. chicken, pasta, curry..." aria-label="Search recipes" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button type="submit">Search</Button>
      </form>

      {data?.categories?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <button type="button" onClick={() => { setSearch(''); setParams({}); }} className={`px-3 py-1 text-xs border cursor-pointer ${data.featured ? 'bg-white text-black border-white font-bold' : 'border-white/15 text-neutral-400 hover:text-white'}`}>Surprise me</button>
          {data.categories.map((c) => (
            <button key={c} type="button" onClick={() => { setSearch(''); setParams({ category: c }); }}
              className={`px-3 py-1 text-xs border cursor-pointer ${c === data.category ? 'bg-white text-black border-white font-bold' : 'border-white/15 text-neutral-400 hover:text-white hover:border-white/40'}`}>{c}</button>
          ))}
        </div>
      )}

      {error && <ErrorBox>{error.message}</ErrorBox>}
      {isLoading && <Loading label="Loading recipes..." />}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {data.results.map((r) => (
            <Link key={r.id} to={`/recipes/${r.id}`} className="spot group bg-[#141414] border border-white/10 overflow-hidden block">
              <div className="aspect-square bg-[#1f1f1f] overflow-hidden">
                {r.thumb && <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />}
              </div>
              <div className="p-4">
                <h2 className="font-semibold text-white leading-snug mb-1">{r.name}</h2>
                <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">{r.category}{r.category && r.area ? ' · ' : ''}{r.area}</p>
              </div>
            </Link>
          ))}
          {data.results.length === 0 && <p className="col-span-full font-mono text-xs text-neutral-500">No recipes found{q ? ` for “${q}”` : ''}. Try a simpler word like “chicken”.</p>}
        </div>
      )}
    </div>
  );
}
