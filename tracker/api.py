"""JSON API for the separately hosted frontend (and any other client).

Authentication: ``Authorization: Token <key>``. Get a key from POST /api/v1/auth/login/ or /auth/signup/.
Logged-in browser sessions may use GET endpoints only (no CSRF-exempt writes).
Errors are JSON: {"error": "<code>", "fields": {...}} with the matching HTTP status.
"""
import json
from datetime import datetime, timedelta
from functools import wraps

from django.contrib.auth import authenticate
from django.core.cache import cache
from django.core.paginator import Paginator
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from . import integrations as ext
from . import services
from .forms import ActivityForm, FoodForm, GoalForm, MealForm, SignUpForm, WaterForm, WeightForm
from .models import ActivityEntry, ApiToken, DailyGoal, FavoriteFood, Food, MealEntry, WaterLog, WeightEntry

PAGE_SIZE = 20
MAX_MEAL_ITEMS = 30
LOGIN_ATTEMPTS = 8            # per username+IP
LOGIN_WINDOW = 15 * 60        # seconds


# ------------------------------------------------------------------ plumbing

def api_view(methods, public=False):
    def decorator(fn):
        @csrf_exempt
        @wraps(fn)
        def wrapper(request, *args, **kwargs):
            if request.method not in methods:
                resp = JsonResponse({'error': 'method_not_allowed'}, status=405)
                resp['Allow'] = ', '.join(methods)
                return resp
            if public:
                request.api_user = None
                return fn(request, *args, **kwargs)
            user = None
            header = request.headers.get('Authorization', '')
            if header.startswith('Token '):
                token = ApiToken.objects.select_related('user').filter(key=header[6:].strip()).first()
                if token and token.user.is_active:
                    user = token.user
            elif request.user.is_authenticated and request.method == 'GET':
                user = request.user          # session auth is read-only (no CSRF-exempt writes)
            if user is None:
                return JsonResponse({'error': 'authentication_required'}, status=401)
            request.api_user = user
            return fn(request, *args, **kwargs)
        return wrapper
    return decorator


def _body(request):
    try:
        data = json.loads(request.body or b'{}')
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _bad_json():
    return JsonResponse({'error': 'invalid_json'}, status=400)


def _errors(form):
    return JsonResponse({'error': 'validation_failed', 'fields': {k: list(v) for k, v in form.errors.items()}}, status=400)


def _fail(field, message, status=400):
    return JsonResponse({'error': 'validation_failed', 'fields': {field: [message]}}, status=status)


def _date(value, default):
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return default


def _int(value, default, lo=None, hi=None):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    if lo is not None:
        n = max(n, lo)
    if hi is not None:
        n = min(n, hi)
    return n


def _paginate(request, qs, serialize, size=PAGE_SIZE):
    page = Paginator(qs, size).get_page(_int(request.GET.get('page'), 1, 1))
    return {'results': [serialize(x) for x in page], 'page': page.number,
            'num_pages': page.paginator.num_pages, 'count': page.paginator.count}


# --------------------------------------------------------------- serializers

def _user(u):
    return {'id': u.id, 'username': u.username, 'email': u.email, 'is_staff': u.is_staff}


def _food(f, user=None, fav_ids=None):
    data = {'id': f.id, 'name': f.name, 'calories': f.calories, 'protein': f.protein, 'carbs': f.carbs, 'fat': f.fat,
            'category': f.category or 'other', 'image': f.image_url, 'emoji': f.emoji, 'barcode': f.barcode,
            'custom': f.owner_id is not None}
    if user is not None:
        data['can_edit'] = user.is_staff or (f.owner_id is not None and f.owner_id == user.id)
    if fav_ids is not None:
        data['favorite'] = f.id in fav_ids
    return data


def _meal(m):
    return {'id': m.id, 'date': m.date.isoformat(), 'meal_type': m.meal_type, 'food': m.food_id, 'food_name': m.food.name,
            'food_image': m.food.image_url, 'food_emoji': m.food.emoji, 'category': m.food.category or 'other',
            'quantity_grams': m.quantity_grams, 'calories': m.total_calories(), 'protein': m.total_protein(),
            'carbs': m.total_carbs(), 'fat': m.total_fat()}


def _activity(a):
    return {'id': a.id, 'date': a.date.isoformat(), 'steps': a.steps, 'calories_burned': a.calories_burned,
            'activity_type': a.activity_type}


