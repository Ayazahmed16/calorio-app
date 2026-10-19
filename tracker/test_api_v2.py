import json
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse

from . import integrations as ext
from . import services
from .models import ActivityEntry, ApiToken, DailyGoal, FavoriteFood, Food, MealEntry, WeightEntry
from .tests import BaseCase


class ApiCase(BaseCase):
    """Token-authenticated JSON client, no browser session."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.token = ApiToken.objects.create(user=self.user).key
        self.api = self.client_class()

    def call(self, method, name, data=None, args=None, query='', token='default', **extra):
        url = reverse(name, args=args or []) + query
        headers = {}
        if token == 'default':
            token = self.token
        if token:
            headers['HTTP_AUTHORIZATION'] = f'Token {token}'
        headers.update(extra)
        fn = getattr(self.api, method)
        if method in ('post', 'put') or data is not None:
            return fn(url, json.dumps(data if data is not None else {}), content_type='application/json', **headers)
        return fn(url, **headers)


class AuthTests(ApiCase):
    def test_signup_returns_token_that_works(self):
        r = self.call('post', 'api_auth_signup', {'username': 'newbie', 'password1': 'Str0ng!pass99',
                                                   'password2': 'Str0ng!pass99', 'email': 'n@example.com'}, token=None)
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertEqual(body['user']['username'], 'newbie')
        me = self.call('get', 'api_auth_me', token=body['token'])
        self.assertEqual(me.json()['user']['email'], 'n@example.com')
        self.assertTrue(DailyGoal.objects.filter(user__username='newbie').exists())

    def test_signup_validation(self):
        r = self.call('post', 'api_auth_signup', {'username': 'x', 'password1': 'a', 'password2': 'b'}, token=None)
        self.assertEqual(r.status_code, 400)
        self.assertIn('password2', r.json()['fields'])
        r = self.call('post', 'api_auth_signup', {'username': 'ayaz', 'password1': 'Str0ng!pass99',
                                                   'password2': 'Str0ng!pass99'}, token=None)
        self.assertEqual(r.status_code, 400)                                  # username taken
        self.assertIn('username', r.json()['fields'])

    def test_login_ok_and_wrong_password(self):
        r = self.call('post', 'api_auth_login', {'username': 'AYAZ ', 'password': 'pass12345!'}, token=None)
        self.assertEqual(r.status_code, 400)                                  # usernames are case-sensitive in Django
        r = self.call('post', 'api_auth_login', {'username': 'ayaz', 'password': 'pass12345!'}, token=None)
        self.assertEqual(r.status_code, 200)
        self.assertIn('token', r.json())
        r = self.call('post', 'api_auth_login', {'username': 'ayaz', 'password': 'nope'}, token=None)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['error'], 'invalid_credentials')

    def test_login_is_throttled_and_resets_on_success(self):
        for _ in range(8):
            self.call('post', 'api_auth_login', {'username': 'ayaz', 'password': 'bad'}, token=None)
        r = self.call('post', 'api_auth_login', {'username': 'ayaz', 'password': 'pass12345!'}, token=None)
        self.assertEqual(r.status_code, 429)                                  # even the right password is blocked
        cache.clear()
        self.assertEqual(self.call('post', 'api_auth_login', {'username': 'ayaz', 'password': 'pass12345!'}, token=None).status_code, 200)

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        r = self.call('post', 'api_auth_login', {'username': 'ayaz', 'password': 'pass12345!'}, token=None)
        self.assertEqual(r.status_code, 400)

    def test_logout_invalidates_token(self):
        self.assertEqual(self.call('post', 'api_auth_logout').status_code, 204)
        self.assertEqual(self.call('get', 'api_auth_me').status_code, 401)

    def test_protected_without_token_and_invalid_json(self):
        for name in ('api_dashboard', 'api_meals', 'api_goals', 'api_foods', 'api_analytics', 'api_weight'):
            self.assertEqual(self.call('get', name, token=None).status_code, 401, name)
        r = self.api.post(reverse('api_auth_login'), 'not json', content_type='application/json')
        self.assertEqual(r.status_code, 400)


class CorsTests(ApiCase):
    @override_settings(CORS_ALLOWED_ORIGINS=['https://app.example.com'])
    def test_allowed_origin_gets_headers_and_preflight_works(self):
        r = self.call('get', 'api_auth_me', HTTP_ORIGIN='https://app.example.com')
        self.assertEqual(r['Access-Control-Allow-Origin'], 'https://app.example.com')
        self.assertNotIn('Access-Control-Allow-Credentials', r)
        pre = self.api.options(reverse('api_meals'), HTTP_ORIGIN='https://app.example.com',
                               HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
                               HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type')
        self.assertEqual(pre.status_code, 204)
        self.assertIn('Authorization', pre['Access-Control-Allow-Headers'])
        self.assertIn('DELETE', pre['Access-Control-Allow-Methods'])

    @override_settings(CORS_ALLOWED_ORIGINS=['https://app.example.com'])
    def test_other_origins_and_non_api_paths_get_nothing(self):
        r = self.call('get', 'api_auth_me', HTTP_ORIGIN='https://evil.example')
        self.assertNotIn('Access-Control-Allow-Origin', r)
        r = self.client.get(reverse('landing'), HTTP_ORIGIN='https://app.example.com')
        self.assertNotIn('Access-Control-Allow-Origin', r)


class DashboardAndMealTests(ApiCase):
    def setUp(self):
        super().setUp()
        self.rice = Food.objects.create(name='White rice', calories=130, protein=2.7, carbs=28, fat=0.3)
        self.oil = Food.objects.create(name='Olive oil', calories=884, protein=0, carbs=0, fat=100)

    def test_builder_creates_several_foods_atomically(self):
        r = self.call('post', 'api_meals', {'meal_type': 'dinner', 'date': str(self.today), 'items': [
            {'food': self.food.id, 'quantity_grams': 200}, {'food': self.rice.id, 'quantity_grams': 150},
            {'food': self.oil.id, 'quantity_grams': 10}]})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.json()['results']), 3)
        self.assertEqual(MealEntry.objects.count(), 3)

    def test_builder_rejects_whole_meal_if_one_item_is_bad(self):
        r = self.call('post', 'api_meals', {'meal_type': 'dinner', 'date': str(self.today), 'items': [
            {'food': self.food.id, 'quantity_grams': 200}, {'food': self.rice.id, 'quantity_grams': -4}]})
        self.assertEqual(r.status_code, 400)
        self.assertIn('quantity_grams', r.json()['fields']['items']['1'])
        self.assertEqual(MealEntry.objects.count(), 0)

    def test_builder_limits(self):
        self.assertEqual(self.call('post', 'api_meals', {'meal_type': 'lunch', 'date': str(self.today), 'items': []}).status_code, 400)
        many = [{'food': self.food.id, 'quantity_grams': 1}] * 31
        self.assertEqual(self.call('post', 'api_meals', {'meal_type': 'lunch', 'date': str(self.today), 'items': many}).status_code, 400)
        theirs = Food.objects.create(name='Secret', calories=1, protein=0, carbs=0, fat=0, owner=self.other)
        r = self.call('post', 'api_meals', {'meal_type': 'lunch', 'date': str(self.today), 'items': [{'food': theirs.id, 'quantity_grams': 5}]})
        self.assertEqual(r.status_code, 400)

    def test_list_filters_and_pagination(self):
        for i in range(25):
            MealEntry.objects.create(user=self.user, food=self.food, quantity_grams=10, meal_type='lunch',
                                     date=self.today - timedelta(days=i))
        MealEntry.objects.create(user=self.user, food=self.food, quantity_grams=10, meal_type='dinner', date=self.today)
        body = self.call('get', 'api_meals').json()
        self.assertEqual((body['count'], body['num_pages'], len(body['results'])), (26, 2, 20))
        body = self.call('get', 'api_meals', query='?page=2').json()
        self.assertEqual(len(body['results']), 6)
        self.assertEqual(self.call('get', 'api_meals', query='?type=dinner').json()['count'], 1)
        self.assertEqual(self.call('get', 'api_meals', query=f'?from={self.today}').json()['count'], 2)
        self.assertEqual(self.call('get', 'api_meals', query='?page=999').json()['page'], 2)       # clamps, no error

    def test_update_and_delete_meal(self):
        m = MealEntry.objects.create(user=self.user, food=self.food, quantity_grams=100, meal_type='lunch', date=self.today)
        r = self.call('put', 'api_meal_detail', {'food': self.rice.id, 'quantity_grams': 300, 'meal_type': 'dinner',
                                                  'date': str(self.today)}, args=[m.pk])
        self.assertEqual((r.status_code, r.json()['food_name'], r.json()['calories']), (200, 'White rice', 390.0))
        self.assertEqual(self.call('put', 'api_meal_detail', {'food': self.rice.id, 'quantity_grams': 0, 'meal_type': 'dinner',
                                                              'date': str(self.today)}, args=[m.pk]).status_code, 400)
        self.assertEqual(self.call('delete', 'api_meal_detail', args=[m.pk]).status_code, 204)
        self.assertFalse(MealEntry.objects.filter(pk=m.pk).exists())

    def test_dashboard_numbers(self):
        MealEntry.objects.create(user=self.user, food=self.food, quantity_grams=200, meal_type='lunch', date=self.today)
        ActivityEntry.objects.create(user=self.user, date=self.today, steps=5000, calories_burned=300)
        WeightEntry.objects.create(user=self.user, date=self.today, weight_kg=80)
        d = self.call('get', 'api_dashboard').json()
        self.assertEqual(d['totals']['calories'], 330)
        self.assertEqual(d['totals']['net_calories'], 30)
        self.assertEqual(d['steps'], 5000)
        self.assertEqual(d['progress']['steps'], 50)
        self.assertEqual(d['weight']['weight_kg'], 80)
        self.assertEqual(d['streak']['current'], 1)
        self.assertEqual(d['goals']['calories'], 2000)
        self.assertEqual(d['meals'][0]['food_name'], 'Chicken')
        self.assertTrue(d['is_today'])

    def test_dashboard_other_day_and_future_clamped(self):
        y = self.today - timedelta(days=1)
        MealEntry.objects.create(user=self.user, food=self.food, quantity_grams=100, meal_type='lunch', date=y)
        self.assertEqual(self.call('get', 'api_dashboard', query=f'?date={y}').json()['totals']['calories'], 165)
        far = self.call('get', 'api_dashboard', query=f'?date={self.today + timedelta(days=9)}').json()
        self.assertTrue(far['is_today'])


class ActivityWeightWaterGoalTests(ApiCase):
    def test_activity_list_update_delete(self):
        a = ActivityEntry.objects.create(user=self.user, date=self.today, steps=100, calories_burned=5)
        b = ActivityEntry.objects.create(user=self.user, date=self.today - timedelta(days=1), steps=200, calories_burned=6)
        r = self.call('put', 'api_activity_detail', {'steps': 900, 'calories_burned': 40, 'activity_type': 'run',
                                                      'date': str(self.today)}, args=[a.pk])
        self.assertEqual((r.status_code, r.json()['steps']), (200, 900))
        clash = self.call('put', 'api_activity_detail', {'steps': 1, 'calories_burned': 1, 'activity_type': '',
                                                          'date': str(self.today)}, args=[b.pk])
        self.assertEqual(clash.status_code, 400)
        self.assertEqual(self.call('delete', 'api_activity_detail', args=[b.pk]).status_code, 204)
        self.assertEqual(self.call('get', 'api_activity').json()['count'], 1)

    def test_other_users_rows_are_404(self):
        a = ActivityEntry.objects.create(user=self.other, date=self.today, steps=1, calories_burned=1)
        w = WeightEntry.objects.create(user=self.other, date=self.today, weight_kg=70)
        self.assertEqual(self.call('delete', 'api_activity_detail', args=[a.pk]).status_code, 404)
        self.assertEqual(self.call('delete', 'api_weight_detail', args=[w.pk]).status_code, 404)

    def test_weight_series_stats_and_delete(self):
        for days, kg in ((40, 82), (20, 81), (0, 80)):
            WeightEntry.objects.create(user=self.user, date=self.today - timedelta(days=days), weight_kg=kg)
        body = self.call('get', 'api_weight').json()
        self.assertEqual(body['latest']['weight_kg'], 80)
        self.assertEqual(body['change_30d'], -2.0)
        self.assertEqual(body['lowest']['weight_kg'], 80)
        self.assertEqual([p['weight_kg'] for p in body['series']], [82, 81, 80])         # last 90 days, oldest first
        e = WeightEntry.objects.first()
        self.assertEqual(self.call('delete', 'api_weight_detail', args=[e.pk]).status_code, 204)

    def test_goals_get_put_validation(self):
        self.assertEqual(self.call('get', 'api_goals').json()['calories'], 2000)
        r = self.call('put', 'api_goals', {'target_calories': 2400, 'target_water_ml': 2500})
        self.assertEqual((r.status_code, r.json()['calories'], r.json()['water_ml'], r.json()['protein']), (200, 2400, 2500, 100))
        self.assertEqual(self.call('put', 'api_goals', {'target_calories': 50}).status_code, 400)

    def test_water_still_works(self):
        self.assertEqual(self.call('post', 'api_water', {'amount_ml': 250}).json()['amount_ml'], 250)


class FoodApiTests(ApiCase):
    def test_list_search_scope_category_and_favorites(self):
        mine = Food.objects.create(name='My shake', calories=100, protein=20, carbs=5, fat=1, owner=self.user)
        Food.objects.create(name='Hidden', calories=1, protein=0, carbs=0, fat=0, owner=self.other)
        FavoriteFood.objects.create(user=self.user, food=mine)
        body = self.call('get', 'api_foods').json()
        names = [f['name'] for f in body['results']]
        self.assertEqual(sorted(names), ['Chicken', 'My shake'])
        shake = next(f for f in body['results'] if f['name'] == 'My shake')
        self.assertTrue(shake['favorite'] and shake['can_edit'] and shake['custom'])
        chicken = next(f for f in body['results'] if f['name'] == 'Chicken')
        self.assertFalse(chicken['can_edit'])
        self.assertEqual(self.call('get', 'api_foods', query='?scope=mine').json()['count'], 1)
        self.assertEqual(self.call('get', 'api_foods', query='?scope=favorites').json()['results'][0]['name'], 'My shake')
        self.assertEqual(self.call('get', 'api_foods', query='?category=protein').json()['count'], 2)
        self.assertEqual(self.call('get', 'api_foods', query='?q=chick').json()['count'], 1)
        self.assertEqual(self.call('get', 'api_foods', query='?all=1').json()['count'], 2)

    def test_create_update_delete_own_food(self):
        with mock.patch('tracker.services.find_food_image', return_value='https://img.example/m.jpg'):
            r = self.call('post', 'api_foods', {'name': 'Mango', 'calories': 60, 'protein': 0.8, 'carbs': 15, 'fat': 0.4})
        self.assertEqual(r.status_code, 201)
        food = r.json()
        self.assertEqual((food['category'], food['image'], food['custom'], food['can_edit']), ('carbs', 'https://img.example/m.jpg', True, True))
        r = self.call('put', 'api_food_detail', {'name': 'Mango XL', 'calories': 70, 'protein': 1, 'carbs': 16, 'fat': 0.5,
                                                  'category': 'other'}, args=[food['id']])
        self.assertEqual((r.status_code, r.json()['name'], r.json()['category']), (200, 'Mango XL', 'other'))
        MealEntry.objects.create(user=self.user, food_id=food['id'], quantity_grams=10, meal_type='snack', date=self.today)
        r = self.call('delete', 'api_food_detail', args=[food['id']])
        self.assertEqual((r.status_code, r.json()['deleted_meals']), (200, 1))

    def test_food_validation(self):
        r = self.call('post', 'api_foods', {'name': 'Bad', 'calories': 100, 'protein': 70, 'carbs': 70, 'fat': 10})
        self.assertEqual(r.status_code, 400)
        r = self.call('post', 'api_foods', {'name': 'chicken', 'calories': 1, 'protein': 0, 'carbs': 0, 'fat': 0})
        self.assertEqual(r.status_code, 400)                                    # duplicate of a visible food

    def test_shared_foods_are_read_only_for_normal_users(self):
        r = self.call('put', 'api_food_detail', {'name': 'Chicken', 'calories': 1, 'protein': 0, 'carbs': 0, 'fat': 0}, args=[self.food.pk])
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.call('delete', 'api_food_detail', args=[self.food.pk]).status_code, 403)
        self.user.is_staff = True
        self.user.save()
        self.assertEqual(self.call('delete', 'api_food_detail', args=[self.food.pk]).status_code, 200)

    def test_cannot_see_other_users_food(self):
        theirs = Food.objects.create(name='Secret', calories=1, protein=0, carbs=0, fat=0, owner=self.other)
        self.assertEqual(self.call('get', 'api_food_detail', args=[theirs.pk]).status_code, 404)
        self.assertEqual(self.call('post', 'api_food_favorite', args=[theirs.pk]).status_code, 404)

    def test_favorite_toggle(self):
        self.assertTrue(self.call('post', 'api_food_favorite', args=[self.food.pk]).json()['favorite'])
        self.assertFalse(self.call('post', 'api_food_favorite', args=[self.food.pk]).json()['favorite'])

    def test_web_lookup(self):
        with mock.patch.object(ext, 'search_all', return_value=[{'name': 'Bananas, raw', 'calories': 89, 'protein': 1,
                                                                  'carbs': 22, 'fat': 0.3, 'barcode': '', 'image': ''}]):
            body = self.call('get', 'api_food_lookup', query='?q=banana').json()
        self.assertEqual(body['results'][0]['source'], 'Open Food Facts')
        with mock.patch.object(services, '_get_json', return_value=None):
            self.assertEqual(self.call('get', 'api_food_lookup', query='?barcode=12').json()['results'], [])


class AnalyticsApiTests(ApiCase):
    def test_analytics_json(self):
        MealEntry.objects.create(user=self.user, food=self.food, quantity_grams=200, meal_type='lunch', date=self.today)
        body = self.call('get', 'api_analytics').json()
        self.assertEqual(len(body['rows']), 7)
        self.assertEqual(body['avg_calories'], 330)
        self.assertEqual(body['rows'][-1]['date'], str(self.today))
        self.assertEqual(body['goal']['calories'], 2000)
        self.assertEqual(len(self.call('get', 'api_analytics', query='?days=30').json()['rows']), 30)
        self.assertEqual(self.call('get', 'api_analytics', query='?days=abc').json()['days'], 7)
