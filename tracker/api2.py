"""JSON API, part 2: saved meals, recipes, calculator, account, and connections (Fitbit, Telegram, email)."""
import re
import secrets
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.contrib.auth.forms import PasswordChangeForm
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.urls import reverse

from . import csvio
from . import integrations as ext
from .api import _body, _bad_json, _errors, _fail, _food, _int, _meal, api_view
from .forms import CalculatorForm, CsvImportForm, LogSavedMealForm, SavedMealForm
from .models import (ApiToken, DailyGoal, FitbitConnection, Food, MealEntry, SavedMeal, SavedMealItem, UserSettings,
                     WeightEntry)
from .services import calculate_targets
from .views_integrations import RecipeFoodForm

TIME_RE = re.compile(r'^([01]?\d|2[0-3]):[0-5]\d$')
FITBIT_STATE_TTL = 600


# ------------------------------------------------------------------ saved meals

def _saved(s):
    items = list(s.items.select_related('food'))
    return {'id': s.id, 'name': s.name, 'totals': s.totals(),
            'items': [{'food': _food(i.food), 'quantity_grams': i.quantity_grams} for i in items]}


@api_view(['GET', 'POST'])
def saved_meals(request):
    user = request.api_user
    if request.method == 'POST':
        data = _body(request)
        if data is None:
            return _bad_json()
        form = SavedMealForm(data, user=user)
        if not form.is_valid():
            return _errors(form)
        d = form.cleaned_data
        with transaction.atomic():
            saved = SavedMeal.objects.create(user=user, name=d['name'])
            totals = {}
            for m in MealEntry.objects.filter(user=user, date=d['date'], meal_type=d['meal_type']):
                totals[m.food_id] = totals.get(m.food_id, 0) + m.quantity_grams
            SavedMealItem.objects.bulk_create(
                [SavedMealItem(saved_meal=saved, food_id=fid, quantity_grams=q) for fid, q in totals.items()])
        return JsonResponse(_saved(saved), status=201)
    qs = SavedMeal.objects.filter(user=user).prefetch_related('items__food')
    return JsonResponse({'results': [_saved(s) for s in qs]})


@api_view(['POST'])
def saved_meal_log(request, pk):
    saved = SavedMeal.objects.filter(pk=pk, user=request.api_user).first()
    if not saved:
        return JsonResponse({'error': 'not_found'}, status=404)
    data = _body(request)
    if data is None:
        return _bad_json()
    form = LogSavedMealForm(data)
    if not form.is_valid():
        return _errors(form)
    d = form.cleaned_data
    created = MealEntry.objects.bulk_create([
        MealEntry(user=request.api_user, food=i.food, quantity_grams=i.quantity_grams, meal_type=d['meal_type'], date=d['date'])
        for i in saved.items.select_related('food')])
    return JsonResponse({'results': [_meal(m) for m in MealEntry.objects.filter(pk__in=[c.pk for c in created if c.pk])
                                      .select_related('food')], 'count': len(created), 'date': d['date'].isoformat()}, status=201)


@api_view(['DELETE'])
def saved_meal_detail(request, pk):
    saved = SavedMeal.objects.filter(pk=pk, user=request.api_user).first()
    if not saved:
        return JsonResponse({'error': 'not_found'}, status=404)
    saved.delete()
    return HttpResponse(status=204)


# ------------------------------------------------------------------- recipes

def _unavailable():
    return JsonResponse({'error': 'service_unavailable',
                         'message': 'The recipe service (TheMealDB) is unreachable right now. Please try again in a moment.'}, status=503)


