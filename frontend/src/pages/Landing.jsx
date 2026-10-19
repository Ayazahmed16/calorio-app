import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';

function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`transition-all duration-700 ease-[cubic-bezier(.16,1,.3,1)] ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}>{children}</div>;
}

const FEATURES = [
  ['restaurant', 'Meal logging', 'Build your plate by group: protein, carbs and fats. Values scale to your exact portion automatically.'],
  ['monitoring', 'Daily totals', 'See calories, protein and macros the moment you log a meal, next to your steps and calories burned.'],
  ['directions_run', 'Activity tracking', 'Record steps, calories burned and the type of activity, so food and movement live in one place.'],
];
const STEPS = [
  ['Log your meal', 'Search a food, enter the grams, and save the whole plate at once.'],
  ['Add your activity', 'Record your steps and calories burned, or sync them from Fitbit.'],
  ['Review your dashboard', 'Check your totals, goals and trends, and look back through your full history.'],
];
const BENEFITS = [
  ['Accurate portions', 'Calories and protein come from the exact grams you enter.'],
  ['Everything in one view', 'Meals, steps, water and weight on a single dashboard.'],
  ['Private to you', 'Every entry belongs to your account and is only visible to you.'],
];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const go = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] overflow-x-hidden">
      <header className={`fixed top-0 w-full z-50 backdrop-blur-md border-b border-white/10 transition-colors duration-500 ${scrolled ? 'bg-[#0a0a0a]/95' : 'bg-[#0a0a0a]/80'}`}>
        <div className={`max-w-6xl mx-auto flex items-center justify-between px-6 transition-all duration-500 ${scrolled ? 'h-[52px]' : 'h-16'}`}>
          <a href="#top" onClick={go('top')} className="text-lg font-bold tracking-tight text-white">Calorio</a>
          <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-400">
            <a href="#features" onClick={go('features')} className="hover:text-white transition-colors">Features</a>
            <a href="#how" onClick={go('how')} className="hover:text-white transition-colors">How it works</a>
            <a href="#why" onClick={go('why')} className="hover:text-white transition-colors">Why Calorio</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm text-neutral-400 hover:text-white transition-colors">Log in</Link>
            <Link to="/signup" className="btn-solid bg-white text-black text-sm font-semibold px-4 py-2 rounded-md">Get started</Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative pt-40 pb-28 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-60" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)', backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse at top,#000 20%,transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at top,#000 20%,transparent 70%)' }} />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] max-w-full h-[400px] bg-white/10 blur-[140px] rounded-full pointer-events-none" />
          <div className="relative max-w-3xl mx-auto px-6 text-center page-in">
            <p className="inline-block text-xs font-medium text-neutral-300 bg-white/10 border border-white/20 rounded-full px-3 py-1 mb-8">Nutrition &amp; activity tracking</p>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">Track what you eat.<br /><span className="text-neutral-400">Understand your day.</span></h1>
            <p className="text-lg text-neutral-400 leading-relaxed max-w-xl mx-auto mb-10">Calorio makes it simple to log meals, monitor protein and calories, and keep tabs on your daily activity, all from one clean dashboard.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/signup" className="btn-solid bg-white text-black font-semibold px-7 py-3 rounded-md">Get started</Link>
              <a href="#how" onClick={go('how')} className="border border-white/20 hover:bg-white/5 text-white font-semibold px-7 py-3 rounded-md transition-colors">See how it works</a>
            </div>
          </div>
        </section>

        <section id="features" className="py-24 border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6">
            <Reveal className="max-w-2xl mb-14">
              <p className="text-sm font-medium text-neutral-400 mb-3">Features</p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">Everything you need to stay on track</h2>
              <p className="text-neutral-400 leading-relaxed">A focused set of tools for logging and reviewing your nutrition, without the clutter.</p>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES.map(([icon, title, text], i) => (
                <Reveal key={title}><div className="spot bg-[#141414] border border-white/10 rounded-lg p-7 h-full" style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="w-10 h-10 rounded-md bg-white/10 text-white flex items-center justify-center mb-5"><Icon name={icon} size={22} /></div>
                  <h3 className="font-semibold text-white mb-2">{title}</h3><p className="text-sm text-neutral-400 leading-relaxed">{text}</p>
                </div></Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="py-24 bg-white/[0.02] border-y border-white/10">
          <div className="max-w-6xl mx-auto px-6">
            <Reveal className="max-w-2xl mb-14"><p className="text-sm font-medium text-neutral-400 mb-3">How it works</p><h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Three steps, under a minute</h2></Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {STEPS.map(([title, text], i) => (
                <Reveal key={title}><div>
                  <div className="flex items-center gap-3 mb-4"><span className="text-sm font-mono text-white">0{i + 1}</span><span className="hidden md:block h-px flex-1 bg-white/10" /></div>
                  <h3 className="text-lg font-semibold text-white mb-2">{title}</h3><p className="text-sm text-neutral-400 leading-relaxed">{text}</p>
                </div></Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="why" className="py-24">
          <Reveal className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10">
            <div><p className="text-sm font-medium text-neutral-400 mb-3">Why Calorio</p><h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">Simple by design</h2><p className="text-neutral-400 leading-relaxed">No noise, no complicated setup. Just the numbers that matter for your daily nutrition.</p></div>
            <ul className="space-y-5">
              {BENEFITS.map(([t, d]) => <li key={t} className="flex gap-4"><Icon name="check_circle" size={22} className="text-white" /><div><p className="font-medium text-white">{t}</p><p className="text-sm text-neutral-400">{d}</p></div></li>)}
            </ul>
          </Reveal>
        </section>

        <section className="pb-28">
          <Reveal className="max-w-4xl mx-auto px-6">
            <div className="bg-[#141414] border border-white/10 rounded-xl px-8 py-14 text-center">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">Start tracking today</h2>
              <p className="text-neutral-400 mb-8 max-w-md mx-auto">Log your first meal in under a minute.</p>
              <Link to="/signup" className="btn-solid inline-block bg-white text-black font-semibold px-8 py-3 rounded-md">Get started</Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-neutral-500">
          <span className="font-semibold text-white">Calorio</span><span>&copy; 2026 Calorio. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
