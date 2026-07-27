"""Tests for issue #922: multi_level_defense.py exposes a CLI that the Express
adversarial route (routes/adversarialRoutes.js) can drive.

The route spawns ``python multi_level_defense.py --command <cmd> --params <JSON>``
and reads a single JSON object from stdout, treating a non-zero exit code as a
failure. These tests invoke the script exactly that way (subprocess) and assert
the stdout/exit-code contract.
"""

import json
from   pathlib                  import Path
import subprocess
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND_DIR / "multi_level_defense.py"


def run_cli(*args):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        cwd=str(BACKEND_DIR),
    )
    return proc


def test_status_returns_json_on_stdout():
    proc = run_cli("--command", "status")
    assert proc.returncode == 0
    payload = json.loads(proc.stdout)  # stdout must be pure JSON
    assert payload["success"] is True
    assert payload["command"] == "status"
    assert set(payload["levels"]) == {"character", "word", "sentence", "paragraph"}


def test_detect_returns_structured_result():
    proc = run_cli(
        "--command",
        "detect",
        "--params",
        json.dumps({"text": "Cl4im y0ur fr33 pr!ze n0w!"}),
    )
    assert proc.returncode == 0
    payload = json.loads(proc.stdout)
    assert payload["success"] is True
    assert "is_adversarial" in payload
    assert "ensemble_confidence" in payload
    assert "attack_levels" in payload


def test_missing_text_exits_nonzero_with_error_json():
    proc = run_cli("--command", "detect", "--params", "{}")
    assert proc.returncode != 0
    payload = json.loads(proc.stdout)
    assert payload["success"] is False
    assert "error" in payload


def test_invalid_params_json_is_rejected():
    proc = run_cli("--command", "detect", "--params", "not-json")
    assert proc.returncode != 0
    payload = json.loads(proc.stdout)
    assert payload["success"] is False


def test_stdout_is_clean_json_without_diagnostic_noise():
    # Model load/save diagnostics must go to stderr so the Express side can
    # JSON.parse stdout directly.
    proc = run_cli("--command", "status")
    assert proc.returncode == 0
    # Parsing the entire stdout as JSON fails if any print leaked onto stdout.
    json.loads(proc.stdout)
