from flask import current_app
import numpy as np

try:
    # Import standard headers analyzer if available
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from email_header_analyzer import analyze_headers
except ImportError:
    analyze_headers = None

def scan_emails_with_model(emails):
    """Classifies a list of fetched emails using the active machine learning model.
    
    Optionally appends header analysis results (risk_score, trust_level) if headers exist.
    """
    vectorizer = getattr(current_app, "vectorizer", None)
    model = getattr(current_app, "model", None)
    label_encoder = getattr(current_app, "label_encoder", None)
    
    if not model or not vectorizer or not label_encoder:
        raise ValueError("ML model dependencies are not loaded in the Flask application.")
        
    scanned_emails = []
    spam_count = 0
    safe_count = 0
    
    # Extract email subjects and bodies for batch vectorization
    texts = [f"{e['subject']}. {e['body']}" for e in emails]
    if texts:
        text_vectors = vectorizer.transform(texts)
        predictions = model.predict(text_vectors)
        final_outputs = label_encoder.inverse_transform(predictions)
        decisions = model.decision_function(text_vectors)
    else:
        final_outputs = []
        decisions = []
        
    for i, (e, pred) in enumerate(zip(emails, final_outputs)):
        pred_str = str(pred)
        # Classify as spam if not explicitly 'ham' or 'safe'
        is_spam = pred_str.lower() not in ("ham", "safe")
        
        if is_spam:
            spam_count += 1
        else:
            safe_count += 1
            
        dec_score = float(np.max(np.abs(decisions[i])))
        prob = 1.0 / (1.0 + np.exp(-dec_score))
        conf_score = round(prob * 100, 2)
        
        if conf_score >= 80:
            conf_level = "high"
        elif conf_score >= 60:
            conf_level = "medium"
        else:
            conf_level = "low"
            
        email_result = {
            "id": e.get("id"),
            "subject": e.get("subject", "No Subject"),
            "sender": e.get("sender", "Unknown Sender"),
            "date": e.get("date", "Unknown Date"),
            "prediction": pred_str,
            "result": pred_str,
            "confidence": round(conf_score / 100.0, 4),
            "confidence_score": conf_score,
            "decision_score": dec_score,
            "confidence_level": conf_level
        }
        # Phishing integration preparation (optional header analysis)
        has_header_risk = False
        if analyze_headers and e.get("raw_headers"):
            try:
                header_analysis = analyze_headers(e["raw_headers"])
                email_result["risk_score"] = header_analysis.get("risk_score")
                email_result["trust_level"] = header_analysis.get("trust_level")
                has_header_risk = True
            except Exception:
                pass
                
        # Fallback: check sender's domain metadata if header analysis wasn't performed/successful
        if not has_header_risk and e.get("sender"):
            try:
                sender_val = e.get("sender", "")
                if "@" in sender_val:
                    sender_domain = sender_val.split("@")[-1].lower().strip(" >")
                    if sender_domain:
                        import domain_checker
                        domain_analysis = domain_checker.analyze_domain(sender_domain)
                        risk_val = domain_analysis.get("risk_score", 0)
                        email_result["risk_score"] = risk_val
                        
                        if risk_val <= 20:
                            email_result["trust_level"] = "Trusted"
                        elif risk_val <= 60:
                            email_result["trust_level"] = "Suspicious"
                        else:
                            email_result["trust_level"] = "High Risk"
            except Exception:
                pass
                
        scanned_emails.append(email_result)
        
    return {
        "total_scanned": len(emails),
        "spam_count": spam_count,
        "safe_count": safe_count,
        "emails": scanned_emails
    }