def _weight(e):
    return {'id': e.id, 'date': e.date.isoformat(), 'weight_kg': e.weight_kg}


def _goal(g):
    return {'calories': g.target_calories, 'protein': g.target_protein, 'steps': g.target_steps,
            'water_ml': g.target_water_ml}


def _pct(value, target):
    return min(round(value / target * 100), 100) if target else 0


# ------------------------------------------------------------------- auth

def _client_ip(request):
    fwd = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (fwd.split(',')[0].strip() if fwd else request.META.get('REMOTE_ADDR', '')) or 'unknown'


def _token_for(user):
    token, _ = ApiToken.objects.get_or_create(user=user)
    return token.key


@api_view(['POST'], public=True)
def auth_signup(request):
    data = _body(request)
    if data is None:
        return _bad_json()
    form = SignUpForm({'username': data.get('username', ''), 'email': data.get('email', ''),
                       'password1': data.get('password1', ''), 'password2': data.get('password2', '')})
    if not form.is_valid():
        return _errors(form)
    user = form.save()
    DailyGoal.objects.get_or_create(user=user)
    return JsonResponse({'token': _token_for(user), 'user': _user(user)}, status=201)


@api_view(['POST'], public=True)
def auth_login(request):
    data = _body(request)
    if data is None:
        return _bad_json()
    username = str(data.get('username', '')).strip()[:150]
    password = str(data.get('password', ''))
    key = f'apilogin:{_client_ip(request)}:{username.lower()}'
    attempts = cache.get(key, 0)
    if attempts >= LOGIN_ATTEMPTS:
        return JsonResponse({'error': 'too_many_attempts',
                             'message': 'Too many failed logins. Try again in 15 minutes.'}, status=429)
    user = authenticate(request, username=username, password=password)
    if user is None or not user.is_active:
        cache.set(key, attempts + 1, LOGIN_WINDOW)
        return JsonResponse({'error': 'invalid_credentials', 'message': 'Wrong username or password.'}, status=400)
    cache.delete(key)
    return JsonResponse({'token': _token_for(user), 'user': _user(user)})


@api_view(['GET'])
def auth_me(request):
    return JsonResponse({'user': _user(request.api_user)})


@api_view(['POST'])
def auth_logout(request):
    """Rotates the token, signing the user out everywhere (the client also forgets it)."""
    token, _ = ApiToken.objects.get_or_create(user=request.api_user)
    token.regenerate()
    return HttpResponse(status=204)


# --------------------------------------------------------------- dashboard

@api_view(['GET'])
def dashboard(request):
    user = request.api_user
    today = timezone.localdate()
    day = min(_date(request.GET.get('date'), today), today)
    meals = list(MealEntry.objects.filter(user=user, date=day).select_related('food').order_by('id'))
    act = ActivityEntry.objects.filter(user=user, date=day).first()
    water = WaterLog.objects.filter(user=user, date=day).first()
    weight = WeightEntry.objects.filter(user=user, date__lte=day).first()
    goal, _ = DailyGoal.objects.get_or_create(user=user)

    cal = round(sum(m.total_calories() for m in meals), 1)
    protein = round(sum(m.total_protein() for m in meals), 1)
    steps = act.steps if act else 0
    burned = act.calories_burned if act else 0
    water_ml = water.amount_ml if water else 0
    return JsonResponse({
        'date': day.isoformat(), 'is_today': day == today,
        'totals': {'calories': cal, 'protein': protein, 'carbs': round(sum(m.total_carbs() for m in meals), 1),
                   'fat': round(sum(m.total_fat() for m in meals), 1), 'net_calories': round(cal - burned, 1)},
        'activity': _activity(act) if act else None, 'steps': steps, 'calories_burned': burned,
        'water': {'amount_ml': water_ml, 'target_ml': goal.target_water_ml},
        'weight': _weight(weight) if weight else None,
        'streak': {'current': services.logging_streak(user), 'best': services.best_streak(user)},
        'goals': _goal(goal),
        'progress': {'calories': _pct(cal, goal.target_calories), 'protein': _pct(protein, goal.target_protein),
                     'steps': _pct(steps, goal.target_steps), 'water': _pct(water_ml, goal.target_water_ml)},
        'meals': [_meal(m) for m in meals],
    })


