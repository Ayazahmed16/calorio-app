import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { Button, Card, ErrorBox, Field, PageHeader } from '../components/ui';
import { useToast } from '../toast';

const ACTIVITY = [['1.2', 'Sedentary (little or no exercise)'], ['1.375', 'Light (1-3 days/week)'], ['1.55', 'Moderate (3-5 days/week)'], ['1.725', 'Very active (6-7 days/week)'], ['1.9', 'Extra active (physical job + training)']];
const GOAL = [['lose', 'Lose weight'], ['maintain', 'Maintain weight'], ['gain', 'Gain weight']];

export default function Calculator() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const defaults = useQuery({ queryKey: ['calc-defaults'], queryFn: () => api.get('/calculator/defaults/') });
  const [form, setForm] = useState({ sex: 'male', age: '', height_cm: '', weight_kg: '', activity: '1.375', goal: 'maintain' });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { if (defaults.data?.weight_kg) setForm((f) => (f.weight_kg ? f : { ...f, weight_kg: String(defaults.data.weight_kg) })); }, [defaults.data]);

  const body = () => ({ ...form, age: Number(form.age), height_cm: Number(form.height_cm), weight_kg: Number(form.weight_kg) });
  const calc = useMutation({ mutationFn: () => api.post('/calculator/', body()), onSuccess: (r) => { setResult(r.result); setErr(null); }, onError: (e) => { setErr(e); setResult(null); } });
  const apply = useMutation({
    mutationFn: () => api.post('/calculator/', { ...body(), apply: true }),
    onSuccess: () => { toast('Your daily goals were updated'); queryClient.invalidateQueries({ queryKey: ['goals'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); navigate('/goals'); },
    onError: (e) => toast(e.message, 'error'),
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const named = Object.keys(form).some((k) => err?.fields?.[k]);

  return (
    <div>
      <PageHeader eyebrow="Targets" title="Calorie Calculator" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card className="p-8">
          <form onSubmit={(e) => { e.preventDefault(); setErr(null); calc.mutate(); }} noValidate>
            <ErrorBox>{err && !named ? err.message : ''}</ErrorBox>
            <Field label="Sex" htmlFor="c-sex" error={fieldError(err, 'sex')}><select id="c-sex" className="field" value={form.sex} onChange={set('sex')}><option value="male">Male</option><option value="female">Female</option></select></Field>
            <Field label="Age" htmlFor="c-age" error={fieldError(err, 'age')}><input id="c-age" className="field" type="number" value={form.age} onChange={set('age')} /></Field>
            <Field label="Height (cm)" htmlFor="c-h" error={fieldError(err, 'height_cm')}><input id="c-h" className="field" type="number" step="0.1" value={form.height_cm} onChange={set('height_cm')} /></Field>
            <Field label="Weight (kg)" htmlFor="c-w" error={fieldError(err, 'weight_kg')}><input id="c-w" className="field" type="number" step="0.1" value={form.weight_kg} onChange={set('weight_kg')} /></Field>
            <Field label="Activity level" htmlFor="c-a" error={fieldError(err, 'activity')}><select id="c-a" className="field" value={form.activity} onChange={set('activity')}>{ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Goal" htmlFor="c-g" error={fieldError(err, 'goal')}><select id="c-g" className="field" value={form.goal} onChange={set('goal')}>{GOAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Button type="submit" size="lg" loading={calc.isPending}>Calculate</Button>
          </form>
        </Card>
        <Card className="p-8">
          {result ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-6">Suggested daily targets</p>
              <div className="grid grid-cols-2 gap-6 mb-8">
                {[['Calories', result.calories, ''], ['Protein', result.protein, 'g'], ['Water', result.water_ml, 'ml'], ['Maintenance (TDEE)', result.tdee, '']].map(([l, v, u], i) => (
                  <div key={l}><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">{l}</div><div className={`${i < 2 ? 'text-4xl' : 'text-2xl'} font-black text-white mt-2`}>{v}<span className="text-sm text-neutral-400 ml-1">{u}</span></div></div>
                ))}
              </div>
              <p className="font-mono text-[10px] text-neutral-500 mb-6">Resting metabolism (BMR): {result.bmr} kcal. Based on the Mifflin-St Jeor equation. This is an estimate, not medical advice.</p>
              <Button onClick={() => apply.mutate()} loading={apply.isPending}>Apply to my goals</Button>
            </>
          ) : <p className="font-mono text-xs text-neutral-500 leading-relaxed">Fill in the form to get a suggested daily calorie, protein and water target based on your body and goal. You can apply it to your goals with one click.</p>}
        </Card>
      </div>
    </div>
  );
}
