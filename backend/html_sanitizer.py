#!/usr/bin/env python3
"""HTML sanitization for the visual spam-detection renderer (issue #925).

The visual pipeline (``visual_detector.EmailRenderer``) renders attacker-
controlled email HTML in a headless browser before OCR/CNN analysis. Rendering
raw HTML lets the browser fetch whatever the markup references — external
images, stylesheets, iframes, and crucially internal/link-local addresses and
cloud-metadata endpoints (e.g. ``http://169.254.169.254/``) — which is a
Server-Side Request Forgery (SSRF) vector.

This module strips everything that could trigger an outbound fetch before the
HTML reaches the renderer, leaving only inline text/markup (and safe ``data:``
URIs) so the visual layout is preserved without any network access. It is the
first of two defence layers; the renderer also runs the browser with network
resolution disabled.
"""

import ipaddress
import re
import socket
from   urllib.parse             import urlparse

from   bs4                      import BeautifulSoup, Comment

__all__ = [
    "sanitize_html_for_rendering",
    "is_blocked_url",
    "neutralize_css",
]

# Tags dropped entirely: they execute code, embed remote documents, or pull in
# external subresources during rendering.
_DANGEROUS_TAGS = frozenset(
    {
        "script",
        "iframe",
        "frame",
        "frameset",
        "object",
        "embed",
        "applet",
        "portal",
        "link",
        "base",
        "meta",
        "audio",
        "video",
        "source",
        "track",
    }
)

# Attributes that carry a URL the browser would fetch.
_URL_ATTRS = frozenset(
    {
        "src",
        "href",
        "srcset",
        "poster",
        "background",
        "data",
        "action",
        "formaction",
        "xlink:href",
    }
)

# Cloud metadata / link-local hostnames that must never be requested.
_METADATA_HOSTS = frozenset(
    {
        "169.254.169.254",
        "metadata.google.internal",
        "metadata",
        "metadata.goog",
    }
)

# CSS constructs that fetch resources. The url() body is a single negated class
# (everything up to the closing paren); the optional quote flanks in the earlier
# form were subsumed by `[^)]*` and only added ambiguous backtracking, so they
# are dropped. Matching is unchanged: both forms consume `url(` through the first
# `)`.
_CSS_URL_RE = re.compile(r"url\s*\([^)]*\)", re.IGNORECASE)
_CSS_IMPORT_RE = re.compile(r"@import[^;]+;?", re.IGNORECASE)


def _ip_is_unsafe(ip_str):
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_unspecified
        or ip.is_multicast
    )


def _is_inline_uri(url):
    """True only for inline ``data:`` URIs, which carry their payload inline and
    trigger no network request. Used as the allow-list for resource attributes."""
    return isinstance(url, str) and url.strip().lower().startswith("data:")


def is_blocked_url(url):
    """Return True if fetching ``url`` during rendering would be unsafe.

    Blocks non-``http(s)`` schemes, relative/protocol-relative references,
    cloud-metadata hosts, and any host that resolves to a private, loopback,
    link-local, reserved, or otherwise non-public address. ``data:`` URIs are
    inline (no network) and are allowed.
    """
    if not url or not isinstance(url, str):
        return True

    candidate = url.strip()
    if not candidate:
        return True

    lowered = candidate.lower()
    if lowered.startswith("data:"):
        return False  # inline payload, no network fetch
    # Protocol-relative ("//host/…") and bare relative refs are treated as
    # external/unknown and blocked, since a slipped-through relative URL would
    # be fetched against the rendering origin.
    if lowered.startswith("//"):
        return True

    parsed = urlparse(candidate)
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        return True  # file:, ftp:, gopher:, javascript:, relative (no scheme), …

    host = (parsed.hostname or "").lower()
    if not host or host in _METADATA_HOSTS:
        return True

    # Literal IP host.
    if _ip_is_unsafe(host):
        return True

    # Hostname: resolve and reject if any address is non-public. Failure to
    # resolve is treated as unsafe (we can't prove it's safe).
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError, OSError):
        return True
    for info in infos:
        if _ip_is_unsafe(info[4][0]):
            return True

    return False


def neutralize_css(css):
    """Strip resource-loading constructs (``url(...)`` and ``@import``) from CSS
    while leaving the rest of the styling intact for visual fidelity."""
    if not css:
        return css
    css = _CSS_IMPORT_RE.sub("", css)
    css = _CSS_URL_RE.sub("url()", css)
    return css


def sanitize_html_for_rendering(html_content):
    """Return a copy of ``html_content`` safe to render offline.

    Removes script/embed/frame/meta/link tags, event handlers, and any URL
    attribute that would trigger an external (or private-range) fetch, and
    neutralizes CSS ``url()``/``@import``. Inline ``data:`` images are kept so
    the visual layout still renders without network access.
    """
    if not html_content:
        return html_content

    soup = BeautifulSoup(html_content, "html.parser")

    # Drop comments (can hide conditional-comment markup).
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        comment.extract()

    for tag in soup.find_all(True):
        if tag.name and tag.name.lower() in _DANGEROUS_TAGS:
            tag.decompose()
            continue

        for attr in list(tag.attrs.keys()):
            attr_lower = attr.lower()
            value = tag.attrs[attr]

            # Inline event handlers (onclick, onerror, onload, …).
            if attr_lower.startswith("on"):
                del tag.attrs[attr]
                continue

            # Neutralize inline styles that fetch resources.
            if attr_lower == "style":
                tag.attrs[attr] = neutralize_css(
                    value if isinstance(value, str) else " ".join(value)
                )
                continue

            if attr_lower in _URL_ATTRS:
                url_value = value if isinstance(value, str) else " ".join(value)
                # Offline-render policy: only inline data: URIs are allowed for
                # resource attributes. Every other reference (external, private,
                # link-local, metadata, protocol-relative, or relative) is
                # dropped so the browser has nothing external to fetch. srcset is
                # a comma-separated candidate list, kept only if every candidate
                # is inline.
                if attr_lower == "srcset":
                    candidates = [
                        c.strip().split()[0] for c in url_value.split(",") if c.strip()
                    ]
                    if not candidates or any(not _is_inline_uri(c) for c in candidates):
                        del tag.attrs[attr]
                    continue
                if not _is_inline_uri(url_value):
                    del tag.attrs[attr]

    # Neutralize <style> element contents.
    for style_tag in soup.find_all("style"):
        if style_tag.string:
            style_tag.string.replace_with(neutralize_css(style_tag.string))

    return str(soup)
