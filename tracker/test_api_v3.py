import io
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from . import integrations as ext
from .models import (ActivityEntry, ApiToken, DailyGoal, FitbitConnection, Food, MealEntry, SavedMeal, SavedMealItem,
                     UserSettings, WeightEntry)
from .test_api_v2 import ApiCase

MEAL = {'idMeal': '52772', 'strMeal': 'Teriyaki Chicken', 'strCategory': 'Chicken', 'strArea': 'Japanese',
        'strMealThumb': 'https://www.themealdb.com/images/media/meals/x.jpg', 'strInstructions': 'Cook it.',
        'strIngredient1': 'soy sauce', 'strMeasure1': '1 cup'}


class SavedMealApiTests(ApiCase):
    def test_create_list_log_delete(self):
        for q in (100, 50):
            MealEntry.objects.create(user=self.user, food=self.food, quantity_grams=q, meal_type='lunch', date=self.today)
        r = self.call('post', 'api_saved', {'name': 'Usual lunch', 'date': str(self.today), 'meal_type': 'lunch'})
        self.assertEqual(r.status_code, 201)
        saved = r.json()
        self.assertEqual(saved['items'][0]['quantity_grams'], 150)
        self.assertEqual(saved['totals']['calories'], 247.5)
        self.assertEqual(len(self.call('get', 'api_saved').json()['results']), 1)

        y = self.today - timedelta(days=1)
        r = self.call('post', 'api_saved_log', {'meal_type': 'dinner', 'date': str(y)}, args=[saved['id']])
        self.assertEqual((r.status_code, r.json()['count']), (201, 1))
        self.assertTrue(MealEntry.objects.filter(date=y, meal_type='dinner', quantity_grams=150).exists())
        self.assertEqual(self.call('delete', 'api_saved_detail', args=[saved['id']]).status_code, 204)
        self.assertEqual(SavedMeal.objects.count(), 0)

    def test_validation_and_isolation(self):
        r = self.call('post', 'api_saved', {'name': 'Empty', 'date': str(self.today), 'meal_type': 'snack'})
        self.assertEqual(r.status_code, 400)                                  # nothing logged for that meal
        theirs = SavedMeal.objects.create(user=self.other, name='Theirs')
        SavedMealItem.objects.create(saved_meal=theirs, food=self.food, quantity_grams=10)
        self.assertEqual(self.call('post', 'api_saved_log', {'meal_type': 'lunch'}, args=[theirs.pk]).status_code, 404)
        self.assertEqual(self.call('delete', 'api_saved_detail', args=[theirs.pk]).status_code, 404)
        self.assertEqual(self.call('get', 'api_saved').json()['results'], [])

    def test_log_rejects_future_date(self):
        s = SavedMeal.objects.create(user=self.user, name='X')
        r = self.call('post', 'api_saved_log', {'meal_type': 'lunch', 'date': str(self.today + timedelta(days=2))}, args=[s.pk])
        self.assertEqual(r.status_code, 400)


