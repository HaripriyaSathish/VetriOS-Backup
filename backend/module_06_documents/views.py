import html
import io
import json
import os
import re
import tempfile
import zipfile
from html.parser import HTMLParser
import cloudinary.utils
import pypdf
from cloudinary_storage.storage import RawMediaCloudinaryStorage
from docx import Document as DocxDocument
from docx.oxml.ns import qn
try:
    # Windows + Word (COM automation) only — not installed on Linux
    # deployments, where convert_docx_to_pdf_bytes() below raises instead.
    from docx2pdf import convert as docx2pdf_convert
except ImportError:
    docx2pdf_convert = None
from xhtml2pdf import pisa
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import FileResponse, HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from local_extensions.ai_service import ask_groq
from local_extensions.notification_utils import notify
from module_01_identity_access.models import PermissionRequest, Person, UserAccount, UserRole
from module_02_hr.models import Employee, PersonDepartmentHistory
from .models import (
    AccessLevel,
    AiDocumentGeneration,
    ConfidentialityLevel,
    Document,
    DocumentAccessRule,
    DocumentCategory,
    DocumentPerson,
    DocumentRetention,
    DocumentTemplate,
    DocumentType,
    DocumentVersion,
)
from .permissions import CanCreateDocuments, CanViewDocuments, IsSystemAdminOrHR
from .serializers import (
    DocumentAccessRuleSerializer,
    DocumentListSerializer,
    DocumentRetentionSerializer,
    DocumentTemplateCreateSerializer,
    DocumentTemplateSerializer,
    DocumentUploadSerializer,
    GenerateDocumentSerializer,
    GenerationLogSerializer,
)
from module_03_training.models import Enrollment, Student
from module_04_interns.models import Intern

# TODO: replace with the confirmed value from the full chk_document_status
# CHECK constraint list once you've pasted the untruncated result.
DEFAULT_DOCUMENT_STATUS = "ACTIVE"

CERT_SLOTS = {
    "10TH": "10th Marksheet",
    "12TH": "12th Marksheet",
    "UG": "UG Certificate",
    "PG": "PG Certificate",
    "TC": "Terms & Conditions (Signed)",
}


def user_is_business_team(user):
    return "Business Team" in user.active_role_names()


def user_is_system_admin(user):
    return "System Administrator" in user.active_role_names()


def _can_view_certificates(user):
    return user_is_business_team(user) or user_is_system_admin(user)


class StudentCertificatesView(APIView):
    """GET: current status of all 5 certificate slots for a student.
    POST: upload one or more slots at once (multipart, field name =
    slot key: '10TH', '12TH', 'UG', 'PG', 'TC'). Business Team only
    for POST; Business Team + System Administrator can GET."""
    permission_classes = [IsAuthenticated]

    def get(self, request, person_id):
        if not _can_view_certificates(request.user):
            return Response({"detail": "Not authorized."}, status=403)

        try:
            person = Person.objects.get(person_id=person_id)
        except Person.DoesNotExist:
            return Response({"detail": "Student not found."}, status=404)

        codes = [f"CERT-{slot}-{person_id}" for slot in CERT_SLOTS]
        docs = {
            d.document_code: d
            for d in Document.objects.filter(document_code__in=codes).prefetch_related("versions")
        }

        certificates = {}
        for slot, label in CERT_SLOTS.items():
            doc = docs.get(f"CERT-{slot}-{person_id}")
            if not doc:
                certificates[slot] = {"label": label, "uploaded": False}
                continue
            version = doc.versions.filter(is_current=True).first()
            certificates[slot] = {
                "label": label,
                "uploaded": True,
                "document_id": doc.document_id,
                "file_name": version.file_name if version else None,
                "uploaded_at": version.created_at if version else None,
            }

        return Response({
            "person_id": person.person_id,
            "name": f"{person.first_name} {person.last_name or ''}".strip(),
            "email": person.email,
            "phone": person.phone,
            "certificates": certificates,
        })

    def post(self, request, person_id):
        if not user_is_business_team(request.user):
            return Response({"detail": "Only Business Team can upload certificates."}, status=403)

        try:
            person = Person.objects.get(person_id=person_id)
        except Person.DoesNotExist:
            return Response({"detail": "Student not found."}, status=404)

        results = {}
        with transaction.atomic():
            for slot, label in CERT_SLOTS.items():
                file_obj = request.FILES.get(slot)
                if not file_obj:
                    continue

                code = f"CERT-{slot}-{person_id}"
                document, created = Document.objects.get_or_create(
                    document_code=code,
                    defaults=dict(
                        document_type_id=4,          # CERTIFICATE
                        confidentiality_level_id=3,  # RESTRICTED
                        access_level_id=3,           # RESTRICTED
                        document_title=f"{label} — {person.first_name} {person.last_name or ''}".strip(),
                        owner_user=request.user,
                        created_by_user=request.user,
                        current_version_number=1,
                        status=DEFAULT_DOCUMENT_STATUS,
                        is_confidential=True,
                        created_at=timezone.now(),
                        updated_at=timezone.now(),
                    ),
                )

                if created:
                    DocumentPerson.objects.create(
                        document=document, person=person,
                        relationship_type="SUBJECT", created_at=timezone.now(),
                    )
                    next_version = 1
                else:
                    last = document.versions.order_by("-version_number").first()
                    next_version = (last.version_number + 1) if last else 1
                    document.versions.filter(is_current=True).update(is_current=False)
                    document.current_version_number = next_version
                    document.updated_at = timezone.now()
                    document.save(update_fields=["current_version_number", "updated_at"])

                relative_dir = os.path.join("certificates", str(person_id), slot)
                storage_dir = os.path.join(settings.MEDIA_ROOT, relative_dir)
                os.makedirs(storage_dir, exist_ok=True)
                filename = f"v{next_version}_{file_obj.name}"
                disk_path = os.path.join(storage_dir, filename)
                with open(disk_path, "wb+") as dest:
                    for chunk in file_obj.chunks():
                        dest.write(chunk)

                extracted = extract_text(disk_path, mime_type=file_obj.content_type)

                DocumentVersion.objects.create(
                    document=document,
                    version_number=next_version,
                    file_name=file_obj.name,
                    file_extension=os.path.splitext(file_obj.name)[1].lstrip("."),
                    mime_type=file_obj.content_type,
                    storage_provider="LOCAL",
                    storage_reference=os.path.join(relative_dir, filename),
                    file_size_bytes=file_obj.size,
                    extracted_text=extracted,
                    created_by_user=request.user,
                    created_at=timezone.now(),
                    is_current=True,
                )
                results[slot] = {"document_id": document.document_id, "version": next_version}

        if not results:
            return Response(
                {"detail": f"No files provided. Send at least one of: {', '.join(CERT_SLOTS)}"},
                status=400,
            )
        return Response({"uploaded": results}, status=201)


class CertificateDownloadView(APIView):
    """Business Team + System Administrator can download/view the
    current version of any certificate document."""
    permission_classes = [IsAuthenticated]

    def get(self, request, document_id):
        if not _can_view_certificates(request.user):
            return Response({"detail": "Not authorized."}, status=403)

        try:
            document = Document.objects.get(document_id=document_id)
        except Document.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        version = document.versions.filter(is_current=True).first()
        if not version or not version.storage_reference:
            return Response({"detail": "No file on record."}, status=404)

        file_path = os.path.join(settings.MEDIA_ROOT, version.storage_reference)
        if not os.path.exists(file_path):
            return Response({"detail": "File missing on disk."}, status=404)

        return FileResponse(open(file_path, "rb"), as_attachment=True, filename=version.file_name)

def _current_department_name(person_id):
    row = (
        PersonDepartmentHistory.objects.filter(person_id=person_id, is_current=True)
        .select_related("department")
        .order_by("-effective_from")
        .first()
    )
    return row.department.department_name if row else None


class DocumentTemplateListView(generics.ListAPIView):
    """Templates available to Vetri Tool (AI Generator). Only ever
    called from the two intern-offer-letter pages (System
    Administrator/HR Administrator only), so gated the same way."""
    permission_classes = [CanViewDocuments, IsSystemAdminOrHR]
    serializer_class = DocumentTemplateSerializer
    queryset = DocumentTemplate.objects.filter(is_active=True).order_by("template_name")


