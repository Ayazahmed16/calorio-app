"""CORS for the JSON API so a separately hosted frontend (e.g. on Vercel) can call it.

Origins come from CORS_ALLOWED_ORIGINS (comma separated). The API uses token headers, not cookies,
so credentials are never allowed and no CSRF exposure is created.
"""
from django.conf import settings
from django.http import HttpResponse

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
