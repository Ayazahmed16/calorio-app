import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '../api';
import { Button, Card, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import { useToast } from '../toast';

const Badge = ({ on, onText = 'Connected', offText = 'Not connected' }) => (
  <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 border ${on ? 'border-white/50 text-white' : 'border-white/15 text-neutral-500'}`}>{on ? onText : offText}</span>
);
const Setup = ({ children }) => <div className="border-l-2 border-white/40 bg-[#0a0a0a] p-4 font-mono text-[11px] leading-relaxed text-neutral-400">{children}</div>;

export default function Connections() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, error, isLoading } = useQuery({ queryKey: ['connections'], queryFn: () => api.get('/connections/') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['connections'] });
  const run = (fn, ok) => ({ mutationFn: fn, onSuccess: (r) => { ok && toast(typeof ok === 'function' ? ok(r) : ok); refresh(); }, onError: (e) => toast(e.message, 'error') });

  // the Fitbit login sends the browser back here with ?fitbit=<result>
  useEffect(() => {
    const f = params.get('fitbit');
    if (!f) return;
    const text = { connected: 'Fitbit connected and synced.', denied: 'Fitbit access was not granted.', invalid: 'Fitbit sign-in could not be verified. Please try again.', error: 'Fitbit connection failed. Please try again.' }[f];
    if (text) toast(text, f === 'connected' ? 'success' : 'error');
    setParams({}, { replace: true });
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fitbitConnect = useMutation(run(async () => { const r = await api.post('/connections/fitbit/connect/'); window.location.href = r.auth_url; }));
  const fitbitSync = useMutation(run((days) => api.post('/connections/fitbit/sync/', { days }), (r) => `Synced ${r.days} day(s) of activity and ${r.weights} weight(s).`));
  const fitbitOff = useMutation(run(() => api.post('/connections/fitbit/disconnect/'), 'Fitbit disconnected. Imported data stays.'));
  const tgConnect = useMutation(run(() => api.post('/connections/telegram/connect/'), 'Open the Telegram link below and press Start.'));
  const tgOff = useMutation(run(() => api.post('/connections/telegram/disconnect/'), 'Telegram disconnected.'));
  const tgTest = useMutation(run(() => api.post('/connections/telegram/test/'), 'Test message sent to Telegram.'));
  const emailTest = useMutation(run(() => api.post('/connections/email/test/'), (r) => `Test email sent. Check ${r.smtp ? 'your inbox' : 'the server log (no SMTP configured)'}.`));

  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState(null);
  const [notif, setNotif] = useState(null);
  const [notifErr, setNotifErr] = useState(null);
  useEffect(() => { if (data) { setEmail(data.email || ''); setNotif({ ...data.notifications }); } }, [data]);
  const saveEmail = useMutation({ mutationFn: () => api.put('/account/', { email }), onSuccess: () => { toast('Email saved'); setEmailErr(null); refresh(); }, onError: (e) => setEmailErr(e) });
  const saveNotif = useMutation({ mutationFn: () => api.put('/connections/notifications/', notif), onSuccess: () => { toast('Notification settings saved'); setNotifErr(null); refresh(); }, onError: (e) => setNotifErr(e) });

  if (isLoading || !notif) return error ? <ErrorBox>{error.message}</ErrorBox> : <Loading />;
  const { fitbit, telegram } = data;

  return (
    <div>
      <PageHeader eyebrow="Integrations" title="Connections" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        <Card hover className="p-6">
          <div className="flex items-start justify-between gap-4 mb-3"><h2 className="text-lg font-bold text-white">Fitbit</h2><Badge on={fitbit.connected} /></div>
          <p className="text-sm text-neutral-400 leading-relaxed mb-5">Import steps, calories burned and weight from your Fitbit automatically instead of typing them.</p>
          {fitbit.connected ? (
            <>
              <p className="font-mono text-[11px] text-neutral-500 mb-4">Last synced: {fitbit.last_synced ? new Date(fitbit.last_synced).toLocaleString() : 'never'}</p>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" onClick={() => fitbitSync.mutate(7)} loading={fitbitSync.isPending}>Sync last 7 days</Button>
                <Button size="sm" variant="outline" onClick={() => fitbitSync.mutate(30)} disabled={fitbitSync.isPending}>Sync 30 days</Button>
                <Button size="sm" variant="ghost" onClick={() => fitbitOff.mutate()}>Disconnect</Button>
              </div>
            </>
          ) : fitbit.configured ? (
            <Button onClick={() => fitbitConnect.mutate()} loading={fitbitConnect.isPending}>Connect Fitbit</Button>
          ) : (
            <Setup>Not set up yet. Create a free app at <b className="text-white">dev.fitbit.com/apps</b>, set its redirect URL to<br /><span className="text-white break-all">{fitbit.redirect_uri}</span><br />then set <b className="text-white">FITBIT_CLIENT_ID</b> and <b className="text-white">FITBIT_CLIENT_SECRET</b> on the server.</Setup>
          )}
        </Card>

        <Card hover className="p-6">
          <div className="flex items-start justify-between gap-4 mb-3"><h2 className="text-lg font-bold text-white">Telegram reminders</h2><Badge on={telegram.connected} /></div>
          <p className="text-sm text-neutral-400 leading-relaxed mb-5">Get meal reminders with your progress, and message the bot <span className="font-mono text-white">/today</span> or <span className="font-mono text-white">/water 250</span> from your phone.</p>
          {!telegram.configured ? (
            <Setup>Not set up yet. Create a bot with <b className="text-white">@BotFather</b>, then set <b className="text-white">TELEGRAM_BOT_TOKEN</b> and <b className="text-white">TELEGRAM_BOT_USERNAME</b> on the server.</Setup>
          ) : telegram.connected ? (
            <div className="flex flex-wrap gap-3"><Button size="sm" variant="outline" onClick={() => tgTest.mutate()} loading={tgTest.isPending}>Send test message</Button><Button size="sm" variant="ghost" onClick={() => tgOff.mutate()}>Disconnect</Button></div>
          ) : telegram.link ? (
            <><p className="font-mono text-[11px] text-neutral-400 mb-3">1. Open this link and press Start:</p>
              <a href={telegram.link} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 bg-white text-black font-bold text-sm mb-3">Open @{telegram.bot}</a>
              <p className="font-mono text-[11px] text-neutral-500">2. Come back and refresh this page.</p></>
          ) : <Button onClick={() => tgConnect.mutate()} loading={tgConnect.isPending}>Connect Telegram</Button>}
        </Card>

        <Card hover className="p-6">
          <div className="flex items-start justify-between gap-4 mb-3"><h2 className="text-lg font-bold text-white">Email</h2><Badge on={data.smtp} onText="SMTP on" offText="Console only" /></div>
          <p className="text-sm text-neutral-400 leading-relaxed mb-5">Used for password resets and your weekly summary.</p>
          <form onSubmit={(e) => { e.preventDefault(); setEmailErr(null); saveEmail.mutate(); }} className="flex gap-3 mb-2" noValidate>
            <input className="field" type="email" aria-label="Email address" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" loading={saveEmail.isPending}>Save</Button>
          </form>
          {emailErr && <p className="font-mono text-xs text-red-400 mb-2">{fieldError(emailErr, 'email') || emailErr.message}</p>}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => emailTest.mutate()} loading={emailTest.isPending}>Send test email</Button>
          {!data.smtp && <p className="mt-4 font-mono text-[11px] leading-relaxed text-neutral-500">No SMTP server is configured, so emails go to the server log. Set <b className="text-white">EMAIL_HOST</b>, <b className="text-white">EMAIL_HOST_USER</b> and <b className="text-white">EMAIL_HOST_PASSWORD</b> on the server for real delivery.</p>}
        </Card>

        <Card hover className="p-6">
          <h2 className="text-lg font-bold text-white mb-4">Notifications</h2>
          <form onSubmit={(e) => { e.preventDefault(); setNotifErr(null); saveNotif.mutate(); }} noValidate>
            <label className="flex items-center gap-3 mb-4 cursor-pointer"><input type="checkbox" className="accent-white w-4 h-4" checked={notif.weekly_email} onChange={(e) => setNotif({ ...notif, weekly_email: e.target.checked })} /><span className="text-sm text-white">Weekly summary email</span></label>
            <label className={`flex items-center gap-3 mb-4 cursor-pointer ${telegram.connected ? '' : 'opacity-50'}`}>
              <input type="checkbox" className="accent-white w-4 h-4" checked={notif.reminders_enabled} onChange={(e) => setNotif({ ...notif, reminders_enabled: e.target.checked })} />
              <span className="text-sm text-white">Telegram meal reminders {!telegram.connected && <span className="font-mono text-[10px] text-neutral-500">(connect Telegram first)</span>}</span>
            </label>
            <Field label="Reminder times (24-hour, comma separated)" htmlFor="rt" error={fieldError(notifErr, 'reminder_times') || fieldError(notifErr, 'reminders_enabled')}>
              <input id="rt" className="field" value={notif.reminder_times} onChange={(e) => setNotif({ ...notif, reminder_times: e.target.value })} />
            </Field>
            <Button type="submit" loading={saveNotif.isPending}>Save notifications</Button>
          </form>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-white mb-4">Food and recipe data</h2>
          <ul className="space-y-3 text-sm">
            {[['USDA FoodData Central', 'generic foods', data.usda_custom_key ? 'Your API key' : 'Shared demo key (rate limited)'], ['Open Food Facts', 'packaged products, barcodes', 'Active'], ['TheMealDB', 'recipes', 'Active'], ['Wikipedia', 'food photos', 'Active']].map(([n, d, s]) => (
              <li key={n} className="flex items-center justify-between gap-4"><span className="text-white">{n} <span className="text-neutral-500">— {d}</span></span><span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">{s}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
