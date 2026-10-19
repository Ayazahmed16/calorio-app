import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Button, ErrorBox, Field } from '../components/ui';
import { fieldError } from '../api';
import { AuthShell } from './Login';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password1: '', password2: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await signup(form);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setErr(error);
      setBusy(false);
    }
  };

  const general = err && !err.fields?.username && !err.fields?.password1 && !err.fields?.password2 && !err.fields?.email ? err.message : '';
  return (
    <AuthShell eyebrow="Create account" title="Sign Up" footer={<p>Already have an account? <Link to="/login" className="text-white underline">Log in</Link></p>}>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{general}</ErrorBox>
        <Field label="Username" htmlFor="su-username" error={fieldError(err, 'username')}>
          <input id="su-username" className="field" autoComplete="username" value={form.username} onChange={set('username')} />
        </Field>
        <Field label="Email (optional)" htmlFor="su-email" error={fieldError(err, 'email')}>
          <input id="su-email" className="field" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" htmlFor="su-p1" error={fieldError(err, 'password1')}>
          <input id="su-p1" className="field" type="password" autoComplete="new-password" value={form.password1} onChange={set('password1')} />
        </Field>
        <Field label="Confirm password" htmlFor="su-p2" error={fieldError(err, 'password2')}>
          <input id="su-p2" className="field" type="password" autoComplete="new-password" value={form.password2} onChange={set('password2')} />
        </Field>
        <Button type="submit" size="lg" className="w-full mt-2" loading={busy}>Create Account</Button>
      </form>
    </AuthShell>
  );
}