@api_view(['GET'])
def recipes(request):
    q = request.GET.get('q', '').strip()[:60]
    category = request.GET.get('category', '').strip()[:40]
    try:
        with ThreadPoolExecutor(max_workers=5) as pool:               # the external calls run in parallel
            cats_f = pool.submit(ext.meal_categories)
            if q:
                results_f = [pool.submit(ext.meal_search, q)]
            elif category:
                results_f = [pool.submit(ext.meal_by_category, category)]
            else:
                results_f = [pool.submit(ext.meal_random) for _ in range(4)]
            categories = cats_f.result()
            batches = [f.result() for f in results_f]
        if category and category not in categories:
            category, batches = '', []
        if not q and not category and not batches:
            with ThreadPoolExecutor(max_workers=4) as pool:
                batches = list(pool.map(lambda _: ext.meal_random(), range(4)))
        seen, results = set(), []
        for batch in batches:
            for r in batch:
                if r['id'] not in seen:
                    seen.add(r['id'])
                    results.append(r)
    except ext.ApiError:
        return _unavailable()
    return JsonResponse({'categories': categories, 'results': results, 'q': q, 'category': category,
                         'featured': not q and not category})


@api_view(['GET'])
def recipe_detail(request, meal_id):
    try:
        recipe = ext.meal_detail(meal_id)
    except ext.ApiError:
        return _unavailable()
    if not recipe:
        return JsonResponse({'error': 'not_found'}, status=404)
    return JsonResponse(recipe)


@api_view(['POST'])
def recipe_save(request, meal_id):
    user = request.api_user
    data = _body(request)
    if data is None:
        return _bad_json()
    try:
        recipe = ext.meal_detail(meal_id)
    except ext.ApiError:
        return _unavailable()
    if not recipe:
        return JsonResponse({'error': 'not_found'}, status=404)
    form = RecipeFoodForm(data)
    if not form.is_valid():
        return _errors(form)
    d = form.cleaned_data
    name = d['name'].strip()
    if Food.objects.visible_to(user).filter(name__iexact=name).exists():
        return _fail('name', 'You already have a food with this name. Choose another name.')
    k = 100 / d['serving_g']
    food = Food.objects.create(
        name=name, calories=round(d['calories'] * k, 1), protein=round(d['protein'] * k, 1),
        carbs=round(d['carbs'] * k, 1), fat=round(d['fat'] * k, 1),
        owner=None if user.is_staff else user, image_url=recipe['image'])
    return JsonResponse({'food': _food(food, user, set()), 'serving_g': d['serving_g']}, status=201)


# ---------------------------------------------------------------- calculator

@api_view(['POST'])
def calculator(request):
    user = request.api_user
    data = _body(request)
    if data is None:
        return _bad_json()
    form = CalculatorForm({k: data.get(k) for k in ('sex', 'age', 'height_cm', 'weight_kg', 'activity', 'goal')})
    if not form.is_valid():
        return _errors(form)
    result = calculate_targets(**form.cleaned_data)
    applied = False
    if data.get('apply'):
        goal, _ = DailyGoal.objects.get_or_create(user=user)
        goal.target_calories = result['calories']
        goal.target_protein = result['protein']
        goal.target_water_ml = min(max(result['water_ml'], 500), 10000)
        goal.save()
        applied = True
    return JsonResponse({'result': result, 'applied': applied})


@api_view(['GET'])
def calculator_defaults(request):
    w = WeightEntry.objects.filter(user=request.api_user).first()
    return JsonResponse({'weight_kg': w.weight_kg if w else None})


# ------------------------------------------------------------------- account

@api_view(['GET', 'PUT'])
def account(request):
    user = request.api_user
    if request.method == 'PUT':
        data = _body(request)
        if data is None:
            return _bad_json()
        email = str(data.get('email', '')).strip()
        try:
            if email:
                validate_email(email)
        except ValidationError:
            return _fail('email', 'Enter a valid email address.')
        user.email = email
        user.save(update_fields=['email'])
    token, _ = ApiToken.objects.get_or_create(user=user)
    return JsonResponse({'username': user.username, 'email': user.email, 'is_staff': user.is_staff, 'api_token': token.key})


@api_view(['POST'])
def account_password(request):
    data = _body(request)
    if data is None:
        return _bad_json()
    form = PasswordChangeForm(request.api_user, {k: data.get(k, '') for k in ('old_password', 'new_password1', 'new_password2')})
    if not form.is_valid():
        return _errors(form)
    form.save()
    return JsonResponse({'ok': True})


