"""Regression tests for issue #924: domain age must contribute to the risk
score exactly once. Previously a domain younger than 30 days was penalised by
both the tiered age bucket *and* an extra flat +30, inflating scores (e.g. a
3-day-old domain scored 90 instead of 60)."""

from   pathlib                  import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import domain_checker # noqa: E402


def score(age_days, blacklist=None):
    return domain_checker.calculate_risk_score(age_days, blacklist or {})[0]


def test_age_buckets_are_mutually_exclusive():
    # Each bucket contributes its single weight, with no overlapping penalty.
    assert score(3) == 60  # < 7 days
    assert score(15) == 40  # 7–29 days (was 70 with the double count)
    assert score(45) == 20  # 30–89 days
    assert score(400) == 5  # >= 90 days


def test_unknown_age_scores_slightly_suspicious():
    assert score(None) == 10


def test_boundary_between_new_and_medium_bucket():
    assert score(29) == 40
    assert score(30) == 20


def test_age_does_not_overpower_blacklist_weighting():
    # A brand-new but clean domain stays below the BLOCK threshold; the age
    # signal alone must not push it to a block recommendation.
    age_only_score, recommendation = domain_checker.calculate_risk_score(3, {})
    assert age_only_score == 60
    assert recommendation == "WARNING"