def _generate_docx_document(template, employee, data, request_user):
    """The design-preserving path: merges real values directly into the
    stored .docx's formatted runs (no AI drafting) and immediately saves
    the result as a real Document — there's nothing to "review" the way
    there is with AI-drafted prose, since it's an exact merge."""
    docx_bytes = _raw_cloud_storage.open(template.template_content).read()
    doc = DocxDocument(io.BytesIO(docx_bytes))

    all_text = "\n".join(p.text for p in doc.paragraphs)
    placeholders = sorted(set(PLACEHOLDER_RE.findall(all_text)))

    known_values = {
        "employee_name": str(employee.person),
        "recipient_name": str(employee.person),
        "designation": employee.designation.designation_name if employee.designation else "",
        "department": _current_department_name(employee.person_id) or "",
        "start_date": employee.joining_date.isoformat() if employee.joining_date else "",
        "stipend": data.get("stipend", ""),
    }
    field_values = data.get("field_values", {})

    final_values = {}
    missing = []
    for key in placeholders:
        if key in known_values and known_values[key]:
            final_values[key] = known_values[key]
        elif key in field_values:
            final_values[key] = field_values[key]
        elif key == "stipend":
            final_values[key] = known_values["stipend"]
        else:
            missing.append(key)

    if missing:
        return None, Response({"detail": f"Missing values for: {', '.join(missing)}"}, status=400)

    for paragraph in doc.paragraphs:
        for run in paragraph.runs:
            for key, value in final_values.items():
                if f"{{{{{key}}}}}" in run.text:
                    run.text = run.text.replace(f"{{{{{key}}}}}", str(value))

    merged_buffer = io.BytesIO()
    doc.save(merged_buffer)
    pdf_bytes = convert_docx_to_pdf_bytes(merged_buffer.getvalue())

    with transaction.atomic():
        document = Document.objects.create(
            document_type_id=template.document_type_id or 7,  # OTHER, if the template has no type set
            confidentiality_level_id=3,  # RESTRICTED
            access_level_id=3,
            document_code=f"GEN-{template.template_code}-{employee.employee_id}-{timezone.now().strftime('%Y%m%d%H%M%S')}",
            document_title=unique_document_title(f"{employee.person} — {template.template_name}"),
            owner_user=request_user,
            created_by_user=request_user,
            current_version_number=1,
            status=DEFAULT_DOCUMENT_STATUS,
            is_confidential=True,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        filename = f"{document.document_title}.pdf"
        storage_name = save_document_file(document.document_id, 1, filename, pdf_bytes)

        DocumentVersion.objects.create(
            document=document,
            version_number=1,
            file_name=filename,
            file_extension="pdf",
            mime_type=PDF_MIME_TYPE,
            storage_provider="CLOUDINARY",
            storage_reference=storage_name,
            file_size_bytes=len(pdf_bytes),
            created_by_user=request_user,
            created_at=timezone.now(),
            is_current=True,
        )

        DocumentPerson.objects.create(
            document=document, person=employee.person,
            relationship_type="SUBJECT", created_at=timezone.now(),
        )

        generation = AiDocumentGeneration.objects.create(
            document_template=template,
            generated_document=document,
            requested_by_user=request_user,
            generation_provider="mail-merge",
            generation_status="COMPLETED",
            requested_at=timezone.now(),
            completed_at=timezone.now(),
        )

    return {"generation_id": generation.ai_document_generation_id, "document_id": document.document_id}, None


class _ContentBodyHTMLParser(HTMLParser):
    """Turns the Content step's rich-text HTML (paragraphs, bold, line
    breaks, lists — everything RichTextEditor's TipTap toolbar can
    produce) into a flat list of paragraph blocks, each a list of
    (text, bold) run segments — the shape _insert_content_body needs
    to build real docx paragraphs from."""

    def __init__(self):
        super().__init__()
        self.paragraphs = []
        self._current_runs = []
        self._bold_depth = 0
        self._list_type = None
        self._list_index = 0

    def _flush_paragraph(self):
        if self._current_runs:
            self.paragraphs.append(self._current_runs)
        self._current_runs = []

    def handle_starttag(self, tag, attrs):
        if tag in ("strong", "b"):
            self._bold_depth += 1
        elif tag == "br":
            self._current_runs.append(("\n", self._bold_depth > 0))
        elif tag in ("p", "h2"):
            self._flush_paragraph()
        elif tag == "ul":
            self._list_type = "ul"
        elif tag == "ol":
            self._list_type = "ol"
            self._list_index = 0
        elif tag == "li":
            self._flush_paragraph()
            if self._list_type == "ol":
                self._list_index += 1

    def handle_endtag(self, tag):
        if tag in ("strong", "b"):
            self._bold_depth = max(0, self._bold_depth - 1)
        elif tag in ("p", "h2", "li"):
            if tag == "li" and self._current_runs:
                prefix = f"{self._list_index}. " if self._list_type == "ol" else "- "
                self._current_runs.insert(0, (prefix, False))
            self._flush_paragraph()
        elif tag in ("ul", "ol"):
            self._list_type = None

    def handle_data(self, data):
        if data:
            self._current_runs.append((data, self._bold_depth > 0))

    def finish(self):
        self._flush_paragraph()
        return self.paragraphs


def _insert_content_body(doc, resolved_html):
    """Drops the Content step's (already {{tag}}-resolved) text into the
    design at a "{{content}}" marker paragraph if the uploaded design
    has one, otherwise appends it at the end of the document — this is
    what lets a design-only template (just letterhead, no baked-in
    body) carry whatever the user actually wrote."""
    parser = _ContentBodyHTMLParser()
    parser.feed(resolved_html)
    blocks = parser.finish()

    anchor = None
    for p in doc.paragraphs:
        if p.text.strip() == "{{content}}":
            anchor = p
            break

    def build_paragraph(runs):
        paragraph = doc.add_paragraph()
        for text, bold in runs:
            if text == "\n":
                paragraph.add_run().add_break()
                continue
            run = paragraph.add_run(text)
            run.bold = bold
        return paragraph

    for runs in blocks:
        new_paragraph = build_paragraph(runs)
        if anchor is not None:
            anchor._p.addprevious(new_paragraph._p)

    if anchor is not None:
        anchor._p.getparent().remove(anchor._p)


def _intern_offer_known_values(intern):
    """Shared known-value set for the Course Integrated Internship Offer
    Letter — recipient/date/effective_date plus course_name/
    course_duration_days (from the intern's most recent Enrollment,
    same lookup as InternListView) are real HR/training data, never
    typed by hand. training_provider is fixed — every batch is trained
    by the same partner company."""
    person = intern.student.person
    enrollment = (
        Enrollment.objects.filter(student_id=intern.student_id)
        .select_related("course")
        .order_by("-enrollment_date")
        .first()
    )
    course = enrollment.course if enrollment else None
    return {
        "recipient_name": str(person),
        "date": timezone.localdate().strftime("%d %B, %Y"),
        "effective_date": intern.internship_start_date.strftime("%d.%m.%Y") if intern.internship_start_date else "",
        "course_name": course.course_name if course else "",
        "course_duration_days": str(course.duration_days) if course and course.duration_days else "",
        "training_provider": "VETRI TECHNOLOGY SOLUTIONS",
    }


def _render_canvas_html(layout, values):
    """Builds the printable HTML for a Design Editor layout — an absolute-
    positioned div per element inside a fixed-size page div, matching the
    editor canvas 1:1 in CSS px. Google Fonts are pulled in for whichever
    font families the text elements actually use, so the rendered PDF
    shows the real chosen font instead of a server-installed fallback."""
    page = layout.get("page", {})
    width = page.get("width", 794)
    height = page.get("height", 1123)
    elements = layout.get("elements", [])

    fonts_used = sorted({el.get("fontFamily", "Arial") for el in elements if el.get("type") == "text"})
    font_link = ""
    if fonts_used:
        families = "&".join(f"family={f.replace(' ', '+')}:wght@400;700" for f in fonts_used)
        font_link = f'<link href="https://fonts.googleapis.com/css2?{families}&display=swap" rel="stylesheet">'

    def esc(s):
        return html.escape(str(s)).replace("\n", "<br>")

    parts = ['<div class="page">']
    for el in elements:
        x, y = el.get("x", 0), el.get("y", 0)
        w, h = el.get("width", 100), el.get("height", 40)
        if el.get("type") == "text":
            resolved = PLACEHOLDER_RE.sub(lambda m: str(values.get(m.group(1), m.group(0))), el.get("text", ""))
            style = (
                f"left:{x}px;top:{y}px;width:{w}px;height:{h}px;"
                f"font-family:'{el.get('fontFamily', 'Arial')}',sans-serif;"
                f"font-size:{el.get('fontSize', 16)}px;"
                f"font-weight:{'700' if el.get('bold') else '400'};"
                f"color:{el.get('color', '#000000')};"
                f"text-align:{el.get('align', 'left')};"
            )
            parts.append(f'<div class="el" style="{style}">{esc(resolved)}</div>')
        elif el.get("type") == "image":
            style = f"left:{x}px;top:{y}px;width:{w}px;height:{h}px;"
            parts.append(f'<img class="el" style="{style}" src="{el.get("src", "")}">')
    parts.append("</div>")

    return (
        f'<!doctype html><html><head><meta charset="utf-8">{font_link}'
        f"<style>@page{{margin:0;size:{width}px {height}px;}}"
        f"*{{box-sizing:border-box;}}body{{margin:0;padding:0;}}"
        f".page{{position:relative;width:{width}px;height:{height}px;overflow:hidden;}}"
        f".el{{position:absolute;white-space:pre-wrap;overflow:hidden;}}"
        f"img.el{{object-fit:contain;}}</style></head>"
        f"<body>{''.join(parts)}</body></html>"
    )


def _merge_canvas_pdf(template, intern, field_values):
    """Renders a Design Editor template (template_format == 'HTML' — the
    DB's chk_document_template_format constraint only allows
    MARKDOWN/HTML/TEXT/DOCX and it's DA-owned so we can't add a literal
    'CANVAS' value; 'HTML' is the closest fit and was otherwise unused) —
    template_content is a JSON layout (page size + absolutely-positioned
    text/image elements) authored in the in-app canvas editor. Rendered
    via a real headless browser (Playwright/Chromium), not Word — fonts
    and images come out exactly as designed regardless of what's
    installed on this machine. Returns (pdf_bytes, error_response), same
    contract as _merge_intern_offer_pdf."""
    layout = json.loads(template.template_content)
    elements = layout.get("elements", [])

    all_text = "\n".join(el.get("text", "") for el in elements if el.get("type") == "text")
    placeholders = sorted(set(PLACEHOLDER_RE.findall(all_text)))

    known_values = _intern_offer_known_values(intern)
    values, missing = {}, []
    for key in placeholders:
        if key in known_values and known_values[key]:
            values[key] = known_values[key]
        elif key in field_values and field_values[key]:
            values[key] = field_values[key]
        else:
            missing.append(key)
    if missing:
        return None, Response({"detail": f"Missing values for: {', '.join(missing)}"}, status=400)

    html_str = _render_canvas_html(layout, values)
    width = layout.get("page", {}).get("width", 794)
    height = layout.get("page", {}).get("height", 1123)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page_obj = browser.new_page()
        page_obj.set_content(html_str, wait_until="networkidle")
        pdf_bytes = page_obj.pdf(width=f"{width}px", height=f"{height}px", print_background=True)
        browser.close()
    return pdf_bytes, None


def _merge_intern_offer_pdf(template, intern, field_values):
    """Design-preserving merge for an Intern (module_04_interns, read-only
    from here — that module is Haripriya's). Branches on the template's
    own format:
    - HTML (built in the in-app Design Editor) — see _merge_canvas_pdf.
    - DOCX — two modes, detected from the uploaded design itself:
      - It already has {{placeholders}} baked into its own body text (an
        older, fully-written template) — literal find/replace in-place,
        fonts/layout kept intact.
      - It's design-only (letterhead, no body placeholders) — the actual
        letter body comes from the Content step's field_values['letter_content'],
        with its own {{tags}} resolved against the same known values and
        inserted into the design (see _insert_content_body).
    Interns aren't Employee rows in this schema, so employee-shaped
    known_values (designation, joining_date) don't apply —
    recipient_name/date/course_name/course_duration_days/
    training_provider auto-fill from the intern's own enrollment record
    (see _intern_offer_known_values), everything else (role/duration/
    stipend/effective_date) is a manual field. Returns (pdf_bytes,
    error_response) — shared by the real save-and-generate path and the
    no-save preview."""
    if template.template_format == "HTML":
        return _merge_canvas_pdf(template, intern, field_values)

    docx_bytes = _raw_cloud_storage.open(template.template_content).read()
    doc = DocxDocument(io.BytesIO(docx_bytes))

    # doc.paragraphs only returns the body's direct paragraphs — table
    # cell text (e.g. the "To: {{recipient_name}}" / "Date: {{date}}"
    # header table) is invisible to it, so placeholders living in a
    # table were silently never detected or replaced (rendered out as
    # literal "{{recipient_name}}"/"{{date}}"). Replacement needs both;
    # mode detection stays body-only so a table's known fields don't get
    # mistaken for a body that has its own baked-in placeholders.
    table_paragraphs = [
        p for table in doc.tables for row in table.rows for cell in row.cells for p in cell.paragraphs
    ]
    all_paragraphs = list(doc.paragraphs) + table_paragraphs

    body_text = "\n".join(p.text for p in doc.paragraphs)
    body_placeholders = sorted(set(PLACEHOLDER_RE.findall(body_text)) - {"content"})

    known_values = {
        **_intern_offer_known_values(intern),
        # Fixed company branding — always the same, never a per-letter
        # field. The analyze-upload AI step re-derives placeholder names
        # from scratch on every upload and isn't consistent about what it
        # calls these (seen both "company_email" and "contact_email" for
        # the exact same file) — so several likely synonyms are covered
        # here rather than just one exact name.
        "company_name": "VETRI IT SYSTEMS PRIVATE LIMITED",
        "company_email": "hrteam@vetriitsystems.com",
        "contact_email": "hrteam@vetriitsystems.com",
        "hr_email": "hrteam@vetriitsystems.com",
        "company_website": "www.vetriitsystems.com",
        "corporate_id": "U62099TN2024PTC172387",
        "tan_no": "MRIV03584A",
        "tan_number": "MRIV03584A",
    }

    def apply_replacements(values):
        for paragraph in all_paragraphs:
            for run in paragraph.runs:
                for key, value in values.items():
                    if f"{{{{{key}}}}}" in run.text:
                        run.text = run.text.replace(f"{{{{{key}}}}}", str(value))

    letter_content = field_values.get("letter_content", "")

    # Per-generation manual fields (typed in the Offer Details step) — used
    # below both to satisfy any of these same placeholders baked directly
    # into the uploaded design's own header/body (not just the Content
    # step's text), and to resolve the Content step's own {{tags}}.
    values = dict(known_values)
    for key in ("role", "duration", "stipend", "effective_date", "department", "location"):
        if field_values.get(key):
            values[key] = field_values[key]

    if letter_content:
        # A Content step was actually written — treat this as a design-only
        # template regardless of any body placeholders (the analyze-upload
        # AI step often turns letterhead branding, e.g. company name/email,
        # into placeholders too, which used to be mistaken for "this is an
        # already fully-written body" and silently dropped the Content step
        # text entirely). Placeholders baked into the design itself (company
        # branding, or manual fields like role/department) resolve from
        # `values`; the letter body itself comes from the Content step.
        missing = [key for key in body_placeholders if not values.get(key)]
        if missing:
            return None, Response({"detail": f"Missing values for: {', '.join(missing)}"}, status=400)

        apply_replacements(values)

        resolved_html = re.sub(
            r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}",
            lambda m: str(values.get(m.group(1), m.group(0))),
            letter_content,
        )
        _insert_content_body(doc, resolved_html)
    elif body_placeholders:
        # No Content step text — this is an older, fully-written-body
        # template (its own baked-in placeholders, literal find/replace).
        final_values = {}
        missing = []
        for key in body_placeholders:
            if key in known_values and known_values[key]:
                final_values[key] = known_values[key]
            elif key in field_values and field_values[key]:
                final_values[key] = field_values[key]
            else:
                missing.append(key)

        if missing:
            return None, Response({"detail": f"Missing values for: {', '.join(missing)}"}, status=400)

        apply_replacements({**known_values, **final_values})
    else:
        apply_replacements(known_values)

    merged_buffer = io.BytesIO()
    doc.save(merged_buffer)
    pdf_bytes = convert_docx_to_pdf_bytes(merged_buffer.getvalue())
    return pdf_bytes, None


