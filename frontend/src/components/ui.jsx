import { Link } from 'react-router-dom';

const cx = (...c) => c.filter(Boolean).join(' ');

export function PageHeader({ eyebrow, title, children, subtitle }) {
  return (
    <div className="mb-8 md:mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-2">{eyebrow}</p>}
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white">{title}</h1>
        {subtitle && <p className="mt-3 text-sm text-neutral-400 max-w-xl">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export function Card({ className = '', children, hover = false, ...rest }) {
  return <div className={cx('bg-[#141414] border border-white/10', hover && 'spot', className)} {...rest}>{children}</div>;
}

const BTN = {
  solid: 'btn-solid bg-white text-black font-bold hover:bg-neutral-200',
  outline: 'border border-white/20 text-white font-bold hover:border-white/50',
  danger: 'btn-solid bg-red-500 text-white font-bold hover:bg-red-400',
  ghost: 'text-neutral-400 hover:text-white',
};
const SIZE = { md: 'px-6 py-3 text-sm', lg: 'px-10 py-4', sm: 'px-4 py-2 text-xs' };

export function Button({ variant = 'solid', size = 'md', loading = false, className = '', children, disabled, ...rest }) {
  return (
    <button className={cx('whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed', BTN[variant], SIZE[size], className)}
      disabled={disabled || loading} {...rest}>
      {loading ? 'Please wait...' : children}
    </button>
  );
}

export function LinkButton({ to, variant = 'solid', size = 'md', className = '', children, ...rest }) {
  return <Link to={to} className={cx('inline-block whitespace-nowrap text-center', BTN[variant], SIZE[size], className)} {...rest}>{children}</Link>;
}

export function Field({ label, error, hint, htmlFor, children }) {
  return (
    <div className="mb-5">
      {label && <label className="lbl" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <p className="mt-2 font-mono text-[11px] text-neutral-500">{hint}</p>}
      {error && <p className="mt-2 font-mono text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="mb-5 border-l-2 border-red-500 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-300">{children}</div>;
}

export function Loading({ label = 'Loading...' }) {
  return <p className="font-mono text-xs text-neutral-500 py-10 fade-in">{label}</p>;
}

export function Empty({ children }) {
  return <p className="px-6 md:px-8 py-8 font-mono text-xs text-neutral-500">{children}</p>;
}

export function ProgressBar({ value, className = 'bg-white' }) {
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div className={cx('fillbar h-full rounded-full', className)} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </div>
  );
}

export function StatCard({ label, children, sub }) {
  return (
    <Card hover className="p-4 md:p-6 flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">{label}</span>
      <span className="text-3xl md:text-4xl font-black tracking-tighter text-white mt-4">{children}</span>
      {sub && <span className="font-mono text-[10px] text-neutral-500 mt-2">{sub}</span>}
    </Card>
  );
}

export function Pager({ page, numPages, onPage }) {
  if (!numPages || numPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-6 font-mono text-xs text-neutral-400">
      <span>Page {page} of {numPages}</span>
      <div className="flex gap-3">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= numPages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex border border-white/15 rounded-sm overflow-hidden font-mono text-xs">
      {options.map(([key, label]) => (
        <button key={key || 'all'} type="button" onClick={() => onChange(key)}
          className={cx('px-4 py-3 cursor-pointer whitespace-nowrap transition-colors', value === key ? 'bg-white text-black font-bold' : 'text-neutral-400 hover:text-white')}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', busy, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4 fade-in" role="dialog" aria-modal="true" aria-label={title}>
      <Card className="w-full max-w-md p-8 border-l-2 border-l-red-500">
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-neutral-400 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <Button variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}

export function Icon({ name, size = 20, className = '' }) {
  return <span className={cx('material-symbols-outlined', className)} style={{ fontSize: size }} aria-hidden="true">{name}</span>;
}
