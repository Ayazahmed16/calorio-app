import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../api';
import { dayLabel, num, shiftDay, todayISO } from '../format';
import { Button, Card, Empty, ErrorBox, Icon, Loading, LinkButton, PageHeader, ProgressBar, StatCard } from '../components/ui';
import FoodThumb from '../components/FoodThumb';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const date = params.get('date') && params.get('date') <= today ? params.get('date') : today;
  const isToday = date === today;

  const { data, error, isLoading } = useQuery({ queryKey: ['dashboard', date], queryFn: () => api.get(`/dashboard/${qs({ date })}`) });

  const addWater = useMutation({
    mutationFn: (amount_ml) => api.post('/water/', { amount_ml, date }),
    onSuccess: (d) => { toast(`Water: ${d.amount_ml} ml`); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => toast(e.message, 'error'),
  });

  const go = (d) => setParams(d === today ? {} : { date: d });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  const { totals, goals, progress, water, weight, streak, activity, meals } = data;

  return (
    <div>
      <PageHeader eyebrow={isToday ? "Today's summary" : `Summary for ${dayLabel(date)}`} title={`Welcome, ${user.username}`}>
        <div className="flex items-center border border-white/15 rounded-sm font-mono text-xs">
          <button type="button" onClick={() => go(shiftDay(date, -1))} className="px-3 py-3 text-neutral-400 hover:text-white cursor-pointer" aria-label="Previous day"><Icon name="chevron_left" size={18} /></button>
          <span className="px-3 text-white min-w-14 text-center">{isToday ? 'Today' : dayLabel(date, { month: 'short', day: 'numeric' })}</span>
          <button type="button" disabled={isToday} onClick={() => go(shiftDay(date, 1))} className="px-3 py-3 text-neutral-400 hover:text-white disabled:opacity-25 cursor-pointer" aria-label="Next day"><Icon name="chevron_right" size={18} /></button>
          {!isToday && <button type="button" onClick={() => go(today)} className="px-3 py-3 border-l border-white/15 text-white cursor-pointer">Today</button>}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatCard label="Total calories">{num(totals.calories)}</StatCard>
        <StatCard label="Total protein">{num(totals.protein)}<span className="text-lg text-neutral-400 ml-1">g</span></StatCard>
        <StatCard label="Steps">{activity ? activity.steps : '—'}</StatCard>
        <StatCard label="Calories burned">{activity ? num(activity.calories_burned) : '—'}</StatCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <Card hover className="p-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Logging streak</span>
          <div className="text-3xl font-black text-white mt-2">{streak.current}<span className="text-sm text-neutral-400 ml-2">day{streak.current === 1 ? '' : 's'}</span></div>
          <p className="font-mono text-[10px] text-neutral-500 mt-2">best {streak.best} day{streak.best === 1 ? '' : 's'}</p>
        </Card>
        <Card hover className="p-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Weight</span>
          <div className="text-3xl font-black text-white mt-2">{weight ? <>{num(weight.weight_kg)}<span className="text-sm text-neutral-400 ml-1">kg</span></> : '—'}</div>
          <Link to="/weight" className="inline-block font-mono text-[11px] text-white underline mt-2">{weight ? 'View trend' : 'Log your weight'}</Link>
        </Card>
        <Card hover className="p-5">
          <div className="flex justify-between items-baseline">
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Water</span>
            <span className="font-mono text-[10px] text-neutral-400">{water.amount_ml} / {water.target_ml} ml</span>
          </div>
          <div className="my-3"><ProgressBar value={progress.water} className="bg-neutral-300" /></div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => addWater.mutate(250)} disabled={addWater.isPending}>+250</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => addWater.mutate(500)} disabled={addWater.isPending}>+500</Button>
            <Button variant="outline" size="sm" onClick={() => addWater.mutate(-250)} disabled={addWater.isPending || water.amount_ml <= 0} title="Undo 250 ml">−</Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <StatCard label="Carbs">{num(totals.carbs)}<span className="text-sm text-neutral-400 ml-1">g</span></StatCard>
        <StatCard label="Fat">{num(totals.fat)}<span className="text-sm text-neutral-400 ml-1">g</span></StatCard>
        <StatCard label="Net"><span>{num(totals.net_calories)}</span></StatCard>
      </div>

      <Card hover className="p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Daily goals</p>
          <Link to="/goals" className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-white">Edit goals</Link>
        </div>
        <div className="space-y-5">
          {[['Calories', `${num(totals.calories)} / ${num(goals.calories, 0)}`, progress.calories, 'bg-white'],
            ['Protein', `${num(totals.protein)}g / ${num(goals.protein, 0)}g`, progress.protein, 'bg-neutral-200'],
            ['Steps', `${activity ? activity.steps : 0} / ${goals.steps}`, progress.steps, 'bg-neutral-400']].map(([label, text, pct, cls]) => (
            <div key={label}>
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-400 mb-2"><span>{label}</span><span>{text}</span></div>
              <ProgressBar value={pct} className={cls} />
            </div>
          ))}
        </div>
      </Card>

      {!activity && (
        <Card className="border-l-2 border-l-white p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <span className="font-mono text-xs text-neutral-400">{isToday ? 'No activity logged today.' : 'No activity logged this day.'}</span>
          <LinkButton to="/activity/new" size="sm">Log activity</LinkButton>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 md:px-8 py-5 border-b border-white/10">
          <h2 className="text-xl font-bold tracking-tight text-white">{isToday ? "Today's Meals" : `Meals on ${dayLabel(date, { month: 'short', day: 'numeric' })}`}</h2>
          <LinkButton to="/meals/new" size="sm">Add Meal</LinkButton>
        </div>
        {meals.length === 0 && <Empty>{isToday ? 'No meals logged today.' : 'No meals logged this day.'}</Empty>}
        {meals.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 px-6 md:px-8 py-4 border-b border-white/5 last:border-0 hover:bg-white/5">
            <div className="flex items-center gap-3 min-w-0">
              <FoodThumb image={m.food_image} emoji={m.food_emoji} size={36} />
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{m.food_name}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mt-1">{m.meal_type} · {num(m.quantity_grams)}g</p>
              </div>
            </div>
            <span className="font-mono text-sm text-white whitespace-nowrap">{num(m.calories)} cal</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