def _generate_intern_offer_document(template, intern, field_values, request_user):
    """Merges + saves a real Document/DocumentVersion (see
    _merge_intern_offer_pdf for the merge itself)."""
    person = intern.student.person
    pdf_bytes, error_response = _merge_intern_offer_pdf(template, intern, field_values)
    if error_response:
        return None, error_response

    with transaction.atomic():
        document = Document.objects.create(
            document_type_id=template.document_type_id or 7,
            confidentiality_level_id=3,
            access_level_id=3,
            document_code=f"GEN-{template.template_code}-INT{intern.intern_id}-{timezone.now().strftime('%Y%m%d%H%M%S')}",
            document_title=unique_document_title(f"{person} — {template.template_name}"),
            owner_user=request_user,
            created_by_user=request_user,
            current_version_number=1,
            status=DEFAULT_DOCUMENT_STATUS,
            is_confidential=True,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        filename = f"{document.document_title}.pdf"
        storage_name = save_document_file(document.document_id, 1, filename, pdf_bytes)

        DocumentVersion.objects.create(
            document=document,
            version_number=1,
            file_name=filename,
            file_extension="pdf",
            mime_type=PDF_MIME_TYPE,
            storage_provider="CLOUDINARY",
            storage_reference=storage_name,
            file_size_bytes=len(pdf_bytes),
            created_by_user=request_user,
            created_at=timezone.now(),
            is_current=True,
        )

        DocumentPerson.objects.create(
            document=document, person=person,
            relationship_type="SUBJECT", created_at=timezone.now(),
        )

        generation = AiDocumentGeneration.objects.create(
            document_template=template,
            generated_document=document,
            requested_by_user=request_user,
            generation_provider="mail-merge",
            generation_status="COMPLETED",
            requested_at=timezone.now(),
            completed_at=timezone.now(),
        )

    return {"generation_id": generation.ai_document_generation_id, "document_id": document.document_id}, None


def _generate_markdown_draft(template, employee, data, request_user):
    """AI-drafted path: resolves placeholders, asks Groq to draft around
    them, logs the attempt. Returns (result_dict, error_response) — same
    calling convention as _generate_docx_document."""
    placeholder_values = {
        "employee_name": str(employee.person),
        "recipient_name": str(employee.person),
        "designation": employee.designation.designation_name if employee.designation else "",
        "department": _current_department_name(employee.person_id) or "",
        "start_date": employee.joining_date.isoformat() if employee.joining_date else "",
        "stipend": data.get("stipend", ""),
    }

    filled_template = template.template_content or ""
    for key, value in placeholder_values.items():
        filled_template = filled_template.replace(f"{{{{{key}}}}}", str(value))

    instructions = (data.get("instructions") or "").strip()
    prompt = (
        "You are drafting an official HR document for VetriOS. "
        "Use the following content as the basis, keep all facts exactly as given, "
        "and produce clean, professional prose:\n\n"
        f"{filled_template}"
    )
    if instructions:
        prompt += f"\n\nAdditional instructions: {instructions}"

    generation = AiDocumentGeneration.objects.create(
        document_template=template,
        requested_by_user=request_user,
        generation_provider="groq",
        generation_model="openai/gpt-oss-120b",
        prompt_text=prompt,
        generation_status="REQUESTED",
        requested_at=timezone.now(),
    )

    try:
        draft_text = ask_groq(prompt)
    except Exception as exc:
        generation.generation_status = "FAILED"
        generation.error_message = str(exc)
        generation.completed_at = timezone.now()
        generation.save(update_fields=["generation_status", "error_message", "completed_at"])
        return None, Response({"detail": f"Generation failed: {exc}"}, status=502)

    generation.generation_status = "COMPLETED"
    generation.completed_at = timezone.now()
    generation.save(update_fields=["generation_status", "completed_at"])

    return {
        "generation": generation,
        "draft_text": draft_text,
        "placeholder_values": placeholder_values,
    }, None


def _markdown_draft_to_html(text):
    """Same conversion the frontend's textToHtml does — used when bulk
    generation auto-saves a markdown draft without a human reviewing/
    editing it in the rich text editor first."""
    import html as html_module
    paragraphs = re.split(r"\n\s*\n", text)
    parts = []
    for para in paragraphs:
        escaped = html_module.escape(para)
        with_bold = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
        parts.append(f"<p>{with_bold.replace(chr(10), '<br>')}</p>")
    return "".join(parts)


def _save_markdown_document(generation, employee, final_html, request_user):
    """Persists reviewed (or auto-approved, for bulk) HTML as a real PDF
    Document + DocumentVersion. Returns (result_dict, error_response)."""
    try:
        pdf_bytes = convert_html_to_pdf_bytes(final_html)
    except Exception as exc:
        return None, Response({"detail": f"Couldn't render the PDF: {exc}"}, status=502)

    extracted_text = re.sub(r"<[^>]+>", " ", final_html)

    with transaction.atomic():
        document = Document.objects.create(
            document_type_id=5,          # OFFER_LETTER
            document_category_id=1,      # HR
            confidentiality_level_id=3,  # RESTRICTED
            access_level_id=3,           # RESTRICTED
            document_code=f"GEN-{generation.ai_document_generation_id}-{employee.employee_id}",
            document_title=unique_document_title(f"{employee.person} — {generation.document_template.template_name}"),
            owner_user=request_user,
            created_by_user=request_user,
            current_version_number=1,
            status=DEFAULT_DOCUMENT_STATUS,
            is_confidential=True,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        filename = f"{document.document_title}.pdf"
        storage_name = save_document_file(document.document_id, 1, filename, pdf_bytes)

        DocumentVersion.objects.create(
            document=document,
            version_number=1,
            file_name=filename,
            file_extension="pdf",
            mime_type=PDF_MIME_TYPE,
            storage_provider="CLOUDINARY",
            storage_reference=storage_name,
            file_size_bytes=len(pdf_bytes),
            extracted_text=extracted_text,
            created_by_user=request_user,
            created_at=timezone.now(),
            is_current=True,
        )

        DocumentPerson.objects.create(
            document=document, person=employee.person,
            relationship_type="SUBJECT", created_at=timezone.now(),
        )

        generation.generated_document = document
        generation.save(update_fields=["generated_document"])

    return {"document_id": document.document_id}, None


class QuickGenerateDocumentView(APIView):
    """POST {description, file?} — the free-text "just tell us what you
    need" path: no template or employee picked first, Groq drafts
    straight from the description. An optional attached file (.txt,
    .pdf, or .docx — the paperclip in the prompt box) has its text
    pulled out and folded into the prompt as reference material (e.g. a
    sample letter to match the tone of, or a sheet of names/marks to
    turn into a document) — it's context for the draft, not a design to
    preserve, so no placeholders are extracted from it directly.
    Logged the same way as the template-driven path (document_template
    left null) so it still shows in generation history, but nothing is
    saved as a real Document — this only returns a draft to look at."""
    permission_classes = [CanCreateDocuments]

    def post(self, request):
        description = (request.data.get("description") or "").strip()
        if not description:
            return Response({"detail": "description is required."}, status=400)

        attachment_text = ""
        file_obj = request.FILES.get("file")
        if file_obj:
            try:
                if file_obj.name.lower().endswith(".docx"):
                    attachment_text = "\n".join(p.text for p in DocxDocument(file_obj).paragraphs)
                else:
                    attachment_text = extract_text_from_upload(file_obj)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)

        if attachment_text.strip():
            prompt = (
                "You are drafting a professional business document for VetriOS. "
                "Below is reference material from an attached file — pull the REAL names, dates, "
                "figures, and any other concrete details directly from it and write them into the "
                "document as-is (do not turn a detail into a {{placeholder}} if the reference "
                "already gives you the real value). Only use a {{snake_case_placeholder}} tag for "
                "something genuinely not covered by the reference or the request. Match the "
                "reference's tone where relevant. Write clean, complete, well-structured prose. "
                "Return ONLY the document text, no explanation.\n\n"
                f"Request: {description}\n\n"
                f"Reference material ({file_obj.name}):\n\n{attachment_text[:6000]}"
            )
        else:
            prompt = (
                "You are drafting a professional business document for VetriOS. "
                "Based on the request below, write clean, complete, well-structured prose "
                "(use {{snake_case_placeholder}} tags for any specific name, date, or figure "
                "you don't know). Return ONLY the document text, no explanation.\n\n"
                f"Request: {description}"
            )

        generation = AiDocumentGeneration.objects.create(
            requested_by_user=request.user,
            generation_provider="groq",
            generation_model="openai/gpt-oss-120b",
            prompt_text=prompt,
            generation_status="REQUESTED",
            requested_at=timezone.now(),
        )

        try:
            draft_text = ask_groq(prompt)
        except Exception as exc:
            generation.generation_status = "FAILED"
            generation.error_message = str(exc)
            generation.completed_at = timezone.now()
            generation.save(update_fields=["generation_status", "error_message", "completed_at"])
            return Response({"detail": f"Generation failed: {exc}"}, status=502)

        generation.generation_status = "COMPLETED"
        generation.completed_at = timezone.now()
        generation.save(update_fields=["generation_status", "completed_at"])

        return Response({
            "generation_id": generation.ai_document_generation_id,
            "draft_text": draft_text,
        })


class InternListView(APIView):
    """GET — every intern (module_04_interns' Intern table, read-only
    from here), for the Course Integrated Internship Offer Letter
    page's auto-loaded name picker — including which course/batch they
    came from (their most recent Enrollment, module_03_training, also
    read-only from here). Interns/Training/Students are Haripriya's
    module, not edited here. System Administrator/HR Administrator
    only — these two document types stay admin/HR-only even though
    Employee and Intern both carry DOCUMENT_CREATE."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def get(self, request):
        interns = Intern.objects.select_related("student__person").order_by("-internship_start_date")
        results = []
        for i in interns:
            enrollment = (
                Enrollment.objects.filter(student_id=i.student_id)
                .select_related("course", "batch")
                .order_by("-enrollment_date")
                .first()
            )
            results.append({
                "intern_id": i.intern_id,
                "intern_code": i.intern_code,
                "full_name": f"{i.student.person.first_name} {i.student.person.last_name or ''}".strip(),
                "status": i.status,
                "internship_start_date": i.internship_start_date,
                "internship_end_date": i.internship_end_date,
                "course_name": enrollment.course.course_name if enrollment else None,
                "batch_name": enrollment.batch.batch_name if enrollment else None,
                "batch_start_date": enrollment.batch.start_date if enrollment else None,
                "batch_end_date": enrollment.batch.end_date if enrollment else None,
            })
        return Response(results)


class GenerateInternOfferLetterView(APIView):
    """POST {template_id, intern_id, field_values} — the Course
    Integrated Internship Offer Letter page's dedicated generate
    action. Always a design-preserving DOCX merge (this document type
    only exists as that one real template), saved immediately.
    System Administrator/HR Administrator only — see InternListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def post(self, request):
        template_id = request.data.get("template_id")
        intern_id = request.data.get("intern_id")
        if not template_id or not intern_id:
            return Response({"detail": "template_id and intern_id are required."}, status=400)

        try:
            template = DocumentTemplate.objects.get(pk=template_id)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=404)
        try:
            intern = Intern.objects.select_related("student__person").get(pk=intern_id)
        except Intern.DoesNotExist:
            return Response({"detail": "Intern not found."}, status=404)

        field_values = request.data.get("field_values", {})
        result, error_response = _generate_intern_offer_document(template, intern, field_values, request.user)
        if error_response:
            return error_response
        return Response(result)


