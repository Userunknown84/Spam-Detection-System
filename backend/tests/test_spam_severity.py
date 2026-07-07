from backend.services.severity import calculate_spam_severity


def test_high_severity_detects_expected_indicators():
    result = calculate_spam_severity(
        "URGENT! Verify your account now and update payment. http://bit.ly/abc"
    )

    assert result["score"] >= 0
    assert result["score"] <= 10
    assert result["level"] == "Critical"
    assert "Suspicious URL" in result["indicators"]
    assert "Credential Theft Keywords" in result["indicators"]
    assert "Urgent Language" in result["indicators"]


def test_low_severity_returns_safe_defaults():
    result = calculate_spam_severity("Hello, how are you today?")

    assert result["score"] == 0
    assert result["level"] == "Low"
    assert result["color"] == "green"
    assert result["indicators"] == []
    assert result["breakdown"] == {}
