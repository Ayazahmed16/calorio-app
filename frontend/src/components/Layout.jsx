import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { CLASSIC_URL } from '../api';
import { Icon } from './ui';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/meals', label: 'Meals', icon: 'restaurant', children: [{ to: '/meals/new', label: 'Add Meal', icon: 'add_circle' }] },
  { to: '/activity', label: 'Activity', icon: 'directions_run', children: [{ to: '/activity/new', label: 'Add Activity', icon: 'bolt' }] },
  { to: '/weight', label: 'Weight', icon: 'monitor_weight' },
  { to: '/foods', label: 'Foods', icon: 'nutrition' },
  { to: '/goals', label: 'Goals', icon: 'flag' },
];
const CLASSIC = [
  ['/analytics/', 'Analytics', 'monitoring'],
  ['/recipes/', 'Recipes', 'menu_book'],
  ['/saved/', 'Saved Meals', 'bookmark'],
  ['/account/', 'Account', 'manage_accounts'],
];

const linkCls = (active, indent = false) =>
  `flex items-center gap-3 rounded-sm py-3 transition-colors ${indent ? 'pl-3 md:pl-9 pr-3' : 'px-3'} ${active ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`;
const labelCls = 'hidden md:block font-mono text-xs uppercase tracking-widest';

function NavItem({ item, pathname }) {
  const childPaths = (item.children || []).map((c) => c.to);
  const inGroup = pathname === item.to || pathname.startsWith(`${item.to}/`);
  const [open, setOpen] = useState(false);
  const expanded = open || inGroup;
  const mainActive = item.children ? inGroup && !childPaths.some((p) => pathname.startsWith(p)) : inGroup;

  return (
    <div>
      <div className="flex items-stretch">
        <Link to={item.to} className={`flex-1 ${linkCls(mainActive)}`} aria-current={mainActive ? 'page' : undefined}>
          <Icon name={item.icon} size={24} /><span className={labelCls}>{item.label}</span>
        </Link>
        {item.children && (
          <button type="button" onClick={() => setOpen(!expanded)} aria-expanded={expanded} aria-label={`Toggle ${item.label} menu`}
            className="hidden md:flex items-center px-2 text-neutral-500 hover:text-white cursor-pointer">
            <Icon name="expand_more" className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {item.children && (
        <div className={`grid transition-[grid-template-rows] duration-300 ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden min-h-0 flex flex-col gap-1 pt-1">
            {item.children.map((c) => {
              const active = pathname === c.to;
              return (
                <Link key={c.to} to={c.to} tabIndex={expanded ? 0 : -1} className={linkCls(active, true)} aria-current={active ? 'page' : undefined}>
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <aside className="fixed left-0 top-0 h-full z-40 flex flex-col py-8 px-4 bg-[#141414] w-20 md:w-64 border-r border-white/10">
        <div className="mb-10 px-2">
          <p className="text-xl font-black tracking-tighter text-white hidden md:block">Calorio</p>
          <span className="md:hidden"><Icon name="local_fire_department" size={24} className="text-white" /></span>
          <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500 mt-1 hidden md:block">Precision Nutrition</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0" aria-label="Main">
          {NAV.map((item) => <NavItem key={item.to} item={item} pathname={pathname} />)}
          <p className="hidden md:block mt-5 mb-1 px-3 font-mono text-[10px] uppercase tracking-widest text-neutral-600">Classic site</p>
          {CLASSIC.map(([path, label, icon]) => (
            <a key={path} href={`${CLASSIC_URL}${path}`} target="_blank" rel="noopener noreferrer" className={linkCls(false)} title={`${label} (opens the classic site)`}>
              <Icon name={icon} size={24} /><span className={labelCls}>{label}</span>
            </a>
          ))}
        </nav>
        <button type="button" onClick={logout} className={`${linkCls(false)} border-t border-white/10 rounded-none pt-4 mt-3 cursor-pointer`}>
          <Icon name="logout" size={24} /><span className={labelCls}>Log out</span>
        </button>
      </aside>

      <header className="fixed top-0 right-0 left-20 md:left-64 z-30 bg-[#0a0a0a]/85 backdrop-blur-md border-b border-white/10 flex justify-end items-center px-6 md:px-8 py-4">
        <span className="flex items-center gap-2 font-mono text-xs text-neutral-300"><Icon name="account_circle" size={20} />{user?.username}</span>
      </header>

      <main className="relative z-10 ml-20 md:ml-64 pt-24 md:pt-28 pb-16 px-4 md:px-12 page-in" key={pathname.split('/')[1]}>
        <Outlet />
      </main>
    </div>
  );
}
