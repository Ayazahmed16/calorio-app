import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Button, ErrorBox, Field } from '../components/ui';
import { CLASSIC_URL } from '../api';

export function AuthShell({ eyebrow, title, children, footer }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <header className="flex items-center justify-between px-6 md:px-8 py-4 border-b border-white/10">
        <span className="text-xl font-black tracking-tighter">Calorio</span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-500 hidden sm:block">Precision Nutrition</span>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-[#141414] border border-white/10 shadow-2xl p-8 page-in">
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-2">{eyebrow}</p>
          <h1 className="text-4xl font-black tracking-tighter mb-8">{title}</h1>
          {children}
          <div className="mt-6 text-center font-mono text-xs text-neutral-400">{footer}</div>
        </div>
      </main>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell eyebrow="Secure access" title="Log In"
      footer={<>
        <p>New here? <Link to="/signup" className="text-white underline">Create an account</Link></p>
        <p className="mt-3"><a href={`${CLASSIC_URL}/accounts/password-reset/`} className="text-neutral-500 hover:text-white" target="_blank" rel="noopener noreferrer">Forgot password?</a></p>
      </>}>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{error}</ErrorBox>
        <Field label="Username" htmlFor="username">
          <input id="username" className="field" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full mt-2" loading={busy} disabled={!username || !password}>Log In</Button>
      </form>
    </AuthShell>
  );
}
