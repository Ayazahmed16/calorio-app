"""CSV export and import shared by the classic pages and the JSON API."""
import csv
import io

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone

from .forms import ActivityForm, MealForm, WeightForm
from .models import ActivityEntry, Food, MealEntry, WeightEntry

MAX_IMPORT_ROWS = 5000
KINDS = ('meals', 'activity', 'weight')
REQUIRED = {'meals': {'date', 'meal_type', 'food', 'quantity_grams'},
            'activity': {'date', 'steps', 'calories_burned'},
            'weight': {'date', 'weight_kg'}}


def _cell(value):
    """Neutralise spreadsheet formulas in user-controlled text."""
    s = str(value)
    return "'" + s if s[:1] in ('=', '+', '-', '@', '\t', '\r') else s


def export_response(user, kind):
    resp = HttpResponse(content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = f'attachment; filename="calorio-{kind}-{timezone.localdate()}.csv"'
    w = csv.writer(resp)
    if kind == 'meals':
        w.writerow(['date', 'meal_type', 'food', 'quantity_grams', 'calories', 'protein', 'carbs', 'fat'])
        for m in MealEntry.objects.filter(user=user).select_related('food').order_by('date', 'id'):
            w.writerow([m.date, m.meal_type, _cell(m.food.name), m.quantity_grams, m.total_calories(),
                        m.total_protein(), m.total_carbs(), m.total_fat()])
    elif kind == 'activity':
        w.writerow(['date', 'steps', 'calories_burned', 'activity_type'])
        for a in ActivityEntry.objects.filter(user=user).order_by('date'):
            w.writerow([a.date, a.steps, a.calories_burned, _cell(a.activity_type)])
    else:
        w.writerow(['date', 'weight_kg'])
        for e in WeightEntry.objects.filter(user=user).order_by('date'):
            w.writerow([e.date, e.weight_kg])
    return resp


def _rows(upload):
    text = upload.read().decode('utf-8-sig', errors='replace')
    reader = csv.DictReader(io.StringIO(text))
    reader.fieldnames = [(h or '').strip().lower() for h in (reader.fieldnames or [])]
    return reader


def run_import(user, kind, upload):
    """All-or-nothing import. Returns (rows_imported, error_message). error_message is '' on success."""
    reader = _rows(upload)
    missing = REQUIRED[kind] - set(reader.fieldnames or [])
    if missing:
        return 0, 'Missing column(s): ' + ', '.join(sorted(missing))

    visible = {f.name.lower(): f.id for f in Food.objects.visible_to(user)}
    errors, created = [], 0
    try:
        with transaction.atomic():
            for n, row in enumerate(reader, start=2):
                if n - 1 > MAX_IMPORT_ROWS:
                    errors.append(f'Too many rows (limit {MAX_IMPORT_ROWS}).')
                    break
                row = {k: (v or '').strip() for k, v in row.items() if k}
                if kind == 'meals':
                    fid = visible.get(row.get('food', '').lower())
                    if not fid:
                        errors.append(f'Row {n}: unknown food "{row.get("food", "")}"')
                        continue
                    f = MealForm({'food': fid, 'quantity_grams': row['quantity_grams'],
                                  'meal_type': row['meal_type'].lower(), 'date': row['date']}, user=user)
                    if f.is_valid():
                        e = f.save(commit=False)
                        e.user = user
                        e.save()
                        created += 1
                    else:
                        errors.append(f'Row {n}: ' + '; '.join(sum(f.errors.values(), [])))
                elif kind == 'activity':
                    f = ActivityForm({'steps': row['steps'], 'calories_burned': row['calories_burned'],
                                      'activity_type': row.get('activity_type', ''), 'date': row['date']})
                    if f.is_valid():
                        d = f.cleaned_data
                        ActivityEntry.objects.update_or_create(
                            user=user, date=d['date'],
                            defaults={'steps': d['steps'], 'calories_burned': d['calories_burned'],
                                      'activity_type': d['activity_type']})
                        created += 1
                    else:
                        errors.append(f'Row {n}: ' + '; '.join(sum(f.errors.values(), [])))
                else:
                    f = WeightForm({'date': row['date'], 'weight_kg': row['weight_kg']})
                    if f.is_valid():
                        WeightEntry.objects.update_or_create(
                            user=user, date=f.cleaned_data['date'],
                            defaults={'weight_kg': f.cleaned_data['weight_kg']})
                        created += 1
                    else:
                        errors.append(f'Row {n}: ' + '; '.join(sum(f.errors.values(), [])))
                if len(errors) >= 20:
                    break
            if errors:
                raise ValueError('rollback')
    except ValueError:
        more = f' (+{len(errors) - 5} more)' if len(errors) > 5 else ''
        return 0, 'Nothing was imported. ' + ' | '.join(errors[:5]) + more
    return created, ''