@api_view(['POST'])
def account_token(request):
    token, _ = ApiToken.objects.get_or_create(user=request.api_user)
    token.regenerate()
    return JsonResponse({'token': token.key})


@api_view(['GET'])
def account_export(request, kind):
    if kind not in csvio.KINDS:
        return JsonResponse({'error': 'not_found'}, status=404)
    return csvio.export_response(request.api_user, kind)


@api_view(['POST'])
def account_import(request):
    form = CsvImportForm(request.POST, request.FILES)
    if not form.is_valid():
        return _errors(form)
    kind = form.cleaned_data['kind']
    created, error = csvio.run_import(request.api_user, kind, form.cleaned_data['file'])
    if error:
        return JsonResponse({'error': 'import_failed', 'message': error}, status=400)
    return JsonResponse({'imported': created, 'kind': kind})


# --------------------------------------------------------------- connections

def _frontend(path=''):
    base = (settings.FRONTEND_URL or '').rstrip('/')
    return f'{base}{path}' if base else ''


def _fitbit_redirect_uri(request):
    return request.build_absolute_uri(reverse('api_fitbit_callback'))


@api_view(['GET'])
def connections(request):
    user = request.api_user
    us = UserSettings.for_user(user)
    conn = FitbitConnection.objects.filter(user=user).first()
    link = ''
    if us.telegram_link_code and settings.TELEGRAM_BOT_USERNAME:
        link = f'https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={us.telegram_link_code}'
    return JsonResponse({
        'email': user.email, 'smtp': bool(settings.EMAIL_HOST), 'usda_custom_key': settings.USDA_API_KEY != 'DEMO_KEY',
        'fitbit': {'configured': ext.fitbit_configured(), 'connected': bool(conn),
                   'last_synced': conn.last_synced.isoformat() if conn and conn.last_synced else None,
                   'redirect_uri': _fitbit_redirect_uri(request)},
        'telegram': {'configured': ext.telegram_configured() and bool(settings.TELEGRAM_BOT_USERNAME),
                     'connected': bool(us.telegram_chat_id), 'link': link, 'bot': settings.TELEGRAM_BOT_USERNAME},
        'notifications': {'weekly_email': us.weekly_email, 'reminders_enabled': us.reminders_enabled,
                          'reminder_times': us.reminder_times},
    })


