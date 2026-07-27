"""Tests for the centralized, fail-fast configuration loader (issue #987).

These exercise settings.load_settings() directly, without importing api, so they
run without the ML model artifacts or heavy runtime dependencies present.
``validate_model_files=False`` skips the on-disk artifact check for cases whose
subject is a different variable.
"""

from   pathlib                  import Path
import sys

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from   settings                 import (ConfigError,
                                        INTERNAL_SECRET_MIN_LENGTH, Settings,
                                        load_settings)

_VALID_SECRET = "x" * INTERNAL_SECRET_MIN_LENGTH

# Variables load_settings reads that the environment/CI or conftest may set;
# cleared per test so each case controls exactly what it exercises.
_MANAGED_VARS = (
    "INTERNAL_SECRET",
    "FLASK_PORT",
    "FLASK_HOST",
    "FLASK_DEBUG",
    "MAX_MESSAGE_LENGTH",
    "NODE_ENV",
    "SERVICE_IP_ALLOWLIST",
)


@pytest.fixture
def clean_env(monkeypatch):
    for name in _MANAGED_VARS:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_config_error_is_runtime_error():
    # api.py and legacy call sites relied on a RuntimeError for a bad secret.
    assert issubclass(ConfigError, RuntimeError)


def test_missing_internal_secret_raises(clean_env):
    with pytest.raises(ConfigError, match="INTERNAL_SECRET is not set"):
        load_settings(validate_model_files=False)


def test_short_internal_secret_raises(clean_env):
    clean_env.setenv("INTERNAL_SECRET", "x" * (INTERNAL_SECRET_MIN_LENGTH - 1))
    with pytest.raises(ConfigError, match="too short"):
        load_settings(validate_model_files=False)


def test_invalid_port_raises(clean_env):
    clean_env.setenv("INTERNAL_SECRET", _VALID_SECRET)
    clean_env.setenv("FLASK_PORT", "70000")
    with pytest.raises(ConfigError, match="FLASK_PORT"):
        load_settings(validate_model_files=False)


def test_non_integer_port_raises(clean_env):
    clean_env.setenv("INTERNAL_SECRET", _VALID_SECRET)
    clean_env.setenv("FLASK_PORT", "not-a-number")
    with pytest.raises(ConfigError, match="FLASK_PORT must be an integer"):
        load_settings(validate_model_files=False)


def test_debug_on_non_loopback_host_refused(clean_env):
    clean_env.setenv("INTERNAL_SECRET", _VALID_SECRET)
    clean_env.setenv("FLASK_DEBUG", "true")
    clean_env.setenv("FLASK_HOST", "0.0.0.0")
    with pytest.raises(ConfigError, match="Refusing to start"):
        load_settings(validate_model_files=False)


def test_aggregated_error_names_all_problems(clean_env):
    # Missing secret + malformed port + negative max length must all surface in
    # a single error, not one-at-a-time across restarts.
    clean_env.delenv("INTERNAL_SECRET", raising=False)
    clean_env.setenv("FLASK_PORT", "not-a-number")
    clean_env.setenv("MAX_MESSAGE_LENGTH", "-5")

    with pytest.raises(ConfigError) as exc_info:
        load_settings(validate_model_files=False)

    message = str(exc_info.value)
    assert "INTERNAL_SECRET is not set" in message
    assert "FLASK_PORT" in message
    assert "MAX_MESSAGE_LENGTH" in message


def test_valid_config_loads(clean_env):
    clean_env.setenv("INTERNAL_SECRET", _VALID_SECRET)

    settings = load_settings(validate_model_files=False)

    assert isinstance(settings, Settings)
    assert settings.internal_secret == _VALID_SECRET
    assert settings.flask_port == 5000
    assert settings.flask_host == "127.0.0.1"
    assert settings.flask_debug is False
    assert settings.max_message_length == 10000
    assert settings.service_ip_allowlist == ["127.0.0.1", "::1"]


def test_service_ip_allowlist_parsed_as_list(clean_env):
    clean_env.setenv("INTERNAL_SECRET", _VALID_SECRET)
    clean_env.setenv("SERVICE_IP_ALLOWLIST", "10.0.0.1, 10.0.0.2 ,192.168.0.1")

    settings = load_settings(validate_model_files=False)

    assert settings.service_ip_allowlist == ["10.0.0.1", "10.0.0.2", "192.168.0.1"]
