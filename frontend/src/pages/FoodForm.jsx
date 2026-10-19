import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError, qs } from '../api';
import { num } from '../format';
import { Button, Card, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import FoodThumb from '../components/FoodThumb';
import { useToast } from '../toast';

const EMPTY = { name: '', category: '', calories: '', protein: '', carbs: '', fat: '', barcode: '', image_url: '' };
const NUMERIC = ['calories', 'protein', 'carbs', 'fat'];

function WebLookup({ onPick }) {
  const [term, setTerm] = useState('');
  const [state, setState] = useState({ busy: false, results: null, error: '' });
  const run = async () => {
    const t = term.trim();
    if (t.length < 2) { setState({ busy: false, results: null, error: 'Type at least 2 characters.' }); return; }
    setState({ busy: true, results: null, error: '' });
    try {
      const barcode = /^\d{8,14}$/.test(t);
      const d = await api.get(`/foods/lookup/${qs(barcode ? { barcode: t } : { q: t })}`);
      setState({ busy: false, results: d.results, error: '' });
    } catch (e) { setState({ busy: false, results: null, error: e.message }); }
  };
  return (
    <Card className="p-6 max-w-2xl mb-6">
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Find a food online (USDA &amp; Open Food Facts)</p>
      <div className="flex gap-3 mb-3">
        <input className="field" type="search" placeholder="Search by name or paste a barcode..." aria-label="Search the web for a food" value={term}
          onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }} />
        <Button type="button" size="md" onClick={run} loading={state.busy}>Search</Button>
      </div>
      {state.error && <p className="font-mono text-[11px] text-red-400">{state.error}</p>}
      {state.results && <p className="font-mono text-[11px] text-neutral-500">{state.results.length ? 'Tap a result to fill the form. Values are per 100 g.' : 'No results (or the service is unreachable). You can still enter values by hand.'}</p>}
      <ul className="mt-2 divide-y divide-white/10">
        {(state.results || []).map((f, i) => (
          <li key={`${f.name}-${i}`}>
            <button type="button" onClick={() => onPick(f)} className="w-full text-left flex items-center gap-3 py-3 hover:text-neutral-300 cursor-pointer">
              <FoodThumb image={f.image} size={32} />
              <span className="flex-1 text-sm text-white">{f.name}</span>
              <span className="font-mono text-[11px] text-neutral-400 shrink-0">{num(f.calories)} cal · P{num(f.protein)} C{num(f.carbs)} F{num(f.fat)}{f.source ? ` · ${f.source}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function FoodForm() {
  const { id } = useParams();
  const editing = !!id;
  const [params] = useSearchParams();
  const next = params.get('next');
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const existing = useQuery({ queryKey: ['food', id], queryFn: () => api.get(`/foods/${id}/`), enabled: editing });
  const [form, setForm] = useState({ ...EMPTY, name: params.get('name') || '' });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (existing.data) {
      const f = existing.data;
      setForm({ name: f.name, category: f.category, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat), barcode: f.barcode || '', image_url: f.image || '' });
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, image_url: form.image_url, ...Object.fromEntries(NUMERIC.map((k) => [k, form[k] === '' ? '' : Number(form[k])])) };
      return editing ? api.put(`/foods/${id}/`, body) : api.post('/foods/', body);
    },
    onSuccess: (food) => {
      toast(editing ? 'Food updated' : 'Food added');
      queryClient.invalidateQueries({ queryKey: ['foods'] });
      if (!editing && next === '/meals/new') navigate(`/meals/new?food=${food.id}`);
      else navigate('/foods');
    },
    onError: (e) => setErr(e),
  });

  if (editing && existing.isLoading) return <Loading />;
  if (editing && existing.error) return <ErrorBox>{existing.error.message}</ErrorBox>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const named = ['name', 'category', 'barcode', 'image_url', ...NUMERIC].some((k) => err?.fields?.[k]);
  const pick = (f) => setForm({ ...form, name: f.name, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat), barcode: f.barcode || '', image_url: f.image || '' });
  const fieldDefs = [['calories', 'Calories (per 100 g)'], ['protein', 'Protein (g per 100 g)'], ['carbs', 'Carbs (g per 100 g)'], ['fat', 'Fat (g per 100 g)']];

  return (
    <div>
      <PageHeader eyebrow="Food library" title={editing ? 'Edit Food' : 'Add a Food'} />
      {!editing && <WebLookup onPick={pick} />}
      <Card className="p-8 max-w-2xl">
        <form onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }} noValidate>
          <ErrorBox>{err && !named ? err.message : ''}</ErrorBox>
          {err?.fields?.__all__ && <ErrorBox>{err.fields.__all__[0]}</ErrorBox>}
          <Field label="Name" htmlFor="fd-name" error={fieldError(err, 'name')}><input id="fd-name" className="field" value={form.name} onChange={set('name')} /></Field>
          <Field label="Group (protein / carbs / fats)" htmlFor="fd-cat" error={fieldError(err, 'category')}>
            <select id="fd-cat" className="field" value={form.category} onChange={set('category')}>
              <option value="">Auto-detect from name and macros</option>
              <option value="protein">Protein</option><option value="carbs">Carbs</option><option value="fats">Fats</option><option value="other">Other</option>
            </select>
          </Field>
          {fieldDefs.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`fd-${k}`} error={fieldError(err, k)}>
              <input id={`fd-${k}`} className="field" type="number" step="0.1" min="0" value={form[k]} onChange={set(k)} />
            </Field>
          ))}
          <Field label="Barcode (optional)" htmlFor="fd-barcode" error={fieldError(err, 'barcode')}><input id="fd-barcode" className="field" value={form.barcode} onChange={set('barcode')} /></Field>
          <Field label="Photo URL (optional, https)" htmlFor="fd-image" error={fieldError(err, 'image_url')}>
            <input id="fd-image" className="field" placeholder="Leave empty to look one up automatically" value={form.image_url} onChange={set('image_url')} />
          </Field>
          <div className="flex gap-3 mt-8">
            <Button type="submit" size="lg" loading={save.isPending}>{editing ? 'Save changes' : 'Add food'}</Button>
            <Link to={next || '/foods'} className="px-8 py-4 border border-white/15 text-white font-bold text-sm hover:border-white/40">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
