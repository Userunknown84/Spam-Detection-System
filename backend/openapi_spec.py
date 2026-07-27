"""Hand-authored OpenAPI 3.0 document for the Flask ML API.

``build_spec()`` returns a plain ``dict`` describing the service's HTTP
contract: ``info``, ``servers``, the ``X-Internal-Secret`` security scheme,
and ``paths``/``components`` for the API's routes. It is served verbatim at
``GET /openapi.json`` and rendered by the Swagger UI at ``GET /docs``.

The document is deliberately hand-written rather than generated from the
route table: the ``/predict`` response has a rich, evolving shape
(``confidence``, ``domain_analysis``, ``url_risk``, ``explanation``,
``severity``, ...) that a decorator-based generator would not capture
faithfully. To keep the hand-authored spec honest, ``test_openapi_coverage``
asserts every non-static registered rule is documented here.

>>> spec = build_spec()
>>> spec["openapi"]
'3.0.3'
>>> "/predict" in spec["paths"]
True
"""

from __future__ import annotations

__all__ = ["build_spec"]

OPENAPI_VERSION = "3.0.3"
API_VERSION = "1.0.0"

# All routes except the handful of unauthenticated probes require the shared
# secret the trusted Node/Express backend attaches to every request. The
# document sets this scheme globally (see build_spec) and public operations
# opt out with an empty ``security: []``.
_SECURITY_SCHEME_NAME = "InternalSecret"
_SECURITY_SCHEME = {
    "type": "apiKey",
    "in": "header",
    "name": "X-Internal-Secret",
    "description": (
        "Shared service-to-service secret. The Flask ML API rejects any "
        "non-public request whose X-Internal-Secret header does not match "
        "the configured INTERNAL_SECRET with 403."
    ),
}

# Reusable inline reference to a JSON error envelope.
_ERROR = {"$ref": "#/components/schemas/Error"}


def build_spec():
    """Return the full OpenAPI 3.0 document for the Flask ML API as a dict.

    The result is JSON-serialisable and stable across calls (no runtime state
    is read), so it can be cached or diffed by consumers.
    """
    paths = {}
    paths.update(_core_paths())
    paths.update(_extended_paths())

    schemas = {}
    schemas.update(_core_schemas())
    schemas.update(_extended_schemas())

    return {
        "openapi": OPENAPI_VERSION,
        "info": {
            "title": "Spam Detection System - Flask ML API",
            "version": API_VERSION,
            "description": (
                "Machine-learning inference service for the Spam Detection "
                "System. Classifies messages and URLs as spam / ham / "
                "smishing / offensive, analyses email headers, and exposes "
                "feedback, insights and inbox-scanning endpoints. All routes "
                "except liveness/readiness probes require the "
                "X-Internal-Secret header set by the Node/Express gateway."
            ),
        },
        "servers": [
            {"url": "http://127.0.0.1:5000", "description": "Local development"},
        ],
        "security": [{_SECURITY_SCHEME_NAME: []}],
        "paths": paths,
        "components": {
            "securitySchemes": {_SECURITY_SCHEME_NAME: _SECURITY_SCHEME},
            "schemas": schemas,
        },
    }


# ============================================================================
# CORE ROUTES (PR 1/2): /predict, /feedback, /feedback/stats, /spam-insights,
# /importance, /analyze-email-header, /health
# ============================================================================


