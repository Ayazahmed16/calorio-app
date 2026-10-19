export const num = (n, digits = 1) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v * 10 ** digits) / 10 ** digits);
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parse = (iso) => new Date(`${iso}T00:00:00`);
export const shiftDay = (iso, days) => {
  const d = parse(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dayLabel = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) =>
  parse(iso).toLocaleDateString('en-US', opts);

export const MEAL_TYPES = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
export const GROUPS = [
  ['protein', 'Protein', 'Meat, fish, eggs, dairy, legumes...'],
  ['carbs', 'Carbs', 'Rice, bread, pasta, potatoes, fruit...'],
  ['fats', 'Fats', 'Oils, butter, nuts, seeds, avocado...'],
  ['other', 'Other', 'Vegetables, drinks, sauces, anything else'],
];
