import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import FoodThumb from './FoodThumb';
import { num } from '../format';

/**
 * Type-to-search food picker.
 * foods: [{id,name,calories,image,emoji}], value: selected id or '', onChange(id)
 * newFoodTo(typed): optional router path for the "add as a new food" row.
 */
export default function FoodCombobox({ foods, value, onChange, placeholder = 'Search foods...', newFoodTo, id, invalid }) {
  const selected = useMemo(() => foods.find((f) => String(f.id) === String(value)), [foods, value]);
  const [text, setText] = useState(selected ? selected.name : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef(null);

  // keep the text in sync when the chosen food changes from outside (prefill, edit page loading)
  useEffect(() => { setText(selected ? selected.name : ''); }, [selected]);

  useEffect(() => {
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const typed = text.trim();
  const query = (selected && text === selected.name ? '' : typed).toLowerCase();
  const matches = useMemo(() => {
    if (!query) return foods.slice(0, 40);
    const starts = foods.filter((f) => f.name.toLowerCase().startsWith(query));
    const has = foods.filter((f) => !f.name.toLowerCase().startsWith(query) && f.name.toLowerCase().includes(query));
    return starts.concat(has).slice(0, 40);
  }, [foods, query]);
  const exact = foods.some((f) => f.name.toLowerCase() === typed.toLowerCase());
  const showNew = !!newFoodTo && (!typed || !exact);
  const rows = [...matches.map((f) => ({ food: f })), ...(showNew ? [{ link: true }] : [])];

  const choose = (food) => { onChange(String(food.id)); setText(food.name); setOpen(false); setActive(-1); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) {
      const row = rows[active] || (matches.length === 1 ? rows[0] : null);
      if (row && row.food) { e.preventDefault(); choose(row.food); }
    } else if (e.key === 'Escape') { setOpen(false); setText(selected ? selected.name : ''); }
  };

  const onBlur = () => setTimeout(() => {
    if (!value) {
      const m = foods.find((f) => f.name.toLowerCase() === text.trim().toLowerCase());
      if (m) choose(m);
    }
  }, 150);

  return (
    <div className="relative" ref={wrap}>
      <input id={id} className={`field ${invalid ? 'ring-1 ring-red-400' : ''}`} value={text} autoComplete="off" placeholder={placeholder}
        role="combobox" aria-expanded={open} aria-autocomplete="list"
        onFocus={(e) => { e.target.select(); setOpen(true); }}
        onChange={(e) => { setText(e.target.value); onChange(''); setOpen(true); setActive(-1); }}
        onKeyDown={onKeyDown} onBlur={onBlur} />
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-y-auto bg-[#1f1f1f] border border-white/30 shadow-2xl fade-in" role="listbox">
          {matches.length === 0 && <div className="px-4 py-3 font-mono text-xs text-neutral-500">No matching food</div>}
          {matches.map((f, i) => (
            <button type="button" key={f.id} role="option" aria-selected={String(f.id) === String(value)}
              onMouseDown={(e) => { e.preventDefault(); choose(f); }}
              className={`flex items-center gap-3 w-full text-left px-3 py-2 font-mono text-[13px] cursor-pointer ${i === active ? 'bg-white/15' : 'hover:bg-white/10'}`}>
              <FoodThumb image={f.image} emoji={f.emoji} size={28} />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto text-[11px] text-neutral-500 whitespace-nowrap">{num(f.calories)} cal</span>
            </button>
          ))}
          {showNew && (
            <Link to={newFoodTo(typed)} onMouseDown={(e) => e.stopPropagation()}
              className={`block px-4 py-3 font-mono text-[13px] border-t border-white/10 text-white hover:bg-white/10 ${active === rows.length - 1 ? 'bg-white/15' : ''}`}>
              {typed && !exact ? `+ Add “${typed}” as a new food` : '+ Add a new food'}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
