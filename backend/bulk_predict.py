import csv
import io
import os


import numpy as np

from flask import Blueprint, current_app, jsonify, request, send_file

from extensions import limiter

bulk_predict_bp = Blueprint("bulk_predict", __name__)

def parse_and_predict_file(file):
    # Check file extension
    filename = file.filename.lower() if file.filename else ""
    if not (filename.endswith(".csv") or filename.endswith(".txt")):
        return None, "Unsupported file type. Only CSV and TXT files are supported."
        
    # Check file size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    
    if file_size > 2 * 1024 * 1024:  # 2MB limit
        return None, "File size exceeds the limit of 2MB."
    if file_size == 0:
        return None, "Empty file uploaded."
        
    try:
        # Use a text wrapper around the uploaded file stream for proper decoding.
        text_wrapper = io.TextIOWrapper(file.stream, encoding="utf-8", errors="replace")
    except Exception:
        return None, "Failed to read uploaded file."

    # Helper for batch inference
    def _batch_predict(batch_messages):
        
        vectorizer = getattr(current_app, "vectorizer", None)
        model = getattr(current_app, "model", None)
        label_encoder = getattr(current_app, "label_encoder", None)
        if not vectorizer or not model or not label_encoder:
            raise RuntimeError("ML Model dependencies are not loaded.")
        text_vectors = vectorizer.transform(batch_messages)
        predictions = model.predict(text_vectors)
        final_outputs = label_encoder.inverse_transform(predictions)
        
        # Compute decisions
        decisions = model.decision_function(text_vectors)
        
        batch_results = []
        for i, (msg, pred) in enumerate(zip(batch_messages, final_outputs)):
            pred_str = str(pred)
            dec_score = float(np.max(np.abs(decisions[i])))
            prob = 1.0 / (1.0 + np.exp(-dec_score))
            conf_score = round(prob * 100, 2)
            
            if conf_score >= 80:
                conf_level = "high"
            elif conf_score >= 60:
                conf_level = "medium"
            else:
                conf_level = "low"
                
            batch_results.append({
                "message": msg,
                "prediction": pred_str,
                "result": pred_str,
                "confidence": round(conf_score / 100.0, 4),
                "confidence_score": conf_score,
                "decision_score": dec_score,
                "confidence_level": conf_level
            })
        return batch_results

    BATCH_SIZE = int(os.getenv("BULK_PREDICT_BATCH_SIZE", "256"))
    results = []
    batch = []

    if filename.endswith(".csv"):
        try:
            reader = csv.DictReader(text_wrapper)
            fieldnames = reader.fieldnames
            if not fieldnames:
                return None, "Invalid CSV file structure or missing headers."
            col_name = None
            for h in fieldnames:
                if h and h.strip().lower() in ("text", "message"):
                    col_name = h
                    break
            if not col_name:
                return None, "CSV file must contain either a 'text' or 'message' column."
            for row in reader:
                val = row.get(col_name)
                if val is not None and val.strip():
                    batch.append(val.strip())
                    if len(batch) >= BATCH_SIZE:
                        results.extend(_batch_predict(batch))
                        batch = []
        except Exception as e:
            return None, f"Failed to parse CSV: {str(e)}"
    else:  # TXT file
        for line in text_wrapper:
            line = line.strip()
            if line:
                batch.append(line)
                if len(batch) >= BATCH_SIZE:
                    results.extend(_batch_predict(batch))
                    batch = []
    # Process any remaining messages
    if batch:
        results.extend(_batch_predict(batch))
    if not results:
        return None, "No valid messages found in the file."
    return results, None

@bulk_predict_bp.route("/bulk-predict", methods=["POST"])
@limiter.limit("50 per minute")
def bulk_predict():


    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file uploaded"}), 400
        
    results, error = parse_and_predict_file(file)
    if error:
        status_code = 413 if "exceeds the limit" in error.lower() else 400
        return jsonify({"error": error}), status_code
        
    total = len(results)
    spam_count = sum(1 for r in results if r["prediction"].lower() not in ("ham", "safe"))
    non_spam_count = total - spam_count
    spam_pct = round((spam_count / total) * 100, 2) if total > 0 else 0.0
    
    return jsonify({
        "total_messages": total,
        "spam_count": spam_count,
        "non_spam_count": non_spam_count,
        "spam_percentage": spam_pct,
        "results": results
    })

@bulk_predict_bp.route("/bulk-predict/export", methods=["POST"])
@limiter.limit("50 per minute")
def bulk_predict_export():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file uploaded"}), 400
        
    results, error = parse_and_predict_file(file)
    if error:
        status_code = 413 if "exceeds the limit" in error.lower() else 400
        return jsonify({"error": error}), status_code
        
    try:
        output_io = io.StringIO()
        writer = csv.writer(output_io)
        writer.writerow(["message", "prediction", "result", "confidence_score", "decision_score", "confidence_level"])
        for r in results:
            writer.writerow([r["message"], r["prediction"], r["result"], r["confidence_score"], r["decision_score"], r["confidence_level"]])
            
        output_io.seek(0)
        mem = io.BytesIO(output_io.getvalue().encode("utf-8"))
        
        return send_file(
            mem,
            mimetype="text/csv",
            as_attachment=True,
            download_name="bulk_spam_predictions.csv"
        )
    except Exception as e:
        return jsonify({"error": f"Failed to generate CSV report: {str(e)}"}), 500
