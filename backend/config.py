"""Configuration for the DB / FastAPI side of the backend.

The DB and FastAPI vars below are read eagerly, as they always have been. The
Flask ML API's own settings live in :mod:`settings` (the single source of truth);
they are re-exported here lazily via ``__getattr__`` so importing this module for
the DB fields alone never triggers the ML config validation (which requires
``INTERNAL_SECRET`` and the model files to be present).
"""

import os

from   dotenv                   import load_dotenv

load_dotenv()

DATABASE_PATH = os.getenv("DATABASE_PATH", "spam_detection.db")
API_KEY = os.getenv("API_KEY", "")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
PORT = int(os.getenv("PORT", "5000"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "spam_detection")

# ML API settings re-exported from the settings module. Maps the module-level
# name to the corresponding Settings attribute; resolved lazily on first access.
_ML_SETTING_FIELDS = {
    "INTERNAL_SECRET": "internal_secret",
    "MODEL_PATH": "model_path",
    "VECTORIZER_PATH": "vectorizer_path",
    "LABEL_ENCODER_PATH": "label_encoder_path",
    "URL_MODEL_PATH": "url_model_path",
    "URL_VECTORIZER_PATH": "url_vectorizer_path",
    "MAX_MESSAGE_LENGTH": "max_message_length",
    "NODE_ENV": "node_env",
    "SERVICE_IP_ALLOWLIST": "service_ip_allowlist",
    "FLASK_HOST": "flask_host",
    "FLASK_PORT": "flask_port",
    "FLASK_DEBUG": "flask_debug",
}


def __getattr__(name):
    """Lazily surface ML settings so the eager DB import path stays validation-free."""
    field = _ML_SETTING_FIELDS.get(name)
    if field is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    try:
        from .settings import load_settings
    except ImportError:
        from settings import load_settings
    return getattr(load_settings(), field)
