import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { Button, Card, ErrorBox, Field, Icon, Loading } from '../components/ui';
import { useToast } from '../toast';

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: r, error, isLoading } = useQuery({ queryKey: ['recipe', id], queryFn: () => api.get(`/recipes/${id}/`), staleTime: 300_000 });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);

  const save = useMutation({
    mutationFn: () => api.post(`/recipes/${id}/save/`, Object.fromEntries(Object.entries(form).map(([k, v]) => [k, k === 'name' ? v : (v === '' ? '' : Number(v))]))),
    onSuccess: (res) => { toast(`Saved "${res.food.name}" to your foods.`); queryClient.invalidateQueries({ queryKey: ['foods'] }); navigate(`/meals/new?food=${res.food.id}&qty=${res.serving_g}`); },
    onError: (e) => setErr(e),
  });

  if (isLoading) return <Loading />;
  if (error) return <div><Link to="/recipes" className="font-mono text-xs text-neutral-400 hover:text-white">← All recipes</Link><div className="mt-4"><ErrorBox>{error.message}</ErrorBox></div></div>;
  const f = form || { name: r.name, serving_g: '350', calories: '', protein: '', carbs: '', fat: '' };
  const set = (k) => (e) => setForm({ ...f, [k]: e.target.value });
  const named = ['name', 'serving_g', 'calories', 'protein', 'carbs', 'fat'].some((k) => err?.fields?.[k]);

  return (
    <div>
      <Link to="/recipes" className="inline-flex items-center gap-1 font-mono text-xs text-neutral-400 hover:text-white mb-6"><Icon name="arrow_back" size={16} />All recipes</Link>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-2">{r.category}{r.category && r.area ? ' · ' : ''}{r.area}</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white mb-6">{r.name}</h1>
          {r.image && <img src={r.image} alt={r.name} referrerPolicy="no-referrer" className="w-full max-h-[420px] object-cover mb-8 border border-white/10" />}
          <h2 className="text-lg font-bold text-white mb-3">Ingredients</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mb-8">
            {r.ingredients.map((i, k) => <li key={k} className="flex justify-between gap-3 py-2 border-b border-white/5 text-sm"><span className="text-white">{i.name}</span><span className="font-mono text-xs text-neutral-500">{i.measure}</span></li>)}
          </ul>
          <h2 className="text-lg font-bold text-white mb-3">Method</h2>
          <ol className="space-y-3 mb-6">{r.instructions.map((s, k) => <li key={k} className="text-sm text-neutral-300 leading-relaxed">{s}</li>)}</ol>
          <div className="flex gap-4 font-mono text-xs">
            {r.youtube && <a href={r.youtube} target="_blank" rel="noopener noreferrer" className="text-white underline">Watch video</a>}
            {r.source && <a href={r.source} target="_blank" rel="noopener noreferrer" className="text-white underline">Original source</a>}
          </div>
        </div>
        <Card className="lg:col-span-2 p-6 h-fit lg:sticky lg:top-24">
          <h2 className="text-lg font-bold text-white mb-1">Log this recipe</h2>
          <p className="font-mono text-[10px] leading-relaxed text-neutral-500 mb-5">Recipes don’t include nutrition data. Enter the values for one serving (from a label or a calculator) and Calorio saves it as a food you can log.</p>
          <form onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }} noValidate>
            <ErrorBox>{err && !named ? (err.fields?.__all__?.[0] || err.message) : ''}</ErrorBox>
            <ErrorBox>{err?.fields?.__all__?.[0] && named ? err.fields.__all__[0] : ''}</ErrorBox>
            <Field label="Name" htmlFor="rc-name" error={fieldError(err, 'name')}><input id="rc-name" className="field" value={f.name} onChange={set('name')} /></Field>
            {[['serving_g', 'Serving size (g)'], ['calories', 'Calories per serving'], ['protein', 'Protein per serving (g)'], ['carbs', 'Carbs per serving (g)'], ['fat', 'Fat per serving (g)']].map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`rc-${k}`} error={fieldError(err, k)}><input id={`rc-${k}`} className="field" type="number" step="0.1" min="0" value={f[k]} onChange={set(k)} /></Field>
            ))}
            <Button type="submit" className="w-full mt-2" loading={save.isPending}>Save &amp; log a serving</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
