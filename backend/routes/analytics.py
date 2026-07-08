from flask import Blueprint, jsonify, request, current_app

analytics_bp = Blueprint('analytics', __name__)

# In-memory scan history (api.py ke saath share hoga)
scan_history = []

def record_scan(text, prediction, input_type):
    """Har predict ke baad call karo"""
    from datetime import datetime
    scan_history.append({
        "date": datetime.now().strftime("%Y-%m-%d"),
        "prediction": prediction,
        "type": input_type
    })
    # Max 1000 records rakhte hain
    if len(scan_history) > 1000:
        scan_history.pop(0)

@analytics_bp.route("/analytics/summary", methods=["GET"])
def get_summary():
    total = len(scan_history)
    threats = sum(1 for s in scan_history if s["prediction"] not in ("ham", "safe"))
    clean = total - threats
    return jsonify({
        "totalScanned": total,
        "threatCount": threats,
        "threatPercentage": round(threats / total * 100, 1) if total else 0,
        "cleanPercentage": round(clean / total * 100, 1) if total else 0,
    })

@analytics_bp.route("/analytics/trends", methods=["GET"])
def get_trends():
    from collections import defaultdict
    grouped = defaultdict(int)
    for s in scan_history:
        grouped[(s["date"], s["prediction"])] += 1
    result = [
        {"date": k[0], "label": k[1], "count": v}
        for k, v in grouped.items()
    ]
    return jsonify(result)

@analytics_bp.route("/analytics/breakdown", methods=["GET"])
def get_breakdown():
    from collections import defaultdict
    grouped = defaultdict(int)
    for s in scan_history:
        grouped[s["type"]] += 1
    result = [{"type": k, "count": v} for k, v in grouped.items()]
    return jsonify(result)

@analytics_bp.route("/reports/export-pdf", methods=["GET"])
def export_pdf():
    return jsonify({"error": "Coming soon"}), 501