"""Middleware for the split backend / frontend setup.

ApiCorsMiddleware: lets the separately hosted frontend (e.g. on Vercel) call /api/ from a browser.
    Origins come from CORS_ALLOWED_ORIGINS. The API uses token headers, not cookies, so credentials are
    never allowed and no CSRF exposure is created.
ClassicRedirectMiddleware: when FRONTEND_URL is set, the old server-rendered pages redirect to the React app.
"""
import re

from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect

ALLOW_HEADERS = 'Authorization, Content-Type'
ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'


class ApiCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def allowed_origins():
        return set(getattr(settings, 'CORS_ALLOWED_ORIGINS', []))

    def __call__(self, request):
        is_api = request.path.startswith('/api/')
        origin = request.headers.get('Origin', '')
        allowed = is_api and origin and origin in self.allowed_origins()

        if is_api and request.method == 'OPTIONS' and 'Access-Control-Request-Method' in request.headers:
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        if allowed:
            response['Access-Control-Allow-Origin'] = origin
            response['Access-Control-Allow-Headers'] = ALLOW_HEADERS
            response['Access-Control-Allow-Methods'] = ALLOW_METHODS
            response['Access-Control-Max-Age'] = '86400'
            response['Vary'] = 'Origin'
        elif is_api and origin:
            response['Vary'] = 'Origin'
        return response


# Classic Django page -> React route. Only these exact paths redirect; /api/, /admin/, static files,
# password-reset links and webhooks keep working on the backend.
_CLASSIC_TO_REACT = [
    (r'^/$', '/'),
    (r'^/dashboard/$', '/dashboard'),
    (r'^/meals/$', '/meals'),
    (r'^/meals/add/$', '/meals/new'),
    (r'^/meals/(\d+)/edit/$', r'/meals/\1/edit'),
    (r'^/activity/$', '/activity'),
    (r'^/activity/add/$', '/activity/new'),
    (r'^/activity/(\d+)/edit/$', r'/activity/\1/edit'),
    (r'^/weight/$', '/weight'),
    (r'^/foods/$', '/foods'),
    (r'^/foods/add/$', '/foods/new'),
    (r'^/foods/(\d+)/edit/$', r'/foods/\1/edit'),
    (r'^/goals/$', '/goals'),
    (r'^/analytics/$', '/analytics'),
    (r'^/recipes/$', '/recipes'),
    (r'^/recipes/(\w+)/$', r'/recipes/\1'),
    (r'^/saved/$', '/saved'),
    (r'^/calculator/$', '/calculator'),
    (r'^/account/$', '/account'),
    (r'^/accounts/password/$', '/account'),
    (r'^/connections/$', '/connections'),
    (r'^/accounts/login/$', '/login'),
    (r'^/accounts/signup/$', '/signup'),
]
_COMPILED = [(re.compile(rx), target) for rx, target in _CLASSIC_TO_REACT]


class ClassicRedirectMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        base = getattr(settings, 'FRONTEND_URL', '')
        if base and request.method in ('GET', 'HEAD'):
            for rx, target in _COMPILED:
                m = rx.match(request.path)
                if m:
                    path = m.expand(target)
                    query = request.META.get('QUERY_STRING', '')
                    return HttpResponseRedirect(f'{base}{path}' + (f'?{query}' if query else ''))
        return self.get_response(request)
