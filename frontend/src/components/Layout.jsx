import { useLayoutEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon } from './ui';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/meals', label: 'Meals', icon: 'restaurant', children: [
    { to: '/meals/new', label: 'Add Meal', icon: 'add_circle' }, { to: '/saved', label: 'Saved Meals', icon: 'bookmark' }] },
  { to: '/activity', label: 'Activity', icon: 'directions_run', children: [{ to: '/activity/new', label: 'Add Activity', icon: 'bolt' }] },
  { to: '/weight', label: 'Weight', icon: 'monitor_weight' },
  { to: '/analytics', label: 'Analytics', icon: 'monitoring' },
  { to: '/foods', label: 'Foods', icon: 'nutrition' },
  { to: '/recipes', label: 'Recipes', icon: 'menu_book' },
  { to: '/goals', label: 'Goals', icon: 'flag', children: [{ to: '/calculator', label: 'Calculator', icon: 'calculate' }] },
];

const linkCls = (active, indent = false) =>
  `relative z-10 flex items-center gap-3 rounded-sm py-3 transition-colors ${indent ? 'pl-3 md:pl-9 pr-3' : 'px-3'} ${active ? 'text-black font-bold' : 'text-neutral-400 hover:text-white'}`;
const labelCls = 'hidden md:block font-mono text-xs uppercase tracking-widest';

function NavItem({ item, pathname, onToggle }) {
  const inGroup = pathname === item.to || pathname.startsWith(`${item.to}/`) || (item.children || []).some((c) => pathname.startsWith(c.to));
  const [open, setOpen] = useState(false);
  const expanded = open || inGroup;
  const childActive = (item.children || []).some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`));
  const mainActive = item.children ? (pathname === item.to || pathname.startsWith(`${item.to}/`)) && !childActive : pathname === item.to || pathname.startsWith(`${item.to}/`);

  return (
    <div>
      <div className="flex items-stretch">
        <Link to={item.to} data-active={mainActive} className={`flex-1 ${linkCls(mainActive)}`} aria-current={mainActive ? 'page' : undefined}>
          <Icon name={item.icon} size={24} /><span className={labelCls}>{item.label}</span>
        </Link>
        {item.children && (
          <button type="button" onClick={() => { setOpen(!expanded); onToggle(); }} aria-expanded={expanded} aria-label={`Toggle ${item.label} menu`}
            className="relative z-10 hidden md:flex items-center px-2 text-neutral-500 hover:text-white cursor-pointer">
            <Icon name="expand_more" className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {item.children && (
        <div className={`grid transition-[grid-template-rows] duration-300 ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden min-h-0 flex flex-col gap-1 pt-1">
            {item.children.map((c) => {
              const active = pathname === c.to || pathname.startsWith(`${c.to}/`);
              return (
                <Link key={c.to} to={c.to} data-active={active} tabIndex={expanded ? 0 : -1} className={linkCls(active, true)} aria-current={active ? 'page' : undefined}>
                  <Icon name={c.icon} size={20} /><span className={labelCls}>{c.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const nav = useRef(null);
  const pill = useRef(null);
  const [tick, setTick] = useState(0);

  // The white highlight glides to the active link (and follows it while a dropdown opens or closes).
  useLayoutEffect(() => {
    let raf;
    const t0 = performance.now();
    const place = (t) => {
      const navEl = nav.current, pillEl = pill.current;
      if (!navEl || !pillEl) return;
      const el = [...navEl.querySelectorAll('[data-active="true"]')].find((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0);
      if (el) {
        const nr = navEl.getBoundingClientRect(), er = el.getBoundingClientRect();
        pillEl.style.height = `${er.height}px`;
        pillEl.style.transform = `translateY(${er.top - nr.top + navEl.scrollTop}px)`;
        pillEl.style.opacity = '1';
      } else pillEl.style.opacity = '0';
      if (t - t0 < 500) raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [pathname, tick]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <aside className="fixed left-0 top-0 h-full z-40 flex flex-col py-8 px-4 bg-[#141414] w-20 md:w-64 border-r border-white/10">
        <div className="mb-10 px-2">
          <p className="text-xl font-black tracking-tighter text-white hidden md:block">Calorio</p>
          <span className="md:hidden"><Icon name="local_fire_department" size={24} className="text-white" /></span>
          <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500 mt-1 hidden md:block">Precision Nutrition</p>
        </div>
        <nav ref={nav} className="relative flex flex-col gap-1 flex-1 overflow-y-auto min-h-0" aria-label="Main">
          <div ref={pill} className="absolute left-0 right-0 top-0 z-0 rounded-sm bg-white shadow-[0_8px_24px_rgba(255,255,255,.12)] opacity-0 transition-[transform,height,opacity] duration-500 ease-[cubic-bezier(.16,1,.3,1)]" />
          {NAV.map((item) => <NavItem key={item.to} item={item} pathname={pathname} onToggle={() => setTick((n) => n + 1)} />)}
        </nav>
        <button type="button" onClick={logout} className={`${linkCls(false)} border-t border-white/10 rounded-none pt-4 mt-3 cursor-pointer`}>
          <Icon name="logout" size={24} /><span className={labelCls}>Log out</span>
        </button>
      </aside>

      <header className="fixed top-0 right-0 left-20 md:left-64 z-30 bg-[#0a0a0a]/85 backdrop-blur-md border-b border-white/10 flex justify-end items-center gap-5 px-6 md:px-8 py-4">
        <Link to="/connections" className="hidden sm:flex items-center gap-1 font-mono text-xs text-neutral-400 hover:text-white"><Icon name="sync_alt" size={18} />Connections</Link>
        <Link to="/account" className="flex items-center gap-2 font-mono text-xs text-neutral-300 hover:text-white"><Icon name="account_circle" size={20} />{user?.username}</Link>
      </header>

      <main className="relative z-10 ml-20 md:ml-64 pt-24 md:pt-28 pb-16 px-4 md:px-12 page-in" key={pathname.split('/')[1]}>
        <Outlet />
      </main>
    </div>
  );
}