def _core_paths():
    return {
        "/health": {
            "get": {
                "summary": "Liveness/readiness probe",
                "operationId": "getHealth",
                "tags": ["System"],
                "security": [],
                "responses": {
                    "200": _json_response(
                        "Service is up.",
                        {"$ref": "#/components/schemas/HealthStatus"},
                    )
                },
            }
        },
        "/predict": {
            "post": {
                "summary": "Classify a message or URL",
                "operationId": "predict",
                "tags": ["Prediction"],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/PredictRequest"}
                        }
                    },
                },
                "responses": {
                    "200": _json_response(
                        "Prediction result with confidence, URL risk and "
                        "explanation details.",
                        {"$ref": "#/components/schemas/PredictionResponse"},
                    ),
                    "400": _error_response("Missing/invalid text or body."),
                    "403": _error_response("Missing or invalid internal secret."),
                    "500": _error_response("Inference error."),
                },
            }
        },
        "/feedback": {
            "post": {
                "summary": "Submit a labelling correction",
                "operationId": "submitFeedback",
                "tags": ["Feedback"],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/FeedbackRequest"}
                        }
                    },
                },
                "responses": {
                    "201": _json_response(
                        "Feedback recorded.",
                        {"$ref": "#/components/schemas/MessageResponse"},
                    ),
                    "400": _error_response(
                        "Empty text or correct_label outside the known labels."
                    ),
                    "503": _error_response("Feedback file lock could not be acquired."),
                },
            }
        },
        "/feedback/stats": {
            "get": {
                "summary": "Aggregate view of collected feedback",
                "operationId": "getFeedbackStats",
                "tags": ["Feedback"],
                "responses": {
                    "200": _json_response(
                        "Feedback totals, correction rate and recent submissions.",
                        {"$ref": "#/components/schemas/FeedbackStats"},
                    )
                },
            }
        },
        "/spam-insights": {
            "get": {
                "summary": "Top spam keywords, phrases and category indicators",
                "operationId": "getSpamInsights",
                "tags": ["Insights"],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "required": False,
                        "schema": {"type": "integer", "default": 10},
                        "description": "Max keywords/phrases to return.",
                    },
                    {
                        "name": "category",
                        "in": "query",
                        "required": False,
                        "schema": {"type": "string"},
                        "description": "Filter source metrics to a threat category.",
                    },
                ],
                "responses": {
                    "200": _json_response(
                        "Insight metrics.",
                        {"$ref": "#/components/schemas/SpamInsights"},
                    )
                },
            }
        },
        "/importance": {
            "get": {
                "summary": "Global feature importance for the classifier",
                "operationId": "getFeatureImportance",
                "tags": ["Insights"],
                "responses": {
                    "200": _json_response(
                        "Top weighted features.",
                        {"$ref": "#/components/schemas/FeatureImportance"},
                    ),
                    "500": _error_response("Failed to compute importance."),
                },
            }
        },
        "/analyze-email-header": {
            "post": {
                "summary": "SPF/DKIM/DMARC analysis of raw email headers",
                "operationId": "analyzeEmailHeader",
                "tags": ["Email"],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/EmailHeaderRequest"
                            }
                        },
                        "multipart/form-data": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "file": {
                                        "type": "string",
                                        "format": "binary",
                                        "description": "An .eml file to analyse.",
                                    }
                                },
                            }
                        },
                    },
                },
                "responses": {
                    "200": _json_response(
                        "Header trust analysis.",
                        {"$ref": "#/components/schemas/EmailHeaderResponse"},
                    ),
                    "400": _error_response("No email headers provided."),
                },
            }
        },
    }


