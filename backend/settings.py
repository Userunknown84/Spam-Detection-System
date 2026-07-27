"""Centralized, fail-fast configuration for the Flask ML API.

Historically the ML API read its configuration ad-hoc through scattered
``os.getenv(...)`` calls in ``api.py`` (and ``rate_limiting.py`` /
``domain_checker.py``). Misconfiguration therefore surfaced late and one error
at a time: a bad ``INTERNAL_SECRET`` failed at import, but a missing model file,
an out-of-range port or a ``FLASK_DEBUG``-on-a-public-interface combination only
blew up later — or silently fell back — so an operator learned about the second
problem only after fixing the first and restarting.

This module owns parsing, defaults and validation in one place. :func:`load_settings`
collects **every** problem it finds and raises a single :class:`ConfigError`
listing all of them, so the whole configuration can be fixed in one pass. The
resulting :class:`Settings` is a frozen, typed snapshot loaded once at startup.

``ConfigError`` subclasses :class:`RuntimeError` so the previous ad-hoc
``RuntimeError`` raised for a missing/short ``INTERNAL_SECRET`` (and the tests
that pin that behaviour) keep working unchanged.
"""

from __future__ import annotations

from   dataclasses              import dataclass
import os
from   pathlib                  import Path

__all__ = ["ConfigError", "Settings", "load_settings"]

# Model artifacts and this module live under backend/; a relative path in the
# environment is resolved against this directory, matching the historical
# resolve_path() lookup order in api.py.
BASE_DIR = Path(__file__).resolve().parent

# The shared Node/Flask secret is a real authentication credential, so a trivial
# value is rejected outright rather than merely warned about.
INTERNAL_SECRET_MIN_LENGTH = 32

# Interfaces on which Flask's interactive debugger is safe to expose. Enabling
# the debugger on anything else hands remote code execution to the network.
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

# Model-artifact env var -> filename used when the var is unset. Order is the
# load order in api.py and is preserved for deterministic error reporting.
_MODEL_ARTIFACTS = (
    ("MODEL_PATH", "linear_svm_model.pkl"),
    ("VECTORIZER_PATH", "tfidf_vectorizer.pkl"),
    ("LABEL_ENCODER_PATH", "label_encoder.pkl"),
    ("URL_MODEL_PATH", "url_detector.pkl"),
    ("URL_VECTORIZER_PATH", "url_vectorizer.pkl"),
)

_MAX_PORT = 65535


