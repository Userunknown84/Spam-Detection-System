"""Tests for issue #925: the visual-detection HTML renderer must not be usable
as an SSRF vector. ``html_sanitizer`` strips anything that would cause the
headless browser to fetch a resource (external or, worse, private/link-local/
cloud-metadata) before the untrusted HTML is rendered."""

from   pathlib                  import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from   html_sanitizer           import (is_blocked_url, neutralize_css,
                                        sanitize_html_for_rendering)


class TestIsBlockedUrl:
    def test_blocks_cloud_metadata_endpoint(self):
        assert is_blocked_url("http://169.254.169.254/latest/meta-data/") is True
        assert is_blocked_url("http://metadata.google.internal/") is True

    def test_blocks_private_and_loopback_literals(self):
        assert is_blocked_url("http://127.0.0.1/admin") is True
        assert is_blocked_url("http://10.0.0.5/") is True
        assert is_blocked_url("http://192.168.1.1/") is True
        assert is_blocked_url("http://169.254.1.1/") is True  # link-local

    def test_blocks_non_http_schemes(self):
        assert is_blocked_url("file:///etc/passwd") is True
        assert is_blocked_url("ftp://example.com/x") is True
        assert is_blocked_url("javascript:alert(1)") is True

    def test_blocks_protocol_relative_and_relative(self):
        assert is_blocked_url("//evil.com/pixel.png") is True
        assert is_blocked_url("/local/path.png") is True

    def test_allows_inline_data_uri(self):
        assert is_blocked_url("data:image/png;base64,iVBORw0KGgo=") is False

    def test_allows_public_ip_literal(self):
        # A public literal IP needs no DNS and should not be blocked.
        assert is_blocked_url("http://8.8.8.8/pixel.png") is False


class TestSanitizeHtml:
    def test_removes_script_and_iframe(self):
        html = "<div>hi<script>fetch('http://169.254.169.254')</script>"
        html += "<iframe src='http://10.0.0.1'></iframe></div>"
        out = sanitize_html_for_rendering(html)
        assert "<script" not in out.lower()
        assert "<iframe" not in out.lower()
        assert "hi" in out

    def test_strips_external_image_but_keeps_data_uri(self):
        html = (
            '<img src="http://evil.com/track.png">'
            '<img src="data:image/png;base64,iVBORw0KGgo=">'
        )
        out = sanitize_html_for_rendering(html)
        assert "evil.com" not in out
        assert "data:image/png;base64" in out

    def test_strips_metadata_url_in_img(self):
        html = '<img src="http://169.254.169.254/latest/meta-data/">'
        out = sanitize_html_for_rendering(html)
        assert "169.254.169.254" not in out

    def test_removes_event_handlers(self):
        html = '<div onclick="steal()" onerror="x()">text</div>'
        out = sanitize_html_for_rendering(html)
        assert "onclick" not in out.lower()
        assert "onerror" not in out.lower()

    def test_removes_external_stylesheet_link(self):
        html = '<link rel="stylesheet" href="http://evil.com/x.css"><p>body</p>'
        out = sanitize_html_for_rendering(html)
        assert "<link" not in out.lower()
        assert "evil.com" not in out

    def test_neutralizes_css_url_and_import(self):
        css = "@import url('http://evil.com/a.css'); body{background:url(http://10.0.0.1/x.png);}"
        cleaned = neutralize_css(css)
        assert "evil.com" not in cleaned
        assert "10.0.0.1" not in cleaned
        assert "@import" not in cleaned

    def test_neutralizes_inline_style_background(self):
        html = '<div style="background:url(http://169.254.169.254/x)">hi</div>'
        out = sanitize_html_for_rendering(html)
        assert "169.254.169.254" not in out

    def test_preserves_visible_text_for_ocr(self):
        html = "<html><body><h1>FREE PRIZE</h1><p>Claim now</p></body></html>"
        out = sanitize_html_for_rendering(html)
        assert "FREE PRIZE" in out
        assert "Claim now" in out
