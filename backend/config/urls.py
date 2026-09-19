"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.http import HttpResponse, HttpResponseNotFound
from django.urls import include, path, re_path
from django.conf import settings

# django.contrib.admin is not installed (see settings.py) — login is fully
# custom against user_account/role/user_role, so there's no admin/ route.
# Module URLs get included here as each module builds out its API.

urlpatterns = [
    path('api/identity/', include('module_01_identity_access.urls')),
    path('api/hr/', include('module_02_hr.urls')),
    path('api/training/', include('module_03_training.urls')),
    path('api/admissions/', include('local_extensions.urls')),
    path('api/student/', include('module_03_training.student_urls')),
    path("api/documents/", include("module_06_documents.urls")),
    path("api/interns/", include("module_04_interns.urls")),
    path("api/projects/", include("module_05_clients_projects.urls")),
    path("api/email/", include("module_07_email.urls")),
    path("api/audit/", include("module_08_audit.urls")),
]


def serve_frontend(request, *args, **kwargs):
    """Catch-all for anything not matched above — hands back the built
    React app's index.html so client-side routing (React Router) can take
    over, including on a hard refresh/deep link into e.g. /hr/attendance.
    Real asset files (JS/CSS/images) are served separately by WhiteNoise
    (see WHITENOISE_ROOT in settings.py) and never reach this view."""
    index_path = settings.FRONTEND_DIST / 'index.html'
    if not index_path.exists():
        return HttpResponseNotFound(
            "Frontend build not found — run `npm run build` in frontend/."
        )
    return HttpResponse(index_path.read_text(encoding='utf-8'))


urlpatterns += [
    re_path(r'^.*$', serve_frontend),
]