def _core_schemas():
    return {
        "Error": {
            "type": "object",
            "properties": {
                "error": {"type": "string"},
                "request_id": {"type": "string"},
            },
            "required": ["error"],
        },
        "MessageResponse": {
            "type": "object",
            "properties": {"message": {"type": "string"}},
        },
        "HealthStatus": {
            "type": "object",
            "properties": {"status": {"type": "string", "example": "ok"}},
        },
        "PredictRequest": {
            "type": "object",
            "required": ["text"],
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Message body or URL to classify.",
                },
                "type": {
                    "type": "string",
                    "enum": ["message", "url"],
                    "default": "message",
                    "description": (
                        "Route to the URL classifier when set to 'url'; "
                        "otherwise the text classifier is used."
                    ),
                },
            },
        },
        "UrlRisk": {
            "type": "object",
            "description": "Thin top-level summary of domain_analysis.",
            "properties": {
                "is_url_present": {"type": "boolean"},
                "score": {"type": "number"},
                "level": {
                    "type": "string",
                    "enum": ["SAFE", "WARNING", "BLOCK"],
                },
            },
        },
        "PredictionResponse": {
            "type": "object",
            "description": (
                "Standardised prediction envelope. `result` and `prediction` "
                "always carry the same label; optional blocks (translated_text, "
                "domain_analysis, url_risk, explanation, severity) appear only "
                "when relevant."
            ),
            "properties": {
                "input": {"type": "string"},
                "result": {"type": "string", "example": "spam"},
                "prediction": {"type": "string", "example": "spam"},
                "confidence": {
                    "type": "number",
                    "description": "confidence_score / 100, rounded to 4 dp.",
                },
                "confidence_score": {
                    "type": "number",
                    "description": "Percentage confidence (0-100).",
                },
                "decision_score": {
                    "type": "number",
                    "nullable": True,
                    "description": "Absolute model decision-function margin.",
                },
                "confidence_level": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                },
                "detected_language": {"type": "string", "example": "en"},
                "translated": {"type": "boolean"},
                "translated_text": {"type": "string"},
                "domain_analysis": {
                    "type": "object",
                    "description": (
                        "Full per-domain risk breakdown from domain_checker."
                    ),
                    "additionalProperties": True,
                },
                "url_risk": {"$ref": "#/components/schemas/UrlRisk"},
                "explanation": {
                    "type": "object",
                    "description": "Explainable-AI reasons, matched keywords, patterns.",
                    "additionalProperties": True,
                },
                "severity": {
                    "description": "Computed spam severity summary.",
                    "additionalProperties": True,
                },
            },
            "required": [
                "input",
                "result",
                "prediction",
                "confidence",
                "confidence_score",
                "confidence_level",
                "detected_language",
                "translated",
            ],
        },
        "FeedbackRequest": {
            "type": "object",
            "required": ["text", "correct_label"],
            "properties": {
                "text": {"type": "string"},
                "predicted_label": {
                    "type": "string",
                    "description": "Label the model originally produced.",
                },
                "correct_label": {
                    "type": "string",
                    "description": (
                        "Corrected label; must be one of the model's known "
                        "classes (e.g. ham, spam, smishing)."
                    ),
                },
            },
        },
        "FeedbackStats": {
            "type": "object",
            "properties": {
                "total": {"type": "integer"},
                "corrections": {"type": "integer"},
                "correction_rate": {"type": "number"},
                "by_predicted_label": {
                    "type": "object",
                    "additionalProperties": True,
                },
                "recent": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text_preview": {"type": "string"},
                            "predicted_label": {"type": "string"},
                            "correct_label": {"type": "string"},
                            "submitted_at": {"type": "string"},
                        },
                    },
                },
            },
        },
        "SpamInsights": {
            "type": "object",
            "properties": {
                "top_keywords": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "keyword": {"type": "string"},
                            "count": {"type": "integer"},
                        },
                    },
                },
                "trending_phrases": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "phrase": {"type": "string"},
                            "count": {"type": "integer"},
                        },
                    },
                },
                "recent_suspicious_terms": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "category_indicators": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        },
        "FeatureImportance": {
            "type": "object",
            "properties": {
                "top_features": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "feature": {"type": "string"},
                            "importance": {"type": "number"},
                        },
                    },
                }
            },
        },
        "EmailHeaderRequest": {
            "type": "object",
            "properties": {
                "headers": {
                    "type": "string",
                    "description": "Raw email headers as a single string.",
                }
            },
        },
        "EmailHeaderResponse": {
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "trust_level": {"type": "string"},
                "risk_score": {"type": "integer"},
                "findings": {"type": "array", "items": {"type": "string"}},
                "status": {"type": "string"},
                "analysis": {"type": "object", "additionalProperties": True},
            },
        },
    }


# ============================================================================
# EXTENDED ROUTES (PR 2/2): remaining registered rules so the drift-guard
# coverage test passes -- gmail/outlook/imap, bulk-predict, analytics,
# wordcloud, roles, /openapi.json and /docs.
# ============================================================================


