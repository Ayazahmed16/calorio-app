import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { todayISO } from '../format';
import { Button, Card, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import { useToast } from '../toast';

export default function ActivityForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const existing = useQuery({ queryKey: ['activity-one', id], queryFn: () => api.get(`/activity/${id}/`), enabled: editing });
  const [form, setForm] = useState({ steps: '', calories_burned: '', activity_type: '', date: todayISO() });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (existing.data) setForm({ steps: String(existing.data.steps), calories_burned: String(existing.data.calories_burned), activity_type: existing.data.activity_type, date: existing.data.date });
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = { steps: form.steps === '' ? '' : Number(form.steps), calories_burned: form.calories_burned === '' ? '' : Number(form.calories_burned), activity_type: form.activity_type, date: form.date };
      return editing ? api.put(`/activity/${id}/`, body) : api.post('/activity/', body);
    },
    onSuccess: (res) => {
      toast(editing ? 'Activity updated' : res.steps && res.id ? 'Activity saved' : 'Activity added');
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/activity');
    },
    onError: (e) => setErr(e),
  });

  if (editing && existing.isLoading) return <Loading />;
  if (editing && existing.error) return <ErrorBox>{existing.error.message}</ErrorBox>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const named = ['steps', 'calories_burned', 'activity_type', 'date'].some((k) => err?.fields?.[k]);

  return (
    <div>
      <PageHeader eyebrow={editing ? 'Update entry' : 'New entry'} title={editing ? 'Edit Activity' : 'Add Activity'} />
      <Card className="p-8 max-w-2xl">
        <form onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }} noValidate>
          <ErrorBox>{err && !named ? err.message : ''}</ErrorBox>
          <Field label="Steps" htmlFor="ac-steps" error={fieldError(err, 'steps')}>
            <input id="ac-steps" className="field" type="number" min="0" placeholder="0" value={form.steps} onChange={set('steps')} />
          </Field>
          <Field label="Calories burned" htmlFor="ac-cal" error={fieldError(err, 'calories_burned')}>
            <input id="ac-cal" className="field" type="number" min="0" step="0.1" placeholder="0" value={form.calories_burned} onChange={set('calories_burned')} />
          </Field>
          <Field label="Activity type (optional)" htmlFor="ac-type" error={fieldError(err, 'activity_type')}>
            <input id="ac-type" className="field" value={form.activity_type} onChange={set('activity_type')} />
          </Field>
          <Field label="Date" htmlFor="ac-date" error={fieldError(err, 'date')} hint={editing ? undefined : 'If you already logged this date, the numbers are added to that day.'}>
            <input id="ac-date" className="field" type="date" max={todayISO()} value={form.date} onChange={set('date')} />
          </Field>
          <div className="flex gap-3 mt-8">
            <Button type="submit" size="lg" loading={save.isPending}>{editing ? 'Save changes' : 'Add activity'}</Button>
            <Link to="/activity" className="px-8 py-4 border border-white/15 text-white font-bold text-sm hover:border-white/40">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