class PreviewInternOfferLetterView(APIView):
    """POST {template_id, intern_id, field_values} — same merge as
    GenerateInternOfferLetterView but returns the rendered PDF directly
    and saves nothing, so the Course Integrated Internship Offer Letter
    page's Preview action can show the real letterhead design WITH the
    selected intern's real data merged in, without creating a Document
    every time someone just wants to look. System Administrator/HR
    Administrator only — see InternListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def post(self, request):
        template_id = request.data.get("template_id")
        intern_id = request.data.get("intern_id")
        if not template_id or not intern_id:
            return Response({"detail": "template_id and intern_id are required."}, status=400)

        try:
            template = DocumentTemplate.objects.get(pk=template_id)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=404)
        try:
            intern = Intern.objects.select_related("student__person").get(pk=intern_id)
        except Intern.DoesNotExist:
            return Response({"detail": "Intern not found."}, status=404)

        field_values = request.data.get("field_values", {})
        pdf_bytes, error_response = _merge_intern_offer_pdf(template, intern, field_values)
        if error_response:
            return error_response
        return HttpResponse(pdf_bytes, content_type="application/pdf")


class GenerateDocumentView(APIView):
    """Resolves an employee's real HR data into the chosen template's
    placeholders. DOCX-format templates (design-preserving, uploaded via
    Vetri Tool's "Upload Template") skip AI drafting entirely — it's a
    literal merge, saved immediately. MARKDOWN-format templates ask Groq
    to draft around them and return a draft for review (Save happens
    separately via SaveGeneratedDocumentView)."""
    permission_classes = [CanCreateDocuments]

    def post(self, request):
        serializer = GenerateDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        template = DocumentTemplate.objects.get(pk=data["template_id"])
        try:
            employee = Employee.objects.select_related("person", "designation").get(
                pk=data["employee_id"]
            )
        except Employee.DoesNotExist:
            return Response({"detail": "Employee not found."}, status=404)

        if template.template_format == "DOCX":
            result, error_response = _generate_docx_document(template, employee, data, request.user)
            if error_response:
                return error_response
            return Response({"mode": "docx", **result})

        result, error_response = _generate_markdown_draft(template, employee, data, request.user)
        if error_response:
            return error_response

        return Response({
            "mode": "markdown",
            "generation_id": result["generation"].ai_document_generation_id,
            "draft_text": result["draft_text"],
            "placeholder_values": result["placeholder_values"],
        })


class SaveGeneratedDocumentView(APIView):
    """Persists a reviewed draft as a real Document + DocumentVersion,
    linked back to the AiDocumentGeneration log row that produced it."""
    permission_classes = [CanCreateDocuments]

    def post(self, request, generation_id):
        try:
            generation = AiDocumentGeneration.objects.select_related("document_template").get(
                pk=generation_id
            )
        except AiDocumentGeneration.DoesNotExist:
            return Response({"detail": "Generation not found."}, status=404)

        if generation.generation_status != "COMPLETED":
            return Response({"detail": "Only a completed generation can be saved."}, status=400)

        final_html = request.data.get("final_html", "").strip()
        employee_id = request.data.get("employee_id")
        if not final_html:
            return Response({"detail": "final_html is required."}, status=400)
        if not employee_id:
            return Response({"detail": "employee_id is required."}, status=400)

        try:
            employee = Employee.objects.select_related("person").get(pk=employee_id)
        except Employee.DoesNotExist:
            return Response({"detail": "Employee not found."}, status=404)

        result, error_response = _save_markdown_document(generation, employee, final_html, request.user)
        if error_response:
            return error_response
        return Response(result, status=201)


class BulkGenerateDocumentView(APIView):
    """POST {template_id, employee_ids: [...], stipend, instructions,
    field_values} — generates + saves one document per employee, no
    individual review step (auto-approved), matching how the DOCX
    mail-merge path already works. Partial failure doesn't abort the
    batch — each employee gets their own success/error entry."""
    permission_classes = [CanCreateDocuments]

    def post(self, request):
        template_id = request.data.get("template_id")
        employee_ids = request.data.get("employee_ids") or []
        if not template_id or not employee_ids:
            return Response({"detail": "template_id and employee_ids are required."}, status=400)

        try:
            template = DocumentTemplate.objects.get(pk=template_id, is_active=True)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Unknown or inactive template."}, status=404)

        data = {
            "stipend": request.data.get("stipend", ""),
            "instructions": request.data.get("instructions", ""),
            "field_values": request.data.get("field_values", {}),
        }

        results = []
        for employee_id in employee_ids:
            try:
                employee = Employee.objects.select_related("person", "designation").get(pk=employee_id)
            except Employee.DoesNotExist:
                results.append({"employee_id": employee_id, "status": "failed", "error": "Employee not found."})
                continue

            if template.template_format == "DOCX":
                result, error_response = _generate_docx_document(template, employee, data, request.user)
            else:
                draft_result, error_response = _generate_markdown_draft(template, employee, data, request.user)
                if not error_response:
                    html_content = _markdown_draft_to_html(draft_result["draft_text"])
                    result, error_response = _save_markdown_document(
                        draft_result["generation"], employee, html_content, request.user,
                    )

            if error_response:
                results.append({
                    "employee_id": employee_id,
                    "employee_name": str(employee.person),
                    "status": "failed",
                    "error": error_response.data.get("detail", "Generation failed."),
                })
            else:
                results.append({
                    "employee_id": employee_id,
                    "employee_name": str(employee.person),
                    "status": "success",
                    "document_id": result["document_id"],
                })

        return Response({"results": results})


class GenerationLogListView(generics.ListAPIView):
    """Recent Vetri Tool generation attempts by the requesting user."""
    permission_classes = [CanViewDocuments]
    serializer_class = GenerationLogSerializer

    def get_queryset(self):
        return (
            AiDocumentGeneration.objects.filter(requested_by_user=self.request.user)
            .select_related("document_template")
            .order_by("-requested_at")[:10]
        )


STATUS_CHOICES = ["DRAFT", "ACTIVE", "UNDER_REVIEW", "APPROVED", "ARCHIVED", "RETIRED", "DELETED"]

# Cloudinary is shared across every machine on the team (unlike local disk),
# so new Library/Vetri-Tool uploads go here instead of MEDIA_ROOT. Existing
# certificate uploads (storage_provider='LOCAL') are left as-is — that's a
# separate migration, not something to silently rewrite here.
_raw_cloud_storage = RawMediaCloudinaryStorage()


def save_document_file(document_id, version_number, filename, content_bytes):
    """Uploads to Cloudinary and returns the storage name (stored as
    DocumentVersion.storage_reference)."""
    path = f"documents/{document_id}/v{version_number}/{filename}"
    return _raw_cloud_storage.save(path, ContentFile(content_bytes))


PDF_MIME_TYPE = "application/pdf"

HTML_PDF_WRAPPER = """<html><head><style>
body {{ font-family: Helvetica, Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #161a26; }}
h2 {{ font-size: 15pt; margin: 0.6em 0 0.3em; }}
p {{ margin: 0 0 0.8em; }}
ul, ol {{ margin: 0 0 0.8em; padding-left: 22px; }}
</style></head><body>{body}</body></html>"""


def convert_html_to_pdf_bytes(html_content):
    """Renders the rich-text editor's HTML (bold/italic/headings/lists)
    into a real PDF — used for the AI-drafted (MARKDOWN template) save
    path, so formatting applied in the editor survives into the file."""
    buffer = io.BytesIO()
    result = pisa.CreatePDF(HTML_PDF_WRAPPER.format(body=html_content), dest=buffer)
    if result.err:
        raise RuntimeError("Couldn't render the draft to PDF.")
    return buffer.getvalue()


def convert_docx_to_pdf_bytes(docx_bytes):
    """Converts a merged .docx to PDF via Word (docx2pdf/COM automation)
    — used for the design-preserving DOCX mail-merge path, since that's
    the only way to get pixel-exact fidelity from the original design.
    Windows + Word only; needs real files on disk (COM can't work off
    in-memory streams), hence the temp files.

    Django's dev server handles requests on a thread pool, and COM
    requires each thread that touches it to initialize its own apartment
    first — without this, docx2pdf works fine from a plain script
    (single default thread) but fails when called from a request thread
    that's never called CoInitialize()."""
    if docx2pdf_convert is None:
        raise RuntimeError(
            "DOCX-to-PDF conversion needs Word (Windows only) and isn't "
            "available on this server."
        )
    import pythoncom
    pythoncom.CoInitialize()
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            docx_path = os.path.join(tmp_dir, "source.docx")
            pdf_path = os.path.join(tmp_dir, "source.pdf")
            with open(docx_path, "wb") as f:
                f.write(docx_bytes)
            docx2pdf_convert(docx_path, pdf_path)
            with open(pdf_path, "rb") as f:
                return f.read()
    finally:
        pythoncom.CoUninitialize()


def unique_document_title(base_title):
    """Same template + same employee generated twice would otherwise
    produce two documents with the identical title. First collision adds
    the current year; further collisions add a running (2), (3), ..."""
    if not Document.objects.filter(document_title=base_title).exists():
        return base_title

    year = timezone.now().year
    with_year = f"{base_title} {year}"
    if not Document.objects.filter(document_title=with_year).exists():
        return with_year

    n = 2
    while Document.objects.filter(document_title=f"{with_year} ({n})").exists():
        n += 1
    return f"{with_year} ({n})"


def unique_template_name(base_name):
    """Same pattern as unique_document_title — two templates named
    identically is confusing in the picker, so the second one gets the
    current year appended, then a running (2), (3), ..."""
    if not DocumentTemplate.objects.filter(template_name=base_name).exists():
        return base_name

    year = timezone.now().year
    with_year = f"{base_name} {year}"
    if not DocumentTemplate.objects.filter(template_name=with_year).exists():
        return with_year

    n = 2
    while DocumentTemplate.objects.filter(template_name=f"{with_year} ({n})").exists():
        n += 1
    return f"{with_year} ({n})"


# Real document_category_id values (seeded by the DA team):
#   1=Human Resources, 2=Employee Documents, 3=Training Documents,
#   4=Project Documents, 5=Finance Documents, 6=Policies
# Which categories each role may browse in the Library. A role not listed
# here (or "System Administrator") sees every category — no restriction.
# Finance Documents is deliberately unassigned to any role below, per the
# user's decision — nobody but System Administrator sees it for now.
ROLE_CATEGORY_ACCESS = {
    "HR Administrator": [1, 2, 6],
    "Business Team": [3, 4, 6],
    "Employee": [2, 6],
    "Project Manager": [4, 6],
    "Intern": [2, 6],
    "Viewer": [6],
    "Student": [],
}


def _allowed_category_ids(user):
    """None means unrestricted (System Administrator, or any role not in
    the map). Otherwise the union of categories across all the user's
    active roles."""
    role_names = user.active_role_names()
    if "System Administrator" in role_names:
        return None

    allowed = set()
    saw_mapped_role = False
    for role_name in role_names:
        if role_name in ROLE_CATEGORY_ACCESS:
            saw_mapped_role = True
            allowed.update(ROLE_CATEGORY_ACCESS[role_name])

    # A role with no entry in the map at all (not even an empty list) is
    # unrestricted, so only apply the filter once we've actually matched
    # at least one mapped role.
    return allowed if saw_mapped_role else None


def _user_can_access_document(user, document):
    """Same rule DocumentListView filters the Library by, applied to one
    document — used by DocumentFileView so a restricted document can't
    just be opened by guessing its ID once it's been filtered out of the
    list. True for: unrestricted roles/System Administrator, a category
    the user's role already covers, or a live DocumentAccessRule grant
    (e.g. from an approved "Request access" ticket)."""
    allowed_categories = _allowed_category_ids(user)
    if allowed_categories is None:
        return True
    if document.document_category_id in allowed_categories:
        return True
    today = timezone.localdate()
    return DocumentAccessRule.objects.filter(
        document=document, user=user, is_allowed=True, effective_from__lte=today,
    ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=today)).exists()


class DocumentListView(generics.ListAPIView):
    """Document Library — every real Document row, with search + filters."""
    permission_classes = [CanViewDocuments]
    serializer_class = DocumentListSerializer

    def get_queryset(self):
        qs = Document.objects.select_related(
            "document_type", "document_category", "confidentiality_level", "owner_user__person",
        ).order_by("-updated_at")

        allowed_categories = _allowed_category_ids(self.request.user)
        if allowed_categories is not None:
            # Category access via role is the coarse default; a specific
            # DocumentAccessRule (e.g. granted through an approved
            # "Request access" ticket for one document) additionally
            # surfaces that one document even outside the user's normal
            # categories.
            today = timezone.localdate()
            granted_ids = DocumentAccessRule.objects.filter(
                user=self.request.user, is_allowed=True, effective_from__lte=today,
            ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=today)).values_list("document_id", flat=True)
            qs = qs.filter(Q(document_category_id__in=allowed_categories) | Q(document_id__in=granted_ids))

        params = self.request.query_params
        search = params.get("search")
        if search:
            qs = qs.filter(document_title__icontains=search)
        for param, field in (
            ("type", "document_type_id"),
            ("category", "document_category_id"),
            ("confidentiality", "confidentiality_level_id"),
            ("owner", "owner_user_id"),
        ):
            value = params.get(param)
            if value:
                qs = qs.filter(**{field: value})
        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


def _library_daily_counts(queryset, date_field, days):
    """Same zero-filled daily bucketing pattern used across the other
    module dashboards — duplicated locally rather than imported
    cross-module."""
    today = timezone.localdate()
    start = today - timezone.timedelta(days=days - 1)
    counts = {
        row["day"]: row["count"]
        for row in queryset.filter(**{f"{date_field}__date__gte": start})
        .annotate(day=TruncDate(date_field))
        .values("day")
        .annotate(count=Count("pk"))
    }
    return [
        {"date": (start + timezone.timedelta(days=i)).isoformat(), "count": counts.get(start + timezone.timedelta(days=i), 0)}
        for i in range(days)
    ]


class LibraryStatsView(APIView):
    """GET — KPIs and charts for the dashboard header above the Library
    table. Scoped the same way the Library list itself is (category
    access via role, plus any per-document DocumentAccessRule grant) so
    the numbers never reveal more than the user could actually see."""
    permission_classes = [CanViewDocuments]

    def get(self, request):
        qs = Document.objects.all()
        allowed_categories = _allowed_category_ids(request.user)
        if allowed_categories is not None:
            today = timezone.localdate()
            granted_ids = DocumentAccessRule.objects.filter(
                user=request.user, is_allowed=True, effective_from__lte=today,
            ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=today)).values_list("document_id", flat=True)
            qs = qs.filter(Q(document_category_id__in=allowed_categories) | Q(document_id__in=granted_ids))

        total = qs.count()
        active = qs.filter(status="ACTIVE").count()
        pending_review = qs.filter(status="UNDER_REVIEW").count()
        confidential = qs.filter(confidentiality_level__level_name__in=["Confidential", "Highly Confidential"]).count()

        category_rows = (
            qs.values("document_category__category_name")
            .annotate(count=Count("document_id"))
            .order_by("-count")
        )
        by_category = [
            {"category_name": row["document_category__category_name"] or "Uncategorized", "count": row["count"]}
            for row in category_rows
        ]

        uploads_trend = _library_daily_counts(qs, "created_at", 14)

        return Response({
            "total": total,
            "active": active,
            "pending_review": pending_review,
            "confidential": confidential,
            "by_category": by_category,
            "uploads_trend": uploads_trend,
        })


