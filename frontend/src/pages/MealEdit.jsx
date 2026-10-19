import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { MEAL_TYPES, num } from '../format';
import { Button, Card, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import FoodCombobox from '../components/FoodCombobox';
import { useToast } from '../toast';

export default function MealEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const meal = useQuery({ queryKey: ['meal', id], queryFn: () => api.get(`/meals/${id}/`) });
  const foodsQ = useQuery({ queryKey: ['foods', 'all'], queryFn: () => api.get('/foods/?all=1') });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (meal.data) setForm({ food: String(meal.data.food), quantity_grams: String(meal.data.quantity_grams), meal_type: meal.data.meal_type, date: meal.data.date });
  }, [meal.data]);

  const save = useMutation({
    mutationFn: () => api.put(`/meals/${id}/`, { ...form, food: Number(form.food), quantity_grams: parseFloat(form.quantity_grams) }),
    onSuccess: () => { toast('Meal updated'); queryClient.invalidateQueries({ queryKey: ['meals'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); navigate('/meals'); },
    onError: (e) => setErr(e),
  });

  if (meal.isLoading || foodsQ.isLoading || !form) return meal.error ? <ErrorBox>{meal.error.message}</ErrorBox> : <Loading />;
  const foods = foodsQ.data?.results || [];
  const food = foods.find((f) => String(f.id) === form.food);
  const grams = parseFloat(form.quantity_grams);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <PageHeader eyebrow="Update entry" title="Edit Meal" />
      <Card className="p-8 max-w-2xl">
        <form onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }} noValidate>
          <ErrorBox>{err && !err.fields?.food && !err.fields?.quantity_grams && !err.fields?.date && !err.fields?.meal_type ? err.message : ''}</ErrorBox>
          <Field label="Food" htmlFor="me-food" error={fieldError(err, 'food')}>
            <FoodCombobox id="me-food" foods={foods} value={form.food} onChange={(v) => setForm({ ...form, food: v })} newFoodTo={() => '/foods/new'} />
          </Field>
          <Field label="Quantity (grams)" htmlFor="me-qty" error={fieldError(err, 'quantity_grams')}
            hint={food && grams > 0 ? `${num(food.calories * grams / 100)} cal · ${num(food.protein * grams / 100)}g protein` : undefined}>
            <input id="me-qty" className="field" type="number" step="0.1" min="0.1" value={form.quantity_grams} onChange={set('quantity_grams')} />
          </Field>
          <Field label="Meal type" htmlFor="me-type" error={fieldError(err, 'meal_type')}>
            <select id="me-type" className="field" value={form.meal_type} onChange={set('meal_type')}>{MEAL_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Date" htmlFor="me-date" error={fieldError(err, 'date')}>
            <input id="me-date" className="field" type="date" value={form.date} onChange={set('date')} />
          </Field>
          <div className="flex gap-3 mt-8">
            <Button type="submit" size="lg" loading={save.isPending}>Save changes</Button>
            <Link to="/meals" className="px-8 py-4 border border-white/15 text-white font-bold text-sm hover:border-white/40">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
