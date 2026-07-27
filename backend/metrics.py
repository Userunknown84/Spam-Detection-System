"""Prometheus instrumentation for the Flask ML API.

The ML API is the CPU-bound core every prediction flows through, yet it has
historically exposed nothing machine-readable about its own throughput, latency,
error rate, or rate-limit pressure (issue #984). This module owns a private
``CollectorRegistry`` plus the collectors the ``/metrics`` endpoint scrapes, and
exposes thin helper functions so the request lifecycle in ``api.py`` never has to
touch ``prometheus_client`` types directly.

A dedicated registry (rather than the process-global default) keeps this API's
series isolated and makes the module safe to import twice: ``api.py`` adds
``backend/`` to ``sys.path`` and imports siblings by bare name, so this file can
load as both ``metrics`` and ``backend.metrics`` in one process. Collectors are
fetched-or-created so a second import into the *same* registry can't raise
prometheus_client's duplicate-timeseries error.
"""

from   prometheus_client        import (CONTENT_TYPE_LATEST, CollectorRegistry,
                                        Counter, Gauge, Histogram,
                                        generate_latest)

__all__ = [
    "registry",
    "record_prediction",
    "observe_request",
    "record_error",
    "record_rate_limit_rejection",
    "set_model_loaded",
    "render",
]

registry = CollectorRegistry()


def _get_or_create(cls, name, documentation, labelnames=()):
    """Build ``cls(name, ...)`` in ``registry``, reusing any existing collector.

    prometheus_client raises ``ValueError`` when a name is registered twice in
    one registry. That only happens if this module body runs against an already
    populated registry, but guarding here keeps a double import from taking down
    app startup.
    """
    try:
        return cls(name, documentation, labelnames, registry=registry)
    except ValueError:
        # Counter names lose their ``_total`` suffix in ``_name``; match on that.
        base = name.removesuffix("_total")
        for collector in list(registry._collector_to_names):
            if getattr(collector, "_name", None) == base:
                return collector
        raise


spam_predictions_total = _get_or_create(
    Counter,
    "spam_predictions_total",
    "Total predictions served, by classification result and input type.",
    ("result", "input_type"),
)

spam_request_latency_seconds = _get_or_create(
    Histogram,
    "spam_request_latency_seconds",
    "Request handling latency in seconds, by endpoint and HTTP method.",
    ("endpoint", "method"),
)

spam_requests_total = _get_or_create(
    Counter,
    "spam_requests_total",
    "Total HTTP requests handled, by endpoint, method, and response status.",
    ("endpoint", "method", "status"),
)

spam_errors_total = _get_or_create(
    Counter,
    "spam_errors_total",
    "Total requests that resulted in a 5xx / error response, by endpoint.",
    ("endpoint",),
)

spam_rate_limit_rejections_total = _get_or_create(
    Counter,
    "spam_rate_limit_rejections_total",
    "Total requests rejected with HTTP 429 by the rate limiter, by policy.",
    ("policy",),
)

spam_model_loaded = _get_or_create(
    Gauge,
    "spam_model_loaded",
    "Whether the ML models loaded successfully at startup (1) or not (0).",
)


def record_prediction(result, input_type):
    """Count one served prediction under its (result, input_type) labels."""
    spam_predictions_total.labels(result=result, input_type=input_type).inc()


def observe_request(endpoint, method, status, latency):
    """Record one completed request: bump the request counter and its latency."""
    spam_requests_total.labels(
        endpoint=endpoint, method=method, status=str(status)
    ).inc()
    spam_request_latency_seconds.labels(endpoint=endpoint, method=method).observe(
        latency
    )


def record_error(endpoint):
    """Count one error (5xx / unhandled) response for ``endpoint``."""
    spam_errors_total.labels(endpoint=endpoint).inc()


def record_rate_limit_rejection(policy):
    """Count one HTTP 429 emitted by the rate limiter under ``policy``."""
    spam_rate_limit_rejections_total.labels(policy=policy).inc()


def set_model_loaded(loaded):
    """Set the model-loaded gauge to 1 when ``loaded`` is truthy, else 0."""
    spam_model_loaded.set(1 if loaded else 0)


def render():
    """Return ``(exposition_bytes, content_type)`` for the ``/metrics`` route."""
    return generate_latest(registry), CONTENT_TYPE_LATEST