class DocumentFilterOptionsView(APIView):
    """Populates the Library filter dropdowns from real data."""
    permission_classes = [CanViewDocuments]

    def get(self, request):
        owner_docs = (
            Document.objects.exclude(owner_user__isnull=True)
            .select_related("owner_user__person")
            .order_by("owner_user_id")
            .distinct("owner_user_id")
        )
        owner_list = [{"user_id": d.owner_user_id, "name": str(d.owner_user.person)} for d in owner_docs]

        categories = DocumentCategory.objects.filter(is_active=True)
        allowed_categories = _allowed_category_ids(request.user)
        if allowed_categories is not None:
            categories = categories.filter(document_category_id__in=allowed_categories)

        return Response({
            "types": list(DocumentType.objects.filter(is_active=True).values("document_type_id", "type_name")),
            "categories": list(categories.values("document_category_id", "category_name")),
            "confidentiality_levels": list(
                ConfidentialityLevel.objects.filter(is_active=True).values("confidentiality_level_id", "level_name")
            ),
            "access_levels": list(AccessLevel.objects.filter(is_active=True).values("access_level_id", "access_name")),
            "statuses": STATUS_CHOICES,
            "owners": owner_list,
        })


class DocumentSearchForAccessRequestView(APIView):
    """GET ?search= — a minimal document picker for the Identity & Access
    "Request access" flow's "a specific document" type. Deliberately open
    to ANY authenticated user (not gated by CanViewDocuments/category
    visibility) — the whole point is letting someone name a document
    they currently CAN'T see, so they can ask for access to it. Returns
    only display fields, never the file itself."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = (request.query_params.get("search") or "").strip()
        qs = Document.objects.select_related("confidentiality_level", "owner_user__person").order_by("-updated_at")
        if search:
            qs = qs.filter(document_title__icontains=search)
        qs = qs[:20]

        today = timezone.localdate()
        already_allowed_ids = set(
            DocumentAccessRule.objects.filter(
                user=request.user, is_allowed=True, effective_from__lte=today,
            ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=today))
            .values_list("document_id", flat=True)
        )

        return Response([
            {
                "document_id": d.document_id,
                "document_title": d.document_title,
                "confidentiality_level_name": d.confidentiality_level.level_name if d.confidentiality_level_id else None,
                "owner_name": str(d.owner_user.person) if d.owner_user_id else None,
                "already_has_access": d.document_id in already_allowed_ids,
            }
            for d in qs
        ])


class DocumentUploadView(APIView):
    """Upload a new document into the Library (POST, multipart)."""
    permission_classes = [CanCreateDocuments]

    def post(self, request):
        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        file_obj = data["file"]

        with transaction.atomic():
            document = Document.objects.create(
                document_type_id=data["document_type_id"],
                document_category_id=data.get("document_category_id"),
                confidentiality_level_id=data["confidentiality_level_id"],
                access_level_id=data["access_level_id"],
                document_code=f"DOC-{timezone.now().strftime('%Y%m%d%H%M%S%f')}",
                document_title=unique_document_title(data["title"]),
                owner_user=request.user,
                created_by_user=request.user,
                current_version_number=1,
                status="ACTIVE",
                is_confidential=data["confidentiality_level_id"] >= 3,
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )

            storage_name = save_document_file(
                document.document_id, 1, file_obj.name, file_obj.read(),
            )

            DocumentVersion.objects.create(
                document=document,
                version_number=1,
                file_name=file_obj.name,
                file_extension=os.path.splitext(file_obj.name)[1].lstrip("."),
                mime_type=file_obj.content_type,
                storage_provider="CLOUDINARY",
                storage_reference=storage_name,
                file_size_bytes=file_obj.size,
                created_by_user=request.user,
                created_at=timezone.now(),
                is_current=True,
            )

        return Response(DocumentListSerializer(document).data, status=201)


class DocumentFileView(APIView):
    """GET the current version's file — ?inline=1 to view in-browser,
    otherwise downloads as an attachment."""
    permission_classes = [CanViewDocuments]

    def get(self, request, document_id):
        try:
            document = Document.objects.get(pk=document_id)
        except Document.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        if not _user_can_access_document(request.user, document):
            return Response({"detail": "You don't have access to this document."}, status=403)

        version = document.versions.filter(is_current=True).first()
        if not version or not version.storage_reference:
            return Response({"detail": "No file on record."}, status=404)

        inline = request.query_params.get("inline") == "1"

        if version.storage_provider == "CLOUDINARY":
            url, _ = cloudinary.utils.cloudinary_url(
                version.storage_reference, resource_type="raw",
                flags=None if inline else "attachment",
            )
            return HttpResponseRedirect(url)

        # Legacy LOCAL uploads (e.g. Haripriya's certificate feature) — only
        # reachable from whichever machine originally received the file.
        file_path = os.path.join(settings.MEDIA_ROOT, version.storage_reference)
        if not os.path.exists(file_path):
            return Response({"detail": "File missing on disk. This document was uploaded on a different machine — Cloudinary migration pending."}, status=404)

        return FileResponse(
            open(file_path, "rb"),
            as_attachment=not inline,
            filename=version.file_name,
            content_type=version.mime_type or None,
        )


class DocumentBulkExportView(APIView):
    """POST {document_ids: [...]} -> a zip of every current-version file."""
    permission_classes = [CanViewDocuments]

    def post(self, request):
        document_ids = request.data.get("document_ids") or []
        if not document_ids:
            return Response({"detail": "document_ids is required."}, status=400)

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for doc in Document.objects.filter(pk__in=document_ids):
                version = doc.versions.filter(is_current=True).first()
                if not version or not version.storage_reference:
                    continue
                arcname = version.file_name or f"{doc.document_code}.bin"

                if version.storage_provider == "CLOUDINARY":
                    try:
                        content = _raw_cloud_storage.open(version.storage_reference).read()
                    except Exception:
                        continue
                    zf.writestr(arcname, content)
                else:
                    file_path = os.path.join(settings.MEDIA_ROOT, version.storage_reference)
                    if not os.path.exists(file_path):
                        continue
                    zf.write(file_path, arcname=arcname)

        buffer.seek(0)
        response = FileResponse(buffer, as_attachment=True, filename="documents.zip", content_type="application/zip")
        return response


def extract_text_from_upload(file_obj):
    """Pulls plain text out of a .txt/.pdf upload. Raises ValueError
    for anything else. (.docx goes through the design-preserving path in
    TemplateAnalyzeUploadView instead — see analyze_docx_upload.)"""
    name = file_obj.name.lower()
    if name.endswith(".txt"):
        return file_obj.read().decode("utf-8", errors="ignore")
    if name.endswith(".pdf"):
        reader = pypdf.PdfReader(file_obj)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    raise ValueError("Only .txt, .docx, and .pdf files are supported.")


NUMBERED_LINE_RE = re.compile(r"^\s*(\d+)\s*:\s?(.*)$")
PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def analyze_docx_upload(file_obj):
    """Design-preserving template creation: edits the {{placeholder}}
    text directly into the original docx's existing formatted runs
    (instead of extracting to plain text), so fonts/bold/letterhead/etc.
    survive untouched. Tables aren't handled — only body paragraphs.

    Returns (storage_name, placeholders, hints).
    """
    doc = DocxDocument(file_obj)
    paragraphs = doc.paragraphs
    original_lines = [p.text for p in paragraphs]

    numbered_input = "\n".join(f"{i + 1}: {line}" for i, line in enumerate(original_lines))
    prompt = (
        "You are converting a real, filled-in sample letter into a reusable template.\n\n"
        "Below is the letter, one paragraph per line, numbered. For each line, rewrite it "
        "so every variable, person-specific, or date-specific piece of text is replaced "
        "with a {{snake_case_placeholder}} tag (e.g. {{employee_name}}, {{designation}}, "
        "{{department}}, {{start_date}}, {{stipend}}). Keep all boilerplate wording exactly "
        "as written. If a line has nothing variable, return it completely unchanged.\n\n"
        "Respond in EXACTLY this format and nothing else:\n\n"
        "===TEMPLATE===\n"
        "1: <templated line 1>\n"
        "2: <templated line 2>\n"
        "...(one line per input line, same count, same order)\n\n"
        "===HINTS===\n"
        '{"placeholder_name": "short hint describing what to enter, e.g. '
        '\'Full legal name of the employee\'", ...}\n'
        "(one entry per distinct placeholder used above; hints object only, no extra text)\n\n"
        "Here is the letter:\n\n" + numbered_input
    )

    response = ask_groq(prompt, max_tokens=2000)

    template_section = response
    hints = {}
    if "===HINTS===" in response:
        template_section, hints_section = response.split("===HINTS===", 1)
        try:
            match = re.search(r"\{.*\}", hints_section, re.DOTALL)
            hints = json.loads(match.group(0)) if match else {}
        except (ValueError, AttributeError):
            hints = {}

    # Fallback if Groq's response is missing a line: leave it unchanged.
    templated_lines = {i: line for i, line in enumerate(original_lines, start=1)}
    for line in template_section.splitlines():
        m = NUMBERED_LINE_RE.match(line)
        if m:
            templated_lines[int(m.group(1))] = m.group(2)

    for i, paragraph in enumerate(paragraphs, start=1):
        new_text = templated_lines.get(i, original_lines[i - 1])
        if new_text == original_lines[i - 1] or not paragraph.runs:
            continue
        # A run can carry an embedded/floating image or text box instead of
        # text — e.g. a logo sharing a paragraph with the company name.
        # Setting .text on such a run wipes it entirely (its text setter
        # clears all child content), silently destroying the image. The
        # <w:drawing> is often nested several levels deep (inside
        # mc:AlternateContent/mc:Choice for Word's compatibility markup),
        # so a plain direct-children findall misses it — search all
        # descendants instead. Only genuinely text-only runs are
        # rewritten/cleared; drawing/text-box runs are left untouched
        # wherever they fall in the paragraph.
        text_runs = [r for r in paragraph.runs if r._element.find(f".//{qn('w:drawing')}") is None]
        if not text_runs:
            continue
        text_runs[0].text = new_text
        for run in text_runs[1:]:
            run.text = ""

    all_text = "\n".join(p.text for p in doc.paragraphs)
    placeholders = sorted(set(PLACEHOLDER_RE.findall(all_text)))
    hints = {k: v for k, v in hints.items() if k in placeholders}

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    storage_name = _raw_cloud_storage.save(
        f"templates/{file_obj.name}", ContentFile(buffer.read()),
    )

    return storage_name, placeholders, hints


def build_plain_docx(text):
    """.txt/.pdf uploads have no design to preserve, but templates are
    still stored as real Word documents (not raw text) — every template
    in the system is DOCX or PDF, never a plain-text/markdown blob.
    Builds a simple paragraph-per-line .docx and uploads it, reusing the
    same DOCX storage pipeline as a design-preserving upload.

    Returns storage_name.
    """
    doc = DocxDocument()
    for block in re.split(r"\n\s*\n", text.strip()):
        block = block.strip()
        if block:
            doc.add_paragraph(block)

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    filename = f"templates/converted-{int(timezone.now().timestamp())}.docx"
    return _raw_cloud_storage.save(filename, ContentFile(buffer.read()))


class TemplateAnalyzeUploadView(APIView):
    """POST a sample letter (.txt/.docx/.pdf) — extracts its text, asks
    Groq to rewrite the variable parts (names, dates, designations, etc.)
    as {{placeholder}} tags, and returns the result for review. Nothing
    is saved as a template yet — that's a separate POST to
    /templates/create/ once the user has reviewed/edited the result.

    Every template ends up stored as DOCX — a .docx upload goes through
    the design-preserving path (original formatting kept intact); a
    .txt/.pdf upload has no design to preserve, so its templatized text
    is wrapped into a plain .docx instead (see build_plain_docx). There's
    no plain-text/markdown template format — only Word (DOCX) or the
    final generated PDF. System Administrator/HR Administrator only —
    see DocumentTemplateListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "file is required."}, status=400)

        if file_obj.name.lower().endswith(".docx"):
            try:
                storage_name, placeholders, hints = analyze_docx_upload(file_obj)
            except Exception as exc:
                return Response({"detail": f"Analysis failed: {exc}"}, status=502)

            return Response({
                "template_format": "DOCX",
                "template_content": storage_name,
                "placeholders": placeholders,
                "placeholder_hints": hints,
                "source_filename": file_obj.name,
            })

        try:
            raw_text = extract_text_from_upload(file_obj)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        if not raw_text.strip():
            return Response({"detail": "Couldn't read any text out of that file."}, status=400)

        prompt = (
            "Below is a real, filled-in sample letter. Turn it into a reusable "
            "template by replacing every variable, person-specific, or "
            "date-specific piece of text with a {{snake_case_placeholder}} tag "
            "(e.g. {{employee_name}}, {{designation}}, {{department}}, "
            "{{start_date}}, {{stipend}}). Keep all the boilerplate wording "
            "exactly as written. Return ONLY the templated letter text, no "
            "explanation.\n\n---\n\n" + raw_text
        )

        try:
            template_content = ask_groq(prompt, max_tokens=1500)
        except Exception as exc:
            return Response({"detail": f"Analysis failed: {exc}"}, status=502)

        placeholders = sorted(set(re.findall(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", template_content)))
        storage_name = build_plain_docx(template_content)

        return Response({
            "template_format": "DOCX",
            "template_content": storage_name,
            "placeholders": placeholders,
            "placeholder_hints": {},
            "source_filename": file_obj.name,
        })


class TemplatePreviewView(APIView):
    """GET ?content=<storage path> — renders a DOCX-format template's
    stored file as a real PDF, so the create-template page can show the
    actual design (fonts/letterhead/layout) instead of just a text
    summary. Used for both an uploaded sample and an AI-generated one,
    since both land in the same DOCX storage pipeline. System
    Administrator/HR Administrator only — see DocumentTemplateListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def get(self, request):
        storage_name = request.query_params.get("content")
        if not storage_name:
            return Response({"detail": "content is required."}, status=400)

        try:
            docx_bytes = _raw_cloud_storage.open(storage_name).read()
            pdf_bytes = convert_docx_to_pdf_bytes(docx_bytes)
        except Exception as exc:
            return Response({"detail": f"Preview failed: {exc}"}, status=502)

        return HttpResponse(pdf_bytes, content_type="application/pdf")


class DocumentTemplateManageListView(generics.ListAPIView):
    """Template Manager — every template, active and inactive. System
    Administrator/HR Administrator only — see DocumentTemplateListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]
    serializer_class = DocumentTemplateSerializer
    queryset = DocumentTemplate.objects.all().order_by("template_name")


class DocumentTemplateCreateView(APIView):
    """POST — create a new document template. System Administrator/HR
    Administrator only — see DocumentTemplateListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def post(self, request):
        serializer = DocumentTemplateCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save(
            template_name=unique_template_name(serializer.validated_data["template_name"]),
            version_number=1,
            is_active=True,
            created_by_user=request.user,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        return Response(DocumentTemplateSerializer(template).data, status=201)


class DocumentTemplateDetailView(APIView):
    """GET/PUT a single template — powers the view-and-edit page reached
    by clicking a template card. DOCX-format templates keep their design
    (template_content is a Cloudinary path, not editable text here) —
    only the name/code/type can change; MARKDOWN templates can also have
    their body text edited. System Administrator/HR Administrator
    only — see DocumentTemplateListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def get(self, request, template_id):
        try:
            template = DocumentTemplate.objects.get(pk=template_id)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=404)
        return Response(DocumentTemplateSerializer(template).data)

    def put(self, request, template_id):
        try:
            template = DocumentTemplate.objects.get(pk=template_id)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=404)

        template.template_code = (request.data.get("template_code") or template.template_code).upper().replace(" ", "_")
        template.template_name = request.data.get("template_name") or template.template_name
        template.document_type_id = request.data.get("document_type_id") or None
        if template.template_format != "DOCX" and "template_content" in request.data:
            template.template_content = request.data["template_content"]
        template.updated_at = timezone.now()
        template.save(update_fields=["template_code", "template_name", "document_type_id", "template_content", "updated_at"])
        return Response(DocumentTemplateSerializer(template).data)