def _extended_paths():
    return {
        "/": {
            "get": {
                "summary": "Root banner",
                "operationId": "getRoot",
                "tags": ["System"],
                "security": [],
                "responses": {
                    "200": {
                        "description": "Plain-text banner.",
                        "content": {"text/plain": {"schema": {"type": "string"}}},
                    }
                },
            }
        },
        "/api/roles": {
            "get": {
                "summary": "Available roles and permissions",
                "operationId": "getRoles",
                "tags": ["System"],
                "security": [],
                "responses": {
                    "200": _json_response(
                        "Role/permission matrix.",
                        {"type": "object", "additionalProperties": True},
                    )
                },
            }
        },
        "/api/rate-limit-status": {
            "get": {
                "summary": "Configured rate-limit windows",
                "operationId": "getRateLimitStatus",
                "tags": ["System"],
                "security": [],
                "responses": {
                    "200": _json_response(
                        "Rate-limit configuration.",
                        {"type": "object", "additionalProperties": True},
                    )
                },
            }
        },
        "/api/wordcloud": {
            "get": {
                "summary": "Spam word frequencies for the word cloud",
                "operationId": "getWordcloud",
                "tags": ["Insights"],
                "responses": {
                    "200": _json_response(
                        "Word/count pairs from the database or a sample fallback.",
                        {
                            "type": "object",
                            "properties": {
                                "success": {"type": "boolean"},
                                "source": {"type": "string"},
                                "data": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "word": {"type": "string"},
                                            "count": {"type": "integer"},
                                        },
                                    },
                                },
                            },
                        },
                    )
                },
            }
        },
        "/api/word-of-the-day": {
            "get": {
                "summary": "Spam word of the day with metadata",
                "operationId": "getWordOfTheDay",
                "tags": ["Insights"],
                "responses": {
                    "200": _json_response(
                        "Word plus definition, context and safety tips.",
                        {
                            "type": "object",
                            "properties": {
                                "success": {"type": "boolean"},
                                "data": {
                                    "type": "object",
                                    "properties": {
                                        "word": {"type": "string"},
                                        "count": {"type": "integer", "nullable": True},
                                        "definition": {"type": "string"},
                                        "context": {"type": "string"},
                                        "tips": {"type": "string"},
                                    },
                                },
                            },
                        },
                    )
                },
            }
        },
        "/gmail/auth-url": {
            "get": {
                "summary": "Gmail OAuth consent URL",
                "operationId": "getGmailAuthUrl",
                "tags": ["Gmail"],
                "parameters": [_redirect_uri_param()],
                "responses": {
                    "200": _json_response(
                        "Consent page URL.",
                        {"$ref": "#/components/schemas/AuthUrlResponse"},
                    )
                },
            }
        },
        "/gmail/callback": {
            "get": {
                "summary": "Exchange a Gmail authorization code for tokens",
                "operationId": "gmailCallback",
                "tags": ["Gmail"],
                "parameters": [
                    _query_param("code", "OAuth authorization code.", required=True),
                    _redirect_uri_param(),
                ],
                "responses": {
                    "200": _json_response(
                        "Gmail connected.",
                        {"$ref": "#/components/schemas/MessageResponse"},
                    ),
                    "400": _error_response("Authorization code missing."),
                    "401": _error_response("Missing X-User-Username header."),
                    "500": _error_response("Token exchange failed."),
                },
            }
        },
        "/gmail/emails": {
            "get": {
                "summary": "Fetch the latest Gmail messages",
                "operationId": "getGmailEmails",
                "tags": ["Gmail"],
                "responses": {
                    "200": _json_response(
                        "Fetched emails.",
                        {"$ref": "#/components/schemas/EmailListResponse"},
                    ),
                    "401": _error_response("Gmail account not connected."),
                    "500": _error_response("Fetch failed."),
                },
            }
        },
        "/outlook/auth-url": {
            "get": {
                "summary": "Outlook OAuth consent URL",
                "operationId": "getOutlookAuthUrl",
                "tags": ["Outlook"],
                "parameters": [_redirect_uri_param()],
                "responses": {
                    "200": _json_response(
                        "Consent page URL.",
                        {"$ref": "#/components/schemas/AuthUrlResponse"},
                    )
                },
            }
        },
        "/outlook/callback": {
            "get": {
                "summary": "Exchange an Outlook authorization code for tokens",
                "operationId": "outlookCallback",
                "tags": ["Outlook"],
                "parameters": [
                    _query_param("code", "OAuth authorization code.", required=True),
                    _redirect_uri_param(),
                ],
                "responses": {
                    "200": _json_response(
                        "Outlook connected.",
                        {"$ref": "#/components/schemas/MessageResponse"},
                    ),
                    "400": _error_response("Authorization code missing."),
                    "401": _error_response("Missing X-User-Username header."),
                    "500": _error_response("Token exchange failed."),
                },
            }
        },
        "/outlook/emails": {
            "get": {
                "summary": "Fetch the latest Outlook messages",
                "operationId": "getOutlookEmails",
                "tags": ["Outlook"],
                "responses": {
                    "200": _json_response(
                        "Fetched emails.",
                        {"$ref": "#/components/schemas/EmailListResponse"},
                    ),
                    "401": _error_response("Outlook account not connected."),
                    "500": _error_response("Fetch failed."),
                },
            }
        },
        "/scan-emails": {
            "post": {
                "summary": "Fetch and classify a provider inbox batch",
                "operationId": "scanEmails",
                "tags": ["Email"],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["provider"],
                                "properties": {
                                    "provider": {
                                        "type": "string",
                                        "enum": ["gmail", "outlook"],
                                    }
                                },
                            }
                        }
                    },
                },
                "responses": {
                    "200": _json_response(
                        "Scan results.",
                        {"type": "object", "additionalProperties": True},
                    ),
                    "400": _error_response("Invalid provider."),
                    "401": _error_response("Provider account not connected."),
                    "500": _error_response("Scan execution failed."),
                },
            }
        },
        "/imap/connect": {
            "post": {
                "summary": "Connect an IMAP inbox for scheduled scanning",
                "operationId": "imapConnect",
                "tags": ["Email"],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/ImapConnectRequest"
                            }
                        }
                    },
                },
                "responses": {
                    "200": _json_response(
                        "Inbox connected and scheduled.",
                        {
                            "type": "object",
                            "properties": {
                                "message": {"type": "string"},
                                "scan_interval_minutes": {"type": "integer"},
                            },
                        },
                    ),
                    "400": _error_response(
                        "Missing fields, bad interval or no consent."
                    ),
                    "401": _error_response("IMAP authentication failed."),
                    "502": _error_response("Could not reach the IMAP server."),
                },
            }
        },
        "/bulk-predict": {
            "post": {
                "summary": "Batch-classify a CSV/TXT upload",
                "operationId": "bulkPredict",
                "tags": ["Prediction"],
                "requestBody": _file_upload_body(),
                "responses": {
                    "200": _json_response(
                        "Batch results with spam statistics.",
                        {"$ref": "#/components/schemas/BulkPredictResponse"},
                    ),
                    "400": _error_response("No/invalid file."),
                    "413": _error_response("File exceeds the 2MB limit."),
                },
            }
        },
        "/bulk-predict/export": {
            "post": {
                "summary": "Batch-classify and download a CSV report",
                "operationId": "bulkPredictExport",
                "tags": ["Prediction"],
                "requestBody": _file_upload_body(),
                "responses": {
                    "200": {
                        "description": "CSV report download.",
                        "content": {
                            "text/csv": {
                                "schema": {"type": "string", "format": "binary"}
                            }
                        },
                    },
                    "400": _error_response("No/invalid file."),
                    "413": _error_response("File exceeds the 2MB limit."),
                    "500": _error_response("Report generation failed."),
                },
            }
        },
        "/analytics/summary": {
            "get": {
                "summary": "Scan totals and threat percentages",
                "operationId": "getAnalyticsSummary",
                "tags": ["Analytics"],
                "responses": {
                    "200": _json_response(
                        "Aggregate scan counts.",
                        {
                            "type": "object",
                            "properties": {
                                "totalScanned": {"type": "integer"},
                                "threatCount": {"type": "integer"},
                                "threatPercentage": {"type": "number"},
                                "cleanPercentage": {"type": "number"},
                            },
                        },
                    )
                },
            }
        },
        "/analytics/trends": {
            "get": {
                "summary": "Daily scan counts by predicted label",
                "operationId": "getAnalyticsTrends",
                "tags": ["Analytics"],
                "responses": {
                    "200": {
                        "description": "Per-day, per-label counts.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "date": {"type": "string"},
                                            "label": {"type": "string"},
                                            "count": {"type": "integer"},
                                        },
                                    },
                                }
                            }
                        },
                    }
                },
            }
        },
        "/analytics/breakdown": {
            "get": {
                "summary": "Scan counts by input type",
                "operationId": "getAnalyticsBreakdown",
                "tags": ["Analytics"],
                "responses": {
                    "200": {
                        "description": "Per-type counts.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "type": {"type": "string"},
                                            "count": {"type": "integer"},
                                        },
                                    },
                                }
                            }
                        },
                    }
                },
            }
        },
        "/reports/export-pdf": {
            "get": {
                "summary": "PDF report export (not yet implemented)",
                "operationId": "exportReportPdf",
                "tags": ["Analytics"],
                "responses": {
                    "501": _error_response("Coming soon."),
                },
            }
        },
        "/openapi.json": {
            "get": {
                "summary": "This OpenAPI 3.0 document",
                "operationId": "getOpenapiSpec",
                "tags": ["System"],
                "security": [],
                "responses": {
                    "200": _json_response(
                        "The OpenAPI specification.",
                        {"type": "object", "additionalProperties": True},
                    )
                },
            }
        },
        "/docs": {
            "get": {
                "summary": "Swagger UI",
                "operationId": "getDocs",
                "tags": ["System"],
                "security": [],
                "responses": {
                    "200": {
                        "description": "Interactive Swagger UI HTML page.",
                        "content": {"text/html": {"schema": {"type": "string"}}},
                    }
                },
            }
        },
    }


