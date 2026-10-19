import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { Button, Card, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import { useToast } from '../toast';

const FIELDS = [
  ['calories', 'Daily calories', { min: 500, max: 10000 }, 'target_calories'],
  ['protein', 'Daily protein (g)', { min: 10, max: 500 }, 'target_protein'],
  ['steps', 'Daily steps', { min: 1000, max: 100000 }, 'target_steps'],
  ['water_ml', 'Daily water (ml)', { min: 500, max: 10000, step: 50 }, 'target_water_ml'],
];

export default function Goals() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery({ queryKey: ['goals'], queryFn: () => api.get('/goals/') });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { if (data) setForm(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))); }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/goals/', Object.fromEntries(FIELDS.map(([k, , , apiKey]) => [apiKey, form[k] === '' ? '' : Number(form[k])]))),
    onSuccess: () => { toast('Goals updated'); queryClient.invalidateQueries({ queryKey: ['goals'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); navigate('/dashboard'); },
    onError: (e) => setErr(e),
  });

  if (isLoading || (!form && !error)) return <Loading />;
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  const named = FIELDS.some(([, , , apiKey]) => err?.fields?.[apiKey]);

  return (
    <div>
      <PageHeader eyebrow="Targets" title="Daily Goals" />
      <Card className="p-8 max-w-2xl">
        <form onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }} noValidate>
          <ErrorBox>{err && !named ? err.message : ''}</ErrorBox>
          {FIELDS.map(([k, label, attrs, apiKey]) => (
            <Field key={k} label={label} htmlFor={`g-${k}`} error={fieldError(err, apiKey)} hint={`Between ${attrs.min.toLocaleString()} and ${attrs.max.toLocaleString()}`}>
              <input id={`g-${k}`} className="field" type="number" {...attrs} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </Field>
          ))}
          <div className="flex gap-3 mt-8">
            <Button type="submit" size="lg" loading={save.isPending}>Save goals</Button>
            <Link to="/dashboard" className="px-8 py-4 border border-white/15 text-white font-bold text-sm hover:border-white/40">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