class DocumentTemplateToggleView(APIView):
    """PATCH — flip a template's is_active flag. System
    Administrator/HR Administrator only — see DocumentTemplateListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def patch(self, request, template_id):
        try:
            template = DocumentTemplate.objects.get(pk=template_id)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=404)
        template.is_active = not template.is_active
        template.updated_at = timezone.now()
        template.save(update_fields=["is_active", "updated_at"])
        return Response(DocumentTemplateSerializer(template).data)


class DocumentTemplateDownloadView(APIView):
    """GET — download a template as a real .docx attachment, for the
    Template Manager's "Download as DOCX" action. A DOCX-format template
    is served byte-identical to its stored file; any other format's
    template_content (plain {{placeholder}} text) is wrapped into a
    paragraph-per-line .docx on the fly — built in memory, not saved to
    storage, so a download never leaves a side effect behind. System
    Administrator/HR Administrator only — see DocumentTemplateListView."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def get(self, request, template_id):
        try:
            template = DocumentTemplate.objects.get(pk=template_id)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=404)

        if template.template_format == "DOCX":
            try:
                docx_bytes = _raw_cloud_storage.open(template.template_content).read()
            except Exception as exc:
                return Response({"detail": f"Download failed: {exc}"}, status=502)
        else:
            doc = DocxDocument()
            for block in re.split(r"\n\s*\n", (template.template_content or "").strip()):
                block = block.strip()
                if block:
                    doc.add_paragraph(block)
            buffer = io.BytesIO()
            doc.save(buffer)
            docx_bytes = buffer.getvalue()

        response = HttpResponse(
            docx_bytes,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{template.template_code}.docx"'
        return response


class DocumentTemplateHardDeleteView(APIView):
    """DELETE — permanently remove a template row. System
    Administrator/HR Administrator only — see DocumentTemplateListView.
    AiDocumentGeneration.document_template is DO_NOTHING (no DB
    cascade), so any log rows pointing at this template are detached
    first, in the same transaction, before the row itself is removed."""
    permission_classes = [CanCreateDocuments, IsSystemAdminOrHR]

    def delete(self, request, template_id):
        try:
            template = DocumentTemplate.objects.get(pk=template_id)
        except DocumentTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=404)

        with transaction.atomic():
            AiDocumentGeneration.objects.filter(document_template_id=template_id).update(document_template=None)
            template.delete()
        return Response(status=204)


