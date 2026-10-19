import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, download, fieldError, setToken, upload } from '../api';
import { API_URL } from '../api';
import { Button, Card, ErrorBox, Field, LinkButton, Loading, PageHeader } from '../components/ui';
import { useToast } from '../toast';

function ProfileCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['account'], queryFn: () => api.get('/account/') });
  const [email, setEmail] = useState('');
  const [err, setErr] = useState(null);
  useEffect(() => { if (data) setEmail(data.email || ''); }, [data]);
  const save = useMutation({
    mutationFn: () => api.put('/account/', { email }),
    onSuccess: () => { toast(email ? 'Email saved' : 'Email removed'); setErr(null); queryClient.invalidateQueries({ queryKey: ['account'] }); },
    onError: (e) => setErr(e),
  });
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-white mb-4">Profile</h2>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <Field label="Username" htmlFor="ac-user"><input id="ac-user" className="field opacity-60" value={data?.username || ''} readOnly /></Field>
        <Field label="Email" htmlFor="ac-email" error={fieldError(err, 'email')} hint="Used for password resets and the weekly summary."><input id="ac-email" className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit" loading={save.isPending}>Save</Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ old_password: '', new_password1: '', new_password2: '' });
  const [err, setErr] = useState(null);
  const save = useMutation({
    mutationFn: () => api.post('/account/password/', form),
    onSuccess: () => { toast('Password changed'); setForm({ old_password: '', new_password1: '', new_password2: '' }); setErr(null); },
    onError: (e) => setErr(e),
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-white mb-4">Change password</h2>
      <form onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }} noValidate>
        <Field label="Current password" htmlFor="pw-old" error={fieldError(err, 'old_password')}><input id="pw-old" className="field" type="password" autoComplete="current-password" value={form.old_password} onChange={set('old_password')} /></Field>
        <Field label="New password" htmlFor="pw-1" error={fieldError(err, 'new_password1')}><input id="pw-1" className="field" type="password" autoComplete="new-password" value={form.new_password1} onChange={set('new_password1')} /></Field>
        <Field label="Confirm new password" htmlFor="pw-2" error={fieldError(err, 'new_password2')}><input id="pw-2" className="field" type="password" autoComplete="new-password" value={form.new_password2} onChange={set('new_password2')} /></Field>
        <Button type="submit" loading={save.isPending}>Update password</Button>
      </form>
    </Card>
  );
}

function DataCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState('meals');
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [inputKey, setInputKey] = useState(0);        // remounts the file input so the same file can be picked again
  const exp = async (k) => { try { await download(`/account/export/${k}/`, `calorio-${k}.csv`); } catch (e) { toast(e.message, 'error'); } };
  const imp = useMutation({
    mutationFn: () => { const fd = new FormData(); fd.append('kind', kind); fd.append('file', file); return upload('/account/import/', fd); },
    onSuccess: (r) => { toast(`Imported ${r.imported} ${r.kind} row${r.imported === 1 ? '' : 's'}`); setMsg(''); setFile(null); setInputKey((k) => k + 1); queryClient.invalidateQueries(); },
    onError: (e) => setMsg(e.message || (e.fields?.file?.[0]) || 'Import failed.'),
  });
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-white mb-4">Your data</h2>
      <div className="flex flex-wrap gap-3 mb-6">
        {['meals', 'activity', 'weight'].map((k) => <Button key={k} variant="outline" size="sm" onClick={() => exp(k)}>Export {k}</Button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (file) imp.mutate(); }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Import from CSV</p>
        <ErrorBox>{msg}</ErrorBox>
        <Field label="What are you importing?" htmlFor="im-kind"><select id="im-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value)}><option value="meals">Meals</option><option value="activity">Activity</option><option value="weight">Weight</option></select></Field>
        <Field label="CSV file" htmlFor="im-file"><input key={inputKey} id="im-file" className="field" type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0] || null)} /></Field>
        <Button type="submit" disabled={!file} loading={imp.isPending}>Import</Button>
        <p className="mt-4 font-mono text-[10px] leading-relaxed text-neutral-500">
          meals: date, meal_type, food, quantity_grams<br />activity: date, steps, calories_burned, activity_type<br />weight: date, weight_kg<br />
          Dates are YYYY-MM-DD. Foods must already exist. If any row is invalid, nothing is imported.
        </p>
      </form>
    </Card>
  );
}

function TokenCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['account'], queryFn: () => api.get('/account/') });
  const [show, setShow] = useState(false);
  const regen = useMutation({
    mutationFn: () => api.post('/account/token/'),
    onSuccess: (r) => { setToken(r.token); toast('New API token generated. Other devices are signed out.'); queryClient.invalidateQueries({ queryKey: ['account'] }); },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-white mb-2">API access</h2>
      <p className="font-mono text-[10px] leading-relaxed text-neutral-500 mb-4">Use this token from an app or script. Keep it secret. It is also what keeps you signed in here, so generating a new one signs out your other devices.</p>
      <div className="bg-[#1f1f1f] px-4 py-3 font-mono text-xs text-white break-all mb-4">{show ? data?.api_token : '•'.repeat(32)}</div>
      <div className="flex gap-3 mb-5">
        <Button variant="outline" size="sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'} token</Button>
        <Button variant="outline" size="sm" onClick={() => regen.mutate()} loading={regen.isPending}>Generate new token</Button>
      </div>
      <pre className="bg-[#0a0a0a] border border-white/10 p-4 font-mono text-[11px] text-neutral-300 overflow-x-auto leading-relaxed">{`curl ${API_URL}/api/v1/dashboard/ \\\n  -H "Authorization: Token YOUR_TOKEN"`}</pre>
    </Card>
  );
}

export default function Account() {
  const { isLoading } = useQuery({ queryKey: ['account'], queryFn: () => api.get('/account/') });
  if (isLoading) return <Loading />;
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Account"><LinkButton to="/connections" variant="outline">Connections</LinkButton></PageHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6"><ProfileCard /><PasswordCard /></div>
        <div className="space-y-6"><DataCard /><TokenCard /></div>
      </div>
      <p className="mt-8 font-mono text-[10px] text-neutral-600">Forgot your password? Use <Link to="/login" className="underline">Log in</Link> then “Forgot password?”.</p>
    </div>
  );
}