@api_view(['POST'])
def email_test(request):
    user = request.api_user
    if not user.email:
        return _fail('email', 'Save an email address first.')
    try:
        send_mail('Calorio test email', 'If you can read this, email delivery from Calorio works.',
                  settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
    except Exception as e:      # noqa: BLE001 - SMTP errors vary; the reason is shown to the user
        return JsonResponse({'error': 'email_failed', 'message': f'Could not send email: {e}'}, status=502)
    return JsonResponse({'sent_to': user.email, 'smtp': bool(settings.EMAIL_HOST)})


@api_view(['PUT'])
def notifications(request):
    user = request.api_user
    data = _body(request)
    if data is None:
        return _bad_json()
    us = UserSettings.for_user(user)
    raw = data.get('reminder_times', us.reminder_times)
    times = [t.strip() for t in str(raw).split(',') if t.strip()]
    if not times or len(times) > 6 or not all(TIME_RE.match(t) for t in times):
        return _fail('reminder_times', 'Use times like 08:00, 13:00, 19:30 (up to 6, 24-hour clock).')
    us.reminder_times = ','.join(f'{int(t.split(":")[0]):02d}:{t.split(":")[1]}' for t in times)
    us.weekly_email = bool(data.get('weekly_email', us.weekly_email))
    want = bool(data.get('reminders_enabled', us.reminders_enabled))
    if want and not us.telegram_chat_id:
        return _fail('reminders_enabled', 'Connect Telegram first to receive reminders.')
    us.reminders_enabled = want
    us.save()
    return JsonResponse({'weekly_email': us.weekly_email, 'reminders_enabled': us.reminders_enabled,
                         'reminder_times': us.reminder_times})


# ---- Fitbit (OAuth runs through the backend; the browser is sent back to the frontend afterwards)

@api_view(['POST'])
def fitbit_connect(request):
    if not ext.fitbit_configured():
        return JsonResponse({'error': 'not_configured',
                             'message': 'Fitbit is not configured. Set FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET on the server.'}, status=400)
    state = secrets.token_urlsafe(24)
    verifier, challenge = ext.new_pkce()
    cache.set(f'fitbit:{state}', {'user_id': request.api_user.id, 'verifier': verifier}, FITBIT_STATE_TTL)
    return JsonResponse({'auth_url': ext.fitbit_auth_url(_fitbit_redirect_uri(request), state, challenge)})


def _back(status, message=''):
    target = _frontend('/connections')
    if not target:
        return HttpResponse(message or status, content_type='text/plain')
    return HttpResponseRedirect(f'{target}?fitbit={status}' + (f'&message={message}' if message else ''))


@api_view(['GET'], public=True)
def fitbit_callback(request):
    state = request.GET.get('state', '')
    saved = cache.get(f'fitbit:{state}') if state else None
    if request.GET.get('error'):
        return _back('denied')
    if not saved or not request.GET.get('code'):
        return _back('invalid')
    cache.delete(f'fitbit:{state}')
    from django.contrib.auth.models import User
    user = User.objects.filter(pk=saved['user_id'], is_active=True).first()
    if not user:
        return _back('invalid')
    try:
        tok = ext.fitbit_exchange(request.GET['code'], saved['verifier'], _fitbit_redirect_uri(request))
        conn = FitbitConnection.objects.filter(user=user).first() or FitbitConnection(user=user)
        conn.refresh_token = tok.get('refresh_token', '')
        ext._store_tokens(conn, tok)
        ext.fitbit_sync(conn, days=7)
    except ext.ApiError:
        return _back('error')
    return _back('connected')


@api_view(['POST'])
def fitbit_sync(request):
    conn = FitbitConnection.objects.filter(user=request.api_user).first()
    if not conn:
        return JsonResponse({'error': 'not_connected', 'message': 'Fitbit is not connected.'}, status=400)
    data = _body(request) or {}
    try:
        result = ext.fitbit_sync(conn, days=_int(data.get('days'), 7, 1, 30))
    except ext.ApiError as e:
        return JsonResponse({'error': 'sync_failed', 'message': f'Fitbit sync failed: {e}'}, status=502)
    return JsonResponse(result)


@api_view(['POST'])
def fitbit_disconnect(request):
    FitbitConnection.objects.filter(user=request.api_user).delete()
    return JsonResponse({'connected': False})


# ---- Telegram

@api_view(['POST'])
def telegram_connect(request):
    if not ext.telegram_configured() or not settings.TELEGRAM_BOT_USERNAME:
        return JsonResponse({'error': 'not_configured',
                             'message': 'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME on the server.'}, status=400)
    us = UserSettings.for_user(request.api_user)
    us.telegram_link_code = secrets.token_urlsafe(12)
    us.save(update_fields=['telegram_link_code'])
    return JsonResponse({'link': f'https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={us.telegram_link_code}'})


@api_view(['POST'])
def telegram_disconnect(request):
    us = UserSettings.for_user(request.api_user)
    us.telegram_chat_id, us.telegram_link_code, us.reminders_enabled = '', '', False
    us.save()
    return JsonResponse({'connected': False})


@api_view(['POST'])
def telegram_test(request):
    us = UserSettings.for_user(request.api_user)
    if not us.telegram_chat_id:
        return JsonResponse({'error': 'not_connected', 'message': 'Telegram is not connected.'}, status=400)
    if not ext.tg_send(us.telegram_chat_id, 'Hello from Calorio! Reminders and /today will arrive here.'):
        return JsonResponse({'error': 'send_failed', 'message': 'Telegram did not accept the message. Check the bot token.'}, status=502)
    return JsonResponse({'sent': True})