def _access_rule_recipients(rule):
    """Who a grant/revoke on this rule should notify — resolves the
    rule's single scope (exactly one of role/department/user is set,
    DB-enforced) down to actual UserAccount rows."""
    if rule.user_id:
        return UserAccount.objects.filter(pk=rule.user_id)
    if rule.role_id:
        user_ids = UserRole.objects.filter(role_id=rule.role_id, is_active=True).values_list("user_id", flat=True)
        return UserAccount.objects.filter(pk__in=user_ids)
    if rule.department_id:
        person_ids = PersonDepartmentHistory.objects.filter(
            department_id=rule.department_id, is_current=True,
        ).values_list("person_id", flat=True)
        return UserAccount.objects.filter(person_id__in=person_ids)
    return UserAccount.objects.none()


def _notify_access_rule_change(rule, document, verb):
    for recipient in _access_rule_recipients(rule):
        notify(
            recipient=recipient,
            module="DOCUMENTS",
            notification_type=f"ACCESS_{verb.upper()}",
            title=f'Your access to "{document.document_title}" was {verb}',
            message=f"Access level: {rule.access_level.access_name}." if verb == "granted" else "",
            link="/documents",
            entity_type="document",
            entity_id=document.document_id,
        )


class DocumentAccessRuleListCreateView(APIView):
    """Governance (per-document): GET a document's access rules, POST a new one."""
    permission_classes = [CanViewDocuments]

    def get(self, request, document_id):
        rules = DocumentAccessRule.objects.filter(document_id=document_id).select_related(
            "role", "department", "user__person", "access_level",
        ).order_by("-created_at")
        return Response(DocumentAccessRuleSerializer(rules, many=True).data)

    def post(self, request, document_id):
        if not request.user.has_permission("DOCUMENT_UPDATE"):
            return Response({"detail": "DOCUMENT_UPDATE permission required."}, status=403)
        try:
            document = Document.objects.get(pk=document_id)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=404)

        serializer = DocumentAccessRuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(document_id=document_id, created_at=timezone.now())
        if rule.is_allowed:
            _notify_access_rule_change(rule, document, "granted")
        return Response(DocumentAccessRuleSerializer(rule).data, status=201)