def _extended_schemas():
    return {
        "AuthUrlResponse": {
            "type": "object",
            "properties": {"auth_url": {"type": "string"}},
        },
        "EmailListResponse": {
            "type": "object",
            "properties": {
                "emails": {
                    "type": "array",
                    "items": {"type": "object", "additionalProperties": True},
                }
            },
        },
        "ImapConnectRequest": {
            "type": "object",
            "required": ["host", "imap_username", "password", "consent"],
            "properties": {
                "host": {"type": "string"},
                "port": {"type": "integer", "default": 993},
                "imap_username": {"type": "string"},
                "password": {"type": "string", "format": "password"},
                "scan_interval_minutes": {
                    "type": "integer",
                    "description": "Must be one of the store's allowed intervals.",
                },
                "consent": {
                    "type": "boolean",
                    "description": "Explicit consent to store and scan the inbox.",
                },
            },
        },
        "BulkPredictResponse": {
            "type": "object",
            "properties": {
                "total_messages": {"type": "integer"},
                "spam_count": {"type": "integer"},
                "non_spam_count": {"type": "integer"},
                "spam_percentage": {"type": "number"},
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "message": {"type": "string"},
                            "prediction": {"type": "string"},
                            "result": {"type": "string"},
                            "confidence": {"type": "number"},
                            "confidence_score": {"type": "number"},
                            "decision_score": {"type": "number"},
                            "confidence_level": {"type": "string"},
                        },
                    },
                },
            },
        },
    }


# ============================================================================
# Small builders shared by the path definitions.
# ============================================================================


def _json_response(description, schema):
    return {
        "description": description,
        "content": {"application/json": {"schema": schema}},
    }


def _error_response(description):
    return _json_response(description, _ERROR)


def _query_param(name, description, required=False, schema=None):
    return {
        "name": name,
        "in": "query",
        "required": required,
        "schema": schema or {"type": "string"},
        "description": description,
    }


def _redirect_uri_param():
    return _query_param("redirect_uri", "OAuth redirect URI.")


def _file_upload_body():
    return {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file"],
                    "properties": {
                        "file": {
                            "type": "string",
                            "format": "binary",
                            "description": "CSV (with a text/message column) or TXT file.",
                        }
                    },
                }
            }
        },
    }
