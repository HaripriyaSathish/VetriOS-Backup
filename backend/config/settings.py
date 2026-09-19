"""
Django settings for config project.
"""

from pathlib import Path
from decouple import config
import cloudinary

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='*').split(',')


# Application definition
#
# Full contrib stack (admin/auth/contenttypes/sessions/messages) per
# dev's d7dd7a0 — adopted here instead of the earlier JWT-only,
# no-admin setup. AUTH_USER_MODEL and SIMPLE_JWT below are still
# required on top of that: without them, JWTAuthentication and the
# admin site would both fall back to the default (non-existent, for
# our schema) auth.User instead of our real UserAccount model.

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'corsheaders',
    'cloudinary_storage',
    'cloudinary',

    'module_01_identity_access',
    'module_02_hr',
    'module_03_training',
    'module_04_interns',
    'module_05_clients_projects',
    'module_06_documents',
    'module_07_email',
    'module_08_audit',
    'module_09_ai_rag',
    'local_extensions',
]

# JWTAuthentication resolves the token's user via get_user_model(), and
# the admin site's own login also authenticates against whatever
# AUTH_USER_MODEL points to — both need this pointed at our real
# UserAccount, not contrib.auth's default User.
AUTH_USER_MODEL = 'module_01_identity_access.UserAccount'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'module_08_audit.middleware.CurrentUserMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database — VetriOSDB, connected as vetri_app_role (never postgres)

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='VetriOSDB'),
        'USER': config('DB_USER', default='vetri_app_role'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
        'OPTIONS': {
            'options': '-c search_path=public,django'
        },
    }
}

# Django REST Framework — JWT only, no session auth
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

# simplejwt defaults to reading `user.id` — UserAccount's primary key
# attribute is `user_id` instead, so point it there explicitly.
SIMPLE_JWT = {
    'USER_ID_FIELD': 'user_id',
}


# CORS — allow the frontend dev server to call this API. In production the
# frontend is served from this same Django process/origin (see urls.py's
# SPA fallback view), so CORS headers aren't actually exercised there —
# this only matters for local dev, where Vite runs on its own port.
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:5173'
).split(',')

# CSRF — needed for Django's own session-authenticated views (there are
# none wired into urls.py today, but this is required by CsrfViewMiddleware
# whenever DEBUG=False and the app is reached over a non-default origin).
CSRF_TRUSTED_ORIGINS = [
    o for o in config('CSRF_TRUSTED_ORIGINS', default='').split(',') if o
]


# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True


# Static & media files
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# The built frontend (frontend/dist, produced by `npm run build`) — served
# directly by WhiteNoise at its own root-relative asset paths (e.g.
# /assets/index-xyz.js), separate from Django's own STATIC_URL/STATIC_ROOT
# above. Only present after the frontend build step runs (see Dockerfile);
# harmless if missing locally, WhiteNoise just serves nothing from it.
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.exists() else None

# Cloudinary — used as the default file storage for uploads
# (certificates, documents, attachments) instead of local disk
STORAGES = {
    "default": {
        "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

CLOUDINARY_STORAGE = {
    'CLOUD_NAME': config('CLOUDINARY_CLOUD_NAME'),
    'API_KEY': config('CLOUDINARY_API_KEY'),
    'API_SECRET': config('CLOUDINARY_API_SECRET'),
}

cloudinary.config(
    cloud_name=config('CLOUDINARY_CLOUD_NAME'),
    api_key=config('CLOUDINARY_API_KEY'),
    api_secret=config('CLOUDINARY_API_SECRET'),
    secure=True,
)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Email — default (Haripriya's Gmail config, used elsewhere/as fallback)
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('EMAIL_HOST_USER', default='')

# Email — Outlook/Office 365 config for module_07_email (Bhanu's Email
# Automation module), kept separate from the default account above so
# switching providers here never touches the shared default connection.
OUTLOOK_EMAIL_HOST = config('OUTLOOK_EMAIL_HOST', default='smtp-mail.outlook.com')
OUTLOOK_EMAIL_PORT = config('OUTLOOK_EMAIL_PORT', default=587, cast=int)
OUTLOOK_EMAIL_USE_TLS = config('OUTLOOK_EMAIL_USE_TLS', default=True, cast=bool)
OUTLOOK_EMAIL_HOST_USER = config('OUTLOOK_EMAIL_HOST_USER', default='')
OUTLOOK_EMAIL_HOST_PASSWORD = config('OUTLOOK_EMAIL_HOST_PASSWORD', default='')