class DocumentAccessRuleDeleteView(APIView):
    """DELETE one access rule. If this rule was granted by an approved
    Request Access ticket (see PermissionRequestDecideView), flip that
    ticket to REVOKED first — otherwise its history would keep showing
    "Approved" even though the access was just pulled here. Also
    notifies whoever the rule covered (user/role/department) that
    their access to this document was just pulled."""
    permission_classes = [CanCreateDocuments]

    def delete(self, request, document_id, rule_id):
        PermissionRequest.objects.filter(
            granted_rule_id=rule_id, status="APPROVED",
        ).update(status="REVOKED", decided_at=timezone.now())

        try:
            rule = DocumentAccessRule.objects.select_related("document").get(pk=rule_id, document_id=document_id)
        except DocumentAccessRule.DoesNotExist:
            return Response({"detail": "Rule not found."}, status=404)

        document = rule.document
        if rule.is_allowed:
            _notify_access_rule_change(rule, document, "revoked")
        rule.delete()
        return Response(status=204)


class DocumentRetentionView(APIView):
    """Governance (per-document): GET/PUT the one retention row per document."""
    permission_classes = [CanViewDocuments]

    def get(self, request, document_id):
        retention = DocumentRetention.objects.filter(document_id=document_id).first()
        if not retention:
            return Response(None)
        return Response(DocumentRetentionSerializer(retention).data)

    def put(self, request, document_id):
        if not request.user.has_permission("DOCUMENT_UPDATE"):
            return Response({"detail": "DOCUMENT_UPDATE permission required."}, status=403)
        try:
            Document.objects.get(pk=document_id)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=404)

        retention = DocumentRetention.objects.filter(document_id=document_id).first()
        serializer = DocumentRetentionSerializer(instance=retention, data=request.data)
        serializer.is_valid(raise_exception=True)
        if retention:
            serializer.save(updated_at=timezone.now())
        else:
            serializer.save(document_id=document_id, created_at=timezone.now(), updated_at=timezone.now())
        return Response(serializer.data)


class AllStudentsListView(APIView):
    """Feeds the Business Team 'All Students' sidebar page — every
    student record, regardless of batch/enrollment status."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _can_view_certificates(request.user):
            return Response({"detail": "Not authorized."}, status=403)

        students = Student.objects.select_related("person").order_by("person__first_name")
        return Response([
            {
                "person_id": s.person.person_id,
                "student_code": s.student_code,
                "name": f"{s.person.first_name} {s.person.last_name or ''}".strip(),
                "email": s.person.email,
                "phone": s.person.phone,
                "status": s.status,
            }
            for s in students
        ])