class RecipeApiTests(ApiCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_search_and_detail(self):
        def fake(url, **kw):
            return {'meals': [{'strCategory': 'Chicken'}]} if 'list.php' in url else {'meals': [MEAL]}
        with mock.patch.object(ext, 'http_json', side_effect=fake):
            body = self.call('get', 'api_recipes', query='?q=chicken').json()
            self.assertEqual(body['results'][0]['name'], 'Teriyaki Chicken')
            self.assertEqual(body['categories'], ['Chicken'])
            self.assertFalse(body['featured'])
            d = self.call('get', 'api_recipe_detail', args=['52772']).json()
            self.assertEqual(d['ingredients'][0]['name'], 'soy sauce')

    def test_outage_is_a_503_with_message(self):
        with mock.patch.object(ext, 'http_json', side_effect=ext.ApiError('down')):
            r = self.call('get', 'api_recipes')
        self.assertEqual(r.status_code, 503)
        self.assertIn('unreachable', r.json()['message'])

    def test_save_converts_to_per_100g(self):
        with mock.patch.object(ext, 'http_json', return_value={'meals': [MEAL]}):
            r = self.call('post', 'api_recipe_save', {'name': 'Teriyaki bowl', 'serving_g': 400, 'calories': 600,
                                                      'protein': 40, 'carbs': 60, 'fat': 20}, args=['52772'])
            self.assertEqual(r.status_code, 201)
            food = r.json()['food']
            self.assertEqual((food['calories'], food['protein'], food['image']),
                             (150, 10, 'https://www.themealdb.com/images/media/meals/x.jpg'))
            dup = self.call('post', 'api_recipe_save', {'name': 'teriyaki bowl', 'serving_g': 400, 'calories': 1,
                                                         'protein': 0, 'carbs': 0, 'fat': 0}, args=['52772'])
            self.assertEqual(dup.status_code, 400)
            bad = self.call('post', 'api_recipe_save', {'name': 'X', 'serving_g': 100, 'calories': 600,
                                                         'protein': 80, 'carbs': 60, 'fat': 20}, args=['52772'])
            self.assertEqual(bad.status_code, 400)


class CalculatorApiTests(ApiCase):
    DATA = {'sex': 'male', 'age': 30, 'height_cm': 180, 'weight_kg': 80, 'activity': '1.55', 'goal': 'lose'}

    def test_compute_and_apply(self):
        r = self.call('post', 'api_calculator', self.DATA)
        self.assertEqual((r.json()['result']['calories'], r.json()['applied']), (2260, False))
        self.assertFalse(DailyGoal.objects.filter(user=self.user).exists())
        r = self.call('post', 'api_calculator', {**self.DATA, 'apply': True})
        self.assertTrue(r.json()['applied'])
        g = DailyGoal.objects.get(user=self.user)
        self.assertEqual((g.target_calories, g.target_protein), (2260, 160))

    def test_validation_and_defaults(self):
        self.assertEqual(self.call('post', 'api_calculator', {**self.DATA, 'age': 5}).status_code, 400)
        WeightEntry.objects.create(user=self.user, date=self.today, weight_kg=77.5)
        self.assertEqual(self.call('get', 'api_calculator_defaults').json()['weight_kg'], 77.5)


class AccountApiTests(ApiCase):
    def test_email_update_and_validation(self):
        self.assertEqual(self.call('put', 'api_account', {'email': 'me@example.com'}).json()['email'], 'me@example.com')
        self.assertEqual(self.call('put', 'api_account', {'email': 'nope'}).status_code, 400)
        self.assertEqual(self.call('get', 'api_account').json()['api_token'], self.token)

    def test_password_change(self):
        bad = self.call('post', 'api_account_password', {'old_password': 'wrong', 'new_password1': 'Br4nd!newpass', 'new_password2': 'Br4nd!newpass'})
        self.assertEqual(bad.status_code, 400)
        self.assertIn('old_password', bad.json()['fields'])
        ok = self.call('post', 'api_account_password', {'old_password': 'pass12345!', 'new_password1': 'Br4nd!newpass', 'new_password2': 'Br4nd!newpass'})
        self.assertEqual(ok.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Br4nd!newpass'))
        weak = self.call('post', 'api_account_password', {'old_password': 'Br4nd!newpass', 'new_password1': '123', 'new_password2': '123'})
        self.assertEqual(weak.status_code, 400)

    def test_token_regeneration(self):
        new = self.call('post', 'api_account_token').json()['token']
        self.assertNotEqual(new, self.token)
        self.assertEqual(self.call('get', 'api_auth_me').status_code, 401)
        self.assertEqual(self.call('get', 'api_auth_me', token=new).status_code, 200)

    def test_export_only_own_rows(self):
        WeightEntry.objects.create(user=self.user, date=self.today, weight_kg=80)
        WeightEntry.objects.create(user=self.other, date=self.today, weight_kg=99)
        r = self.call('get', 'api_account_export', args=['weight'])
        self.assertEqual(r['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('80', r.content.decode())
        self.assertNotIn('99', r.content.decode())
        self.assertEqual(self.call('get', 'api_account_export', args=['secrets']).status_code, 404)

    def test_import(self):
        f = SimpleUploadedFile('a.csv', f'date,steps,calories_burned\n{self.today},5000,200\n'.encode(), content_type='text/csv')
        r = self.api.post(reverse('api_account_import'), {'kind': 'activity', 'file': f}, HTTP_AUTHORIZATION=f'Token {self.token}')
        self.assertEqual((r.status_code, r.json()['imported']), (200, 1))
        self.assertEqual(ActivityEntry.objects.get().steps, 5000)
        bad = SimpleUploadedFile('b.csv', f'date,steps,calories_burned\n{self.today},-5,10\n'.encode(), content_type='text/csv')
        r = self.api.post(reverse('api_account_import'), {'kind': 'activity', 'file': bad}, HTTP_AUTHORIZATION=f'Token {self.token}')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Nothing was imported', r.json()['message'])
        miss = SimpleUploadedFile('c.csv', b'date\n2026-01-01\n', content_type='text/csv')
        r = self.api.post(reverse('api_account_import'), {'kind': 'weight', 'file': miss}, HTTP_AUTHORIZATION=f'Token {self.token}')
        self.assertIn('Missing column', r.json()['message'])


class ConnectionsApiTests(ApiCase):
    def test_overview_without_any_keys(self):
        body = self.call('get', 'api_connections').json()
        self.assertFalse(body['fitbit']['configured'])
        self.assertFalse(body['telegram']['configured'])
        self.assertEqual(body['notifications']['reminder_times'], '08:00,13:00,19:30')
        self.assertTrue(body['fitbit']['redirect_uri'].endswith('/api/v1/connections/fitbit/callback/'))

    def test_notifications_rules(self):
        r = self.call('put', 'api_notifications', {'weekly_email': False, 'reminder_times': '7:30, 12:00'})
        self.assertEqual((r.status_code, r.json()['reminder_times'], r.json()['weekly_email']), (200, '07:30,12:00', False))
        self.assertEqual(self.call('put', 'api_notifications', {'reminder_times': '25:00'}).status_code, 400)
        self.assertEqual(self.call('put', 'api_notifications', {'reminders_enabled': True}).status_code, 400)   # needs Telegram

    def test_email_test(self):
        self.assertEqual(self.call('post', 'api_email_test').status_code, 400)
        self.user.email = 'me@example.com'
        self.user.save()
        r = self.call('post', 'api_email_test')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(mail.outbox[-1].to, ['me@example.com'])
        with mock.patch('tracker.api2.send_mail', side_effect=OSError('refused')):
            self.assertEqual(self.call('post', 'api_email_test').status_code, 502)

    @override_settings(TELEGRAM_BOT_TOKEN='1:A', TELEGRAM_BOT_USERNAME='CalorioBot')
    def test_telegram_flow(self):
        link = self.call('post', 'api_telegram_connect').json()['link']
        self.assertTrue(link.startswith('https://t.me/CalorioBot?start='))
        us = UserSettings.objects.get(user=self.user)
        us.telegram_chat_id = '55'
        us.save()
        with mock.patch.object(ext, 'tg_send', return_value=True):
            self.assertTrue(self.call('post', 'api_telegram_test').json()['sent'])
        with mock.patch.object(ext, 'tg_send', return_value=False):
            self.assertEqual(self.call('post', 'api_telegram_test').status_code, 502)
        self.call('post', 'api_telegram_disconnect')
        self.assertEqual(self.call('post', 'api_telegram_test').status_code, 400)

    def test_telegram_not_configured(self):
        self.assertEqual(self.call('post', 'api_telegram_connect').status_code, 400)


@override_settings(FITBIT_CLIENT_ID='cid', FITBIT_CLIENT_SECRET='secret', FRONTEND_URL='https://app.example.com')
class FitbitApiTests(ApiCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def start(self):
        url = self.call('post', 'api_fitbit_connect').json()['auth_url']
        self.assertTrue(url.startswith('https://www.fitbit.com/oauth2/authorize?'))
        self.assertIn('code_challenge_method=S256', url)
        return url.split('state=')[1].split('&')[0]

    def test_full_flow_redirects_back_to_the_frontend(self):
        state = self.start()
        today = timezone.localdate()

        def fake(url, **kw):
            if url.endswith('/oauth2/token'):
                return {'access_token': 'AT', 'refresh_token': 'RT', 'expires_in': 3600, 'user_id': 'U1'}
            if '/activities/date/' in url:
                return {'summary': {'steps': 7000, 'caloriesOut': 2400}}
            return {'weight': []}
        with mock.patch.object(ext, 'http_json', side_effect=fake):
            r = self.api.get(reverse('api_fitbit_callback') + f'?code=abc&state={state}')      # no token: a browser redirect
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r['Location'], 'https://app.example.com/connections?fitbit=connected')
        self.assertEqual(FitbitConnection.objects.get().access_token, 'AT')
        self.assertEqual(ActivityEntry.objects.get(date=today).steps, 7000)
        self.assertTrue(self.call('get', 'api_connections').json()['fitbit']['connected'])

    def test_state_is_single_use_and_forgery_rejected(self):
        state = self.start()
        forged = self.api.get(reverse('api_fitbit_callback') + '?code=abc&state=forged')
        self.assertTrue(forged['Location'].endswith('?fitbit=invalid'))
        with mock.patch.object(ext, 'http_json', side_effect=ext.ApiError('down')):
            first = self.api.get(reverse('api_fitbit_callback') + f'?code=abc&state={state}')
        self.assertTrue(first['Location'].endswith('?fitbit=error'))
        replay = self.api.get(reverse('api_fitbit_callback') + f'?code=abc&state={state}')
        self.assertTrue(replay['Location'].endswith('?fitbit=invalid'))
        self.assertFalse(FitbitConnection.objects.exists())

    def test_denied_by_user(self):
        r = self.api.get(reverse('api_fitbit_callback') + '?error=access_denied')
        self.assertTrue(r['Location'].endswith('?fitbit=denied'))

    def test_sync_disconnect_and_not_connected(self):
        self.assertEqual(self.call('post', 'api_fitbit_sync', {}).status_code, 400)
        FitbitConnection.objects.create(user=self.user, access_token='a', refresh_token='r',
                                        expires_at=timezone.now() + timedelta(hours=1))
        with mock.patch.object(ext, 'http_json', side_effect=ext.ApiError('HTTP 500')):
            self.assertEqual(self.call('post', 'api_fitbit_sync', {'days': 3}).status_code, 502)
        self.call('post', 'api_fitbit_disconnect')
        self.assertFalse(FitbitConnection.objects.exists())

    @override_settings(FITBIT_CLIENT_ID='', FITBIT_CLIENT_SECRET='')
    def test_connect_without_keys(self):
        r = self.call('post', 'api_fitbit_connect')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'not_configured'))


class ClassicRedirectTests(ApiCase):
    @override_settings(FRONTEND_URL='https://app.example.com')
    def test_old_pages_redirect_to_react(self):
        for old, new in [('/', '/'), ('/dashboard/', '/dashboard'), ('/meals/add/', '/meals/new'),
                         ('/meals/12/edit/', '/meals/12/edit'), ('/accounts/login/', '/login'),
                         ('/recipes/52772/', '/recipes/52772'), ('/foods/add/?name=x', '/foods/new?name=x')]:
            r = self.client.get(old)
            self.assertEqual(r.status_code, 302, old)
            self.assertEqual(r['Location'], 'https://app.example.com' + new, old)

    @override_settings(FRONTEND_URL='https://app.example.com')
    def test_backend_only_paths_are_not_redirected(self):
        self.assertEqual(self.client.get('/admin/login/').status_code, 200)
        self.assertEqual(self.client.get(reverse('api_auth_me')).status_code, 200)         # logged-in session GET
        self.assertEqual(self.client.get('/accounts/password-reset/').status_code, 200)

    def test_without_frontend_url_nothing_redirects(self):
        self.client.logout()
        self.assertEqual(self.client.get('/').status_code, 200)                            # classic landing page

    @override_settings(FRONTEND_URL='https://app.example.com')
    def test_frontend_origin_is_allowed_by_cors(self):
        with override_settings(CORS_ALLOWED_ORIGINS=['https://app.example.com']):
            r = self.client.get(reverse('api_auth_me'), HTTP_ORIGIN='https://app.example.com')
        self.assertEqual(r['Access-Control-Allow-Origin'], 'https://app.example.com')