@api_view(['GET'])
def summary(request):
    """Compact daily totals (kept for simple clients)."""
    user = request.api_user
    today = timezone.localdate()
    day = min(_date(request.GET.get('date'), today), today)
    meals = list(MealEntry.objects.filter(user=user, date=day).select_related('food'))
    act = ActivityEntry.objects.filter(user=user, date=day).first()
    water = WaterLog.objects.filter(user=user, date=day).first()
    goal, _ = DailyGoal.objects.get_or_create(user=user)
    return JsonResponse({
        'date': day.isoformat(),
        'calories': round(sum(m.total_calories() for m in meals), 1),
        'protein': round(sum(m.total_protein() for m in meals), 1),
        'carbs': round(sum(m.total_carbs() for m in meals), 1),
        'fat': round(sum(m.total_fat() for m in meals), 1),
        'steps': act.steps if act else 0,
        'calories_burned': act.calories_burned if act else 0,
        'water_ml': water.amount_ml if water else 0,
        'goals': _goal(goal),
    })


# ------------------------------------------------------------------- meals

@api_view(['GET', 'POST'])
def meals(request):
    user = request.api_user
    if request.method == 'POST':
        data = _body(request)
        if data is None:
            return _bad_json()
        if 'items' in data:                                    # meal builder: several foods, one meal
            items = data.get('items')
            if not isinstance(items, list) or not items:
                return _fail('items', 'Add at least one food.')
            if len(items) > MAX_MEAL_ITEMS:
                return _fail('items', f'A meal can hold at most {MAX_MEAL_ITEMS} foods.')
            forms, item_errors = [], {}
            for i, item in enumerate(items):
                item = item if isinstance(item, dict) else {}
                f = MealForm({'food': item.get('food'), 'quantity_grams': item.get('quantity_grams'),
                              'meal_type': data.get('meal_type'), 'date': data.get('date')}, user=user)
                if not f.is_valid():
                    item_errors[str(i)] = {k: list(v) for k, v in f.errors.items()}
                forms.append(f)
            if item_errors:
                return JsonResponse({'error': 'validation_failed', 'fields': {'items': item_errors}}, status=400)
            with transaction.atomic():
                created = []
                for f in forms:
                    entry = f.save(commit=False)
                    entry.user = user
                    entry.save()
                    created.append(entry)
            return JsonResponse({'results': [_meal(m) for m in created]}, status=201)
        form = MealForm(data, user=user)
        if not form.is_valid():
            return _errors(form)
        entry = form.save(commit=False)
        entry.user = user
        entry.save()
        return JsonResponse(_meal(entry), status=201)

    qs = MealEntry.objects.filter(user=user).select_related('food').order_by('-date', '-id')
    if request.GET.get('date'):
        qs = qs.filter(date=_date(request.GET['date'], timezone.localdate()))
    if request.GET.get('type') in dict(MealEntry.MEAL_TYPES):
        qs = qs.filter(meal_type=request.GET['type'])
    if _date(request.GET.get('from'), None):
        qs = qs.filter(date__gte=_date(request.GET['from'], None))
    if _date(request.GET.get('to'), None):
        qs = qs.filter(date__lte=_date(request.GET['to'], None))
    return JsonResponse(_paginate(request, qs, _meal))


@api_view(['GET', 'PUT', 'DELETE'])
def meal_detail(request, pk):
    meal = MealEntry.objects.filter(pk=pk, user=request.api_user).select_related('food').first()
    if not meal:
        return JsonResponse({'error': 'not_found'}, status=404)
    if request.method == 'DELETE':
        meal.delete()
        return HttpResponse(status=204)
    if request.method == 'PUT':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = MealForm(data, instance=meal, user=request.api_user)
        if not form.is_valid():
            return _errors(form)
        form.save()
        meal.refresh_from_db()
    return JsonResponse(_meal(meal))


# ---------------------------------------------------------------- activity

