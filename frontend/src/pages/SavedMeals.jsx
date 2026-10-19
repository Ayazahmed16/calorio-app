import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { MEAL_TYPES, num, todayISO } from '../format';
import { Button, Card, ConfirmDialog, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import FoodThumb from '../components/FoodThumb';
import { useToast } from '../toast';

function SavedCard({ saved, onDelete }) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [type, setType] = useState('lunch');
  const [date, setDate] = useState(todayISO());
  const log = useMutation({
    mutationFn: () => api.post(`/saved/${saved.id}/log/`, { meal_type: type, date }),
    onSuccess: (r) => {
      toast(`Logged "${saved.name}" (${r.count} item${r.count === 1 ? '' : 's'})`);
      queryClient.invalidateQueries({ queryKey: ['meals'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/dashboard${r.date === todayISO() ? '' : `?date=${r.date}`}`);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Card hover className="p-6">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">{saved.name}</h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mt-1">{num(saved.totals.calories)} cal · {num(saved.totals.protein)}g protein</p>
        </div>
        <button type="button" title="Delete" onClick={() => onDelete(saved)} className="p-2 text-neutral-500 hover:text-red-400 cursor-pointer material-symbols-outlined" style={{ fontSize: 18 }}>delete</button>
      </div>
      <ul className="mb-5 space-y-2">
        {saved.items.map((i, k) => (
          <li key={k} className="font-mono text-xs text-neutral-300 flex items-center gap-2"><FoodThumb image={i.food.image} emoji={i.food.emoji} size={24} />{i.food.name} · {num(i.quantity_grams)} g</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <select className="field !w-auto" aria-label="Meal type" value={type} onChange={(e) => setType(e.target.value)}>{MEAL_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="field !w-auto" type="date" aria-label="Date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        <Button onClick={() => log.mutate()} loading={log.isPending}>Log this meal</Button>
      </div>
    </Card>
  );
}

export default function SavedMeals() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery({ queryKey: ['saved'], queryFn: () => api.get('/saved/') });
  const [form, setForm] = useState({ name: '', date: todayISO(), meal_type: 'lunch' });
  const [err, setErr] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const create = useMutation({
    mutationFn: () => api.post('/saved/', form),
    onSuccess: (s) => { toast(`Saved "${s.name}"`); setForm({ ...form, name: '' }); setErr(null); queryClient.invalidateQueries({ queryKey: ['saved'] }); },
    onError: (e) => setErr(e),
  });
  const del = useMutation({
    mutationFn: (id) => api.del(`/saved/${id}/`),
    onSuccess: () => { toast('Saved meal deleted'); setPendingDelete(null); queryClient.invalidateQueries({ queryKey: ['saved'] }); },
    onError: (e) => { toast(e.message, 'error'); setPendingDelete(null); },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  const general = err && !err.fields?.name && !err.fields?.date && !err.fields?.meal_type ? (err.fields?.__all__?.[0] || err.message) : '';

  return (
    <div>
      <PageHeader eyebrow="Quick logging" title="Saved Meals" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          {data.results.length === 0 && <Card className="p-8 font-mono text-xs text-neutral-500">No saved meals yet. Log a meal, then save it here to reuse it with one click.</Card>}
          {data.results.map((s) => <SavedCard key={s.id} saved={s} onDelete={setPendingDelete} />)}
        </div>
        <Card className="p-6">
          <h2 className="text-lg font-bold text-white mb-2">Save a logged meal</h2>
          <p className="font-mono text-[10px] text-neutral-500 mb-5">Copies every food you logged for that meal type on that day.</p>
          <form onSubmit={(e) => { e.preventDefault(); setErr(null); create.mutate(); }} noValidate>
            <ErrorBox>{general}</ErrorBox>
            <Field label="Name" htmlFor="sm-name" error={fieldError(err, 'name')}><input id="sm-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Copy from date" htmlFor="sm-date" error={fieldError(err, 'date')}><input id="sm-date" className="field" type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Meal type" htmlFor="sm-type" error={fieldError(err, 'meal_type')}>
              <select id="sm-type" className="field" value={form.meal_type} onChange={(e) => setForm({ ...form, meal_type: e.target.value })}>{MEAL_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </Field>
            <Button type="submit" className="w-full" loading={create.isPending}>Save meal</Button>
          </form>
        </Card>
      </div>
      <ConfirmDialog open={!!pendingDelete} title="Delete this saved meal?" busy={del.isPending}
        message={pendingDelete ? `"${pendingDelete.name}" will be removed. Meals you already logged from it are not affected.` : ''}
        onConfirm={() => del.mutate(pendingDelete.id)} onCancel={() => setPendingDelete(null)} />
    </div>
  );
}