class ConfigError(RuntimeError):
    """Raised when configuration validation fails.

    The message aggregates every detected problem. Subclasses ``RuntimeError``
    so call sites that previously caught the ad-hoc ``RuntimeError`` for a
    missing/short ``INTERNAL_SECRET`` still handle it.
    """


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable, validated configuration for the Flask ML API.

    Build it via :func:`load_settings`; do not instantiate directly, since only
    the loader runs the aggregating validation.

    >>> import os
    >>> os.environ["INTERNAL_SECRET"] = "x" * 32
    >>> s = load_settings(validate_model_files=False)  # doctest: +SKIP
    >>> s.flask_port  # doctest: +SKIP
    5000
    """

    internal_secret: str
    model_path: str
    vectorizer_path: str
    label_encoder_path: str
    url_model_path: str
    url_vectorizer_path: str
    max_message_length: int
    node_env: str | None
    service_ip_allowlist: list[str]
    flask_host: str
    flask_port: int
    flask_debug: bool
    redis_url: str | None
    rate_limit_storage_uri: str | None
    safe_browsing_api_key: str | None
    virustotal_api_key: str | None


def load_settings(*, validate_model_files: bool = True) -> Settings:
    """Read, parse and validate the ML API configuration from the environment.

    Every problem is accumulated and reported together in a single
    :class:`ConfigError`, rather than failing on the first one. Set
    ``validate_model_files=False`` to skip the on-disk artifact check (useful in
    tests that never load the models).
    """
    errors: list[str] = []

    internal_secret = os.getenv("INTERNAL_SECRET")
    if not internal_secret:
        errors.append(
            "INTERNAL_SECRET is not set. This shared secret authenticates "
            "requests from the Node/Express backend and is mandatory. Generate "
            'one with `python -c "import secrets; print(secrets.token_urlsafe(32))"` '
            "and set it (identically) for both the Node and Flask services."
        )
    elif len(internal_secret) < INTERNAL_SECRET_MIN_LENGTH:
        errors.append(
            f"INTERNAL_SECRET is too short ({len(internal_secret)} characters); "
            f"it must be at least {INTERNAL_SECRET_MIN_LENGTH} characters."
        )

    resolved_paths = {
        env_var: _resolve_model_path(env_var, default_filename)
        for env_var, default_filename in _MODEL_ARTIFACTS
    }
    if validate_model_files:
        for env_var, resolved in resolved_paths.items():
            if not _is_resolvable(resolved):
                errors.append(
                    f"{env_var}: model artifact not found or empty at {resolved!r}."
                )

    max_message_length = _env_int("MAX_MESSAGE_LENGTH", 10000, errors=errors, minimum=0)

    flask_port = _env_int(
        "FLASK_PORT", 5000, errors=errors, minimum=1, maximum=_MAX_PORT
    )

    flask_host = os.getenv("FLASK_HOST", "127.0.0.1")
    flask_debug = _env_flag("FLASK_DEBUG", default=False)
    if flask_debug and flask_host not in _LOOPBACK_HOSTS:
        errors.append(
            "Refusing to start: FLASK_DEBUG is enabled while binding to "
            f"'{flask_host}'. The interactive debugger must never be exposed on "
            "a non-loopback interface."
        )

    allowlist_raw = os.getenv("SERVICE_IP_ALLOWLIST", "127.0.0.1,::1")
    service_ip_allowlist = [ip.strip() for ip in allowlist_raw.split(",")]

    if errors:
        raise ConfigError(_format_errors(errors))

    return Settings(
        internal_secret=internal_secret,
        model_path=resolved_paths["MODEL_PATH"],
        vectorizer_path=resolved_paths["VECTORIZER_PATH"],
        label_encoder_path=resolved_paths["LABEL_ENCODER_PATH"],
        url_model_path=resolved_paths["URL_MODEL_PATH"],
        url_vectorizer_path=resolved_paths["URL_VECTORIZER_PATH"],
        max_message_length=max_message_length,
        node_env=os.getenv("NODE_ENV"),
        service_ip_allowlist=service_ip_allowlist,
        flask_host=flask_host,
        flask_port=flask_port,
        flask_debug=flask_debug,
        redis_url=os.getenv("REDIS_URL"),
        rate_limit_storage_uri=os.getenv("RATE_LIMIT_STORAGE_URI"),
        safe_browsing_api_key=os.getenv("SAFE_BROWSING_API_KEY"),
        virustotal_api_key=os.getenv("VIRUSTOTAL_API_KEY"),
    )


def _env_flag(name: str, default: bool = False) -> bool:
    """Parse a boolean-ish env var. Truthy tokens: ``1``/``true``/``yes``/``on``."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(
    name: str,
    default: int,
    *,
    errors: list[str],
    minimum: int | None = None,
    maximum: int | None = None,
) -> int | None:
    """Parse an int env var and range-check it, appending to ``errors`` on failure.

    Returns the parsed value, or ``None`` when it is malformed or out of range
    (with a message recorded in ``errors``) so :func:`load_settings` can go on to
    report every other problem before raising.
    """
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        value = default
    else:
        try:
            value = int(raw.strip())
        except ValueError:
            errors.append(f"{name} must be an integer (got {raw.strip()!r}).")
            return None

    if minimum is not None and value < minimum:
        errors.append(f"{name} must be >= {minimum} (got {value}).")
        return None
    if maximum is not None and value > maximum:
        errors.append(f"{name} must be <= {maximum} (got {value}).")
        return None
    return value


def _resolve_model_path(env_var: str, default_filename: str) -> str:
    """Resolve a model-artifact path, preserving api.resolve_path's lookup order.

    An unset var falls back to ``BASE_DIR/<default>``; a relative override is
    tried as-given, then under ``BASE_DIR``, then by basename under ``BASE_DIR``.
    An absolute override is taken verbatim. Existence is checked separately by
    :func:`_is_resolvable`.
    """
    val = os.getenv(env_var)
    if not val:
        return str(BASE_DIR / default_filename)
    p = Path(val)
    if p.is_absolute():
        return val
    if p.exists() and p.stat().st_size > 0:
        return val
    p_base = BASE_DIR / p
    if p_base.exists() and p_base.stat().st_size > 0:
        return str(p_base)
    p_name = BASE_DIR / p.name
    if p_name.exists() and p_name.stat().st_size > 0:
        return str(p_name)
    return val


def _is_resolvable(path_str: str) -> bool:
    """True when ``path_str`` points at a present, non-empty file."""
    p = Path(path_str)
    return p.exists() and p.stat().st_size > 0


def _format_errors(errors: list[str]) -> str:
    """Render every collected problem as one multi-line message."""
    bullets = "\n".join(f"  - {problem}" for problem in errors)
    plural = "problem" if len(errors) == 1 else "problems"
    return (
        f"Invalid Flask ML API configuration ({len(errors)} {plural} found):\n"
        f"{bullets}"
    )