@api_view(['GET', 'POST'])
def activity(request):
    user = request.api_user
    if request.method == 'POST':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = ActivityForm(data)
        if not form.is_valid():
            return _errors(form)
        d = form.cleaned_data
        entry = ActivityEntry.objects.filter(user=user, date=d['date']).first()
        status = 200
        if entry:    # one row per day: merge, matching the web form
            entry.steps += d['steps']
            entry.calories_burned += d['calories_burned']
            if d['activity_type']:
                entry.activity_type = d['activity_type']
            entry.save()
        else:
            entry = form.save(commit=False)
            entry.user = user
            entry.save()
            status = 201
        return JsonResponse(_activity(entry), status=status)
    qs = ActivityEntry.objects.filter(user=user).order_by('-date', '-id')
    if _date(request.GET.get('from'), None):
        qs = qs.filter(date__gte=_date(request.GET['from'], None))
    if _date(request.GET.get('to'), None):
        qs = qs.filter(date__lte=_date(request.GET['to'], None))
    return JsonResponse(_paginate(request, qs, _activity))


@api_view(['GET', 'PUT', 'DELETE'])
def activity_detail(request, pk):
    entry = ActivityEntry.objects.filter(pk=pk, user=request.api_user).first()
    if not entry:
        return JsonResponse({'error': 'not_found'}, status=404)
    if request.method == 'DELETE':
        entry.delete()
        return HttpResponse(status=204)
    if request.method == 'PUT':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = ActivityForm(data, instance=entry)
        if not form.is_valid():
            return _errors(form)
        clash = ActivityEntry.objects.filter(user=request.api_user, date=form.cleaned_data['date']).exclude(pk=entry.pk)
        if clash.exists():
            return _fail('date', 'You already have an activity entry for this date. Edit that one instead.')
        form.save()
        entry.refresh_from_db()
    return JsonResponse(_activity(entry))


# ------------------------------------------------------------------ weight

@api_view(['GET', 'POST'])
def weight(request):
    user = request.api_user
    if request.method == 'POST':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = WeightForm(data)
        if not form.is_valid():
            return _errors(form)
        entry, created = WeightEntry.objects.update_or_create(
            user=user, date=form.cleaned_data['date'], defaults={'weight_kg': form.cleaned_data['weight_kg']})
        return JsonResponse(_weight(entry), status=201 if created else 200)
    qs = WeightEntry.objects.filter(user=user).order_by('-date')
    out = _paginate(request, qs, _weight)
    series = list(WeightEntry.objects.filter(user=user, date__gte=timezone.localdate() - timedelta(days=89)).order_by('date'))
    out['series'] = [_weight(e) for e in series]                       # last 90 days, oldest first, for charts
    latest = qs.first()
    month_ago = WeightEntry.objects.filter(user=user, date__lte=timezone.localdate() - timedelta(days=30)).first()
    out['latest'] = _weight(latest) if latest else None
    out['change_30d'] = round(latest.weight_kg - month_ago.weight_kg, 1) if latest and month_ago else None
    lowest = qs.order_by('weight_kg').first()
    out['lowest'] = _weight(lowest) if lowest else None
    return JsonResponse(out)


@api_view(['DELETE'])
def weight_detail(request, pk):
    entry = WeightEntry.objects.filter(pk=pk, user=request.api_user).first()
    if not entry:
        return JsonResponse({'error': 'not_found'}, status=404)
    entry.delete()
    return HttpResponse(status=204)


# ------------------------------------------------------------------- water

@api_view(['GET', 'POST'])
def water(request):
    user = request.api_user
    today = timezone.localdate()
    if request.method == 'POST':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = WaterForm(data)
        if not form.is_valid():
            return _errors(form)
        day = form.cleaned_data['date'] or today
        if day > today:
            return _fail('date', 'Cannot log in the future.')
        log, _ = WaterLog.objects.get_or_create(user=user, date=day)
        log.amount_ml = min(max(log.amount_ml + form.cleaned_data['amount_ml'], 0), 20000)
        log.save(update_fields=['amount_ml'])
        return JsonResponse({'date': day.isoformat(), 'amount_ml': log.amount_ml})
    day = _date(request.GET.get('date'), today)
    log = WaterLog.objects.filter(user=user, date=day).first()
    return JsonResponse({'date': day.isoformat(), 'amount_ml': log.amount_ml if log else 0})


# ------------------------------------------------------------------- goals

@api_view(['GET', 'PUT'])
def goals(request):
    goal, _ = DailyGoal.objects.get_or_create(user=request.api_user)
    if request.method == 'PUT':
        data = _body(request)
        if data is None:
            return _bad_json()
        merged = {'target_calories': goal.target_calories, 'target_protein': goal.target_protein,
                  'target_steps': goal.target_steps, 'target_water_ml': goal.target_water_ml}
        merged.update({k: v for k, v in data.items() if k in merged})
        form = GoalForm(merged, instance=goal)
        if not form.is_valid():
            return _errors(form)
        form.save()
        goal.refresh_from_db()
    return JsonResponse(_goal(goal))


