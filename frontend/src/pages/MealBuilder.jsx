import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { GROUPS, MEAL_TYPES, num, todayISO } from '../format';
import { Button, Card, ErrorBox, Field, Icon, Loading, PageHeader } from '../components/ui';
import FoodCombobox from '../components/FoodCombobox';
import { useToast } from '../toast';

let rowId = 0;
const newRow = (food = '', qty = '') => ({ key: ++rowId, food: String(food || ''), qty: String(qty || ''), error: '' });
const DOT = { protein: 'bg-white', carbs: 'bg-neutral-400', fats: 'bg-neutral-600', other: 'bg-neutral-700' };
const BAR = { protein: '#ffffff', carbs: '#a3a3a3', fats: '#6b6b6b' };

export default function MealBuilder() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { data, isLoading, error: loadError } = useQuery({ queryKey: ['foods', 'all'], queryFn: () => api.get('/foods/?all=1') });
  const foods = useMemo(() => data?.results || [], [data]);
  const byId = useMemo(() => Object.fromEntries(foods.map((f) => [String(f.id), f])), [foods]);

  const [mealType, setMealType] = useState(params.get('type') || 'lunch');
  const [date, setDate] = useState(todayISO());
  const [showAll, setShowAll] = useState({});
  const [formError, setFormError] = useState('');
  const [rows, setRows] = useState(() => {
    const init = { protein: [], carbs: [], fats: [], other: [] };
    GROUPS.forEach(([k]) => { if (k !== 'other') init[k] = [newRow()]; });
    return init;
  });
  const prefilled = useRef(false);

  // ?food=ID&qty=GRAMS (favourites, new-food return trip): place the food in its own group once foods are loaded
  const wantedFood = params.get('food');
  const wantedQty = params.get('qty');
  useEffect(() => {
    if (prefilled.current || !foods.length || !wantedFood || !byId[wantedFood]) return;
    prefilled.current = true;
    const f = byId[wantedFood];
    const group = ['protein', 'carbs', 'fats'].includes(f.category) ? f.category : 'other';
    setRows((r) => ({ ...r, [group]: [newRow(f.id, wantedQty), ...r[group].filter((x) => x.food || x.qty)] }));
  }, [foods, byId, wantedFood, wantedQty]);

  const setRow = (group, key, patch) => setRows((r) => ({ ...r, [group]: r[group].map((x) => (x.key === key ? { ...x, ...patch, error: '' } : x)) }));
  const addRow = (group, food = '') => setRows((r) => ({ ...r, [group]: [...r[group].filter((x) => x.food || x.qty || food === ''), newRow(food)] }));
  const removeRow = (group, key) => setRows((r) => ({ ...r, [group]: r[group].filter((x) => x.key !== key) }));

  const totals = useMemo(() => {
    const t = { cal: 0, p: 0, c: 0, f: 0, count: 0, per: {} };
    Object.entries(rows).forEach(([g, list]) => {
      t.per[g] = 0;
      list.forEach((r) => {
        const food = byId[r.food];
        const qty = parseFloat(r.qty);
        if (!food || !(qty > 0)) return;
        const k = qty / 100;
        t.count += 1; t.cal += food.calories * k; t.p += food.protein * k; t.c += food.carbs * k; t.f += food.fat * k; t.per[g] += food.calories * k;
      });
    });
    return t;
  }, [rows, byId]);

  const save = useMutation({
    mutationFn: (payload) => api.post('/meals/', payload),
    onSuccess: (res) => {
      toast(res.results.length === 1 ? 'Meal added' : `Meal added (${res.results.length} foods)`);
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/meals');
    },
    onError: (err, vars) => {
      const itemErrors = err.fields?.items;
      if (itemErrors && typeof itemErrors === 'object' && !Array.isArray(itemErrors)) {
        setRows((r) => {
          const next = { ...r };
          vars.order.forEach((ref, idx) => {
            const e = itemErrors[String(idx)];
            if (e) next[ref.group] = next[ref.group].map((x) => (x.key === ref.key ? { ...x, error: (e.quantity_grams || e.food || e.meal_type || e.date || ['Invalid'])[0] } : x));
          });
          return next;
        });
        setFormError(fieldError(err, 'date') || fieldError(err, 'meal_type') || 'Fix the highlighted rows.');
      } else setFormError(fieldError(err, 'items') || err.message);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    setFormError('');
    const items = [];
    const order = [];
    let bad = false;
    const next = {};
    Object.entries(rows).forEach(([group, list]) => {
      next[group] = list.map((r) => {
        if (!r.food && !r.qty) return r;
        let error = '';
        if (!r.food) error = 'Choose a food from the list.';
        else if (!(parseFloat(r.qty) > 0)) error = 'Enter the amount in grams.';
        else if (parseFloat(r.qty) > 5000) error = 'Grams must be between 0.1 and 5000.';
        if (error) bad = true;
        else { items.push({ food: Number(r.food), quantity_grams: parseFloat(r.qty) }); order.push({ group, key: r.key }); }
        return { ...r, error };
      });
    });
    setRows(next);
    if (bad) return;
    if (!items.length) { setFormError('Add at least one food with an amount in grams.'); return; }
    save.mutate({ meal_type: mealType, date, items, order });
  };

  if (isLoading) return <Loading />;
  const quick = foods.filter((f) => f.favorite);
  const macroKcal = totals.p * 4 + totals.c * 4 + totals.f * 9;

  return (
    <div>
      <PageHeader eyebrow="New entry" title="Add a Meal" subtitle="Build your plate by group. Add as many foods as you like under Protein, Carbs and Fats, then save them together as one meal." />
      {loadError && <ErrorBox>{loadError.message}</ErrorBox>}
      <form onSubmit={submit} className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start" noValidate>
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Meal type" htmlFor="mb-type">
              <select id="mb-type" className="field" value={mealType} onChange={(e) => setMealType(e.target.value)}>
                {MEAL_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Date" htmlFor="mb-date">
              <input id="mb-date" type="date" className="field" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </Card>
          {!foods.length && <div className="border-l-2 border-white bg-[#141414] px-4 py-3 font-mono text-xs text-neutral-400">No foods yet. <Link to="/foods/new?next=/meals/new" className="text-white underline">Add your first food</Link> to start logging.</div>}
          <ErrorBox>{formError}</ErrorBox>

          {GROUPS.map(([group, label, hint]) => {
            const pool = foods.filter((f) => showAll[group] || f.category === group);
            const chips = quick.filter((f) => f.category === group).slice(0, 5);
            return (
              <Card key={group} className="p-6" role="group" aria-label={label}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${DOT[group]}`} />
                    <div><h2 className="text-lg font-bold text-white leading-none">{label}</h2><p className="font-mono text-[10px] text-neutral-500 mt-1">{hint}</p></div>
                  </div>
                  <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400 cursor-pointer">
                    <input type="checkbox" className="accent-white" checked={!!showAll[group]} onChange={(e) => setShowAll({ ...showAll, [group]: e.target.checked })} /> All foods
                  </label>
                </div>
                <div className="space-y-3">
                  {rows[group].map((r) => (
                    <div key={r.key} className="fade-in">
                      <div className="grid grid-cols-[minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,1fr)_110px_70px_32px] gap-2 items-center">
                        <div className="col-span-full sm:col-span-1">
                          <FoodCombobox foods={pool} value={r.food} invalid={!!r.error} placeholder="Search foods..."
                            onChange={(id) => setRow(group, r.key, { food: id })}
                            newFoodTo={(typed) => `/foods/new?${typed ? `name=${encodeURIComponent(typed)}&` : ''}next=/meals/new`} />
                        </div>
                        <input className="field" type="number" min="0.1" max="5000" step="0.1" inputMode="decimal" placeholder="grams" aria-label={`${label} grams`}
                          value={r.qty} onChange={(e) => setRow(group, r.key, { qty: e.target.value })} />
                        <span className="hidden sm:block text-right font-mono text-[11px] text-neutral-400">
                          {byId[r.food] && parseFloat(r.qty) > 0 ? `${num(byId[r.food].calories * parseFloat(r.qty) / 100)} cal` : ''}
                        </span>
                        <button type="button" onClick={() => removeRow(group, r.key)} aria-label="Remove row" className="text-neutral-500 hover:text-red-400 text-xl leading-none cursor-pointer">×</button>
                      </div>
                      {r.error && <p className="mt-1 font-mono text-[11px] text-red-400">{r.error}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={() => addRow(group)}>+ Add food</Button>
                  {chips.map((f) => (
                    <button key={f.id} type="button" onClick={() => addRow(group, f.id)}
                      className="px-3 py-1 border border-white/15 text-xs text-white hover:border-white/50 cursor-pointer">★ {f.name}</button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-6 xl:sticky xl:top-24" aria-live="polite">
          <h2 className="text-lg font-bold text-white mb-1">Meal summary</h2>
          {totals.count === 0 && <p className="font-mono text-[11px] text-neutral-500 mb-4">Pick a food and enter grams to see totals.</p>}
          <div className="text-5xl font-black tracking-tighter text-white">{Math.round(totals.cal)}<span className="text-lg text-neutral-500 ml-2">cal</span></div>
          <div className="grid grid-cols-3 gap-3 mt-5 mb-5 font-mono">
            {[['Protein', totals.p], ['Carbs', totals.c], ['Fat', totals.f]].map(([l, v]) => (
              <div key={l}><div className="text-[10px] uppercase tracking-widest text-neutral-500">{l}</div><div className="text-white text-lg">{num(v)}g</div></div>
            ))}
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-white/10 mb-6">
            {macroKcal > 0 && [['protein', totals.p * 4], ['carbs', totals.c * 4], ['fats', totals.f * 9]].map(([k, v]) => <div key={k} style={{ width: `${v / macroKcal * 100}%`, background: BAR[k], transition: 'width .4s' }} />)}
          </div>
          <ul className="space-y-1 mb-6 font-mono text-xs text-neutral-400">
            {GROUPS.filter(([g]) => totals.per[g] > 0).map(([g, l]) => <li key={g} className="flex justify-between"><span>{l}</span><span className="text-white">{Math.round(totals.per[g])} cal</span></li>)}
          </ul>
          <Button type="submit" size="lg" className="w-full" loading={save.isPending}>Save meal</Button>
          <Link to="/meals" className="block text-center mt-3 px-8 py-3 border border-white/15 text-white font-bold text-sm hover:border-white/40"><Icon name="close" size={14} /> Cancel</Link>
        </Card>
      </form>
    </div>
  );
}
