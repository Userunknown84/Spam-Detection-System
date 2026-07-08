"""Shared pytest setup for the backend test suite.

The ML API (api.py) treats INTERNAL_SECRET as mandatory configuration with no
hardcoded fallback (issue #446), so every test that imports `api` must have a
valid secret present in the environment. We supply an explicit test value here,
in one place, before any test module is collected. `setdefault` is used so a
secret provided by the real environment/CI is never overridden.
"""

import os

# Must be at least INTERNAL_SECRET_MIN_LENGTH (32) characters to pass validation.
TEST_INTERNAL_SECRET = "test-internal-secret-for-pytest-only-do-not-use-in-prod"

os.environ.setdefault("INTERNAL_SECRET", TEST_INTERNAL_SECRET)