# ------------------------------------------------------------------- foods

def _visible_food(user, pk):
    return Food.objects.visible_to(user).filter(pk=pk).first()


@api_view(['GET', 'POST'])
def foods(request):
    user = request.api_user
    if request.method == 'POST':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = FoodForm(data, user=user)
        if not form.is_valid():
            return _errors(form)
        food = form.save(commit=False)
        food.owner = None if user.is_staff else user          # staff foods are shared with everyone
        if not food.image_url:
            food.image_url = services.find_food_image(food.name)
        food.save()
        return JsonResponse(_food(food, user, set()), status=201)

    q = request.GET.get('q', '').strip()
    qs = Food.objects.visible_to(user).order_by('name')
    if q:
        qs = qs.filter(name__icontains=q)
    scope = request.GET.get('scope', '')
    if scope == 'mine':
        qs = qs.filter(owner=user)
    elif scope == 'favorites':
        qs = qs.filter(favorited_by__user=user)
    if request.GET.get('category') in ('protein', 'carbs', 'fats', 'other'):
        qs = qs.filter(category=request.GET['category'])
    if request.GET.get('all') == '1':                         # full list for pickers (capped)
        items = list(qs[:500])
        fav = set(FavoriteFood.objects.filter(user=user, food__in=items).values_list('food_id', flat=True))
        return JsonResponse({'results': [_food(f, user, fav) for f in items], 'count': len(items)})
    page = Paginator(qs, PAGE_SIZE).get_page(_int(request.GET.get('page'), 1, 1))
    items = list(page)
    fav = set(FavoriteFood.objects.filter(user=user, food__in=items).values_list('food_id', flat=True))
    return JsonResponse({'results': [_food(f, user, fav) for f in items], 'page': page.number,
                         'num_pages': page.paginator.num_pages, 'count': page.paginator.count})


@api_view(['GET', 'PUT', 'DELETE'])
def food_detail(request, pk):
    user = request.api_user
    food = _visible_food(user, pk)
    if not food:
        return JsonResponse({'error': 'not_found'}, status=404)
    can_edit = user.is_staff or (food.owner_id is not None and food.owner_id == user.id)
    if request.method in ('PUT', 'DELETE') and not can_edit:
        return JsonResponse({'error': 'forbidden', 'message': 'You can only change foods you created.'}, status=403)
    if request.method == 'DELETE':
        used = MealEntry.objects.filter(food=food).count()
        food.delete()
        return JsonResponse({'deleted_meals': used})
    if request.method == 'PUT':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = FoodForm(data, instance=food, user=user)
        if not form.is_valid():
            return _errors(form)
        form.save()
        food.refresh_from_db()
    fav = set(FavoriteFood.objects.filter(user=user, food=food).values_list('food_id', flat=True))
    return JsonResponse(_food(food, user, fav))


@api_view(['POST'])
def food_favorite(request, pk):
    food = _visible_food(request.api_user, pk)
    if not food:
        return JsonResponse({'error': 'not_found'}, status=404)
    fav, created = FavoriteFood.objects.get_or_create(user=request.api_user, food=food)
    if not created:
        fav.delete()
    return JsonResponse({'favorite': created})


@api_view(['GET'])
def food_lookup(request):
    barcode = request.GET.get('barcode', '').strip()
    q = request.GET.get('q', '').strip()[:80]
    results = services.lookup_barcode(barcode) if barcode else ext.search_all(q)
    for r in results:
        r.setdefault('source', 'Open Food Facts')
    return JsonResponse({'results': results})


# --------------------------------------------------------------- analytics

@api_view(['GET'])
def analytics(request):
    days = _int(request.GET.get('days'), 7)
    if days not in (7, 30, 90):
        days = 7
    data = services.analytics_data(request.api_user, days)
    goal = data.pop('goal')
    data['rows'] = [dict(r, date=r['date'].isoformat()) for r in data['rows']]
    data['range_start'] = data['range_start'].isoformat()
    data['range_end'] = data['range_end'].isoformat()
    data['goal'] = _goal(goal)
    return JsonResponse(data)
