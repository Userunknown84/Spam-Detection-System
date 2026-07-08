import re
import email
from email.parser import HeaderParser
from email.utils import parseaddr

def extract_domain(email_address):
    """Extracts lowercase domain name from email address."""
    if not email_address:
        return ""
    email_address = email_address.strip()
    if "@" in email_address:
        return email_address.split("@")[-1].lower().strip(" >")
    return email_address.lower()

def parse_authentication_results(auth_results_header):
    """Parses SPF, DKIM, and DMARC status from Authentication-Results header."""
    if not auth_results_header:
        return "none", "none", "none"
    
    auth_results_lower = auth_results_header.lower()
    
    # Extract status values using regex
    spf_match = re.search(r'\bspf\s*=\s*([a-z0-9_-]+)', auth_results_lower)
    dkim_match = re.search(r'\bdkim\s*=\s*([a-z0-9_-]+)', auth_results_lower)
    dmarc_match = re.search(r'\bdmarc\s*=\s*([a-z0-9_-]+)', auth_results_lower)
    
    spf = spf_match.group(1) if spf_match else "none"
    dkim = dkim_match.group(1) if dkim_match else "none"
    dmarc = dmarc_match.group(1) if dmarc_match else "none"
    
    return spf, dkim, dmarc

def analyze_headers(headers_text):
    """Parses and analyzes email headers, returning detailed authentication and risk metrics."""
    if not headers_text:
        return {
            "sender": "unknown",
            "spf": "none",
            "dkim": "none",
            "dmarc": "none",
            "return_path_match": False,
            "sender_domain_match": False,
            "risk_level": "Suspicious",
            "reasons": ["No headers provided"]
        }
    
    # Parse headers using standard HeaderParser
    parser = HeaderParser()
    try:
        msg = parser.parsestr(headers_text)
    except Exception as e:
        return {
            "sender": "unknown",
            "spf": "none",
            "dkim": "none",
            "dmarc": "none",
            "return_path_match": False,
            "sender_domain_match": False,
            "risk_level": "Suspicious",
            "reasons": [f"Failed to parse email headers: {str(e)}"]
        }
    
    from_header = msg.get("From", "")
    return_path_header = msg.get("Return-Path", "")
    
    # Extract email addresses
    _, from_email = parseaddr(from_header)
    _, return_path_email = parseaddr(return_path_header)
    
    from_domain = extract_domain(from_email)
    return_path_domain = extract_domain(return_path_email)
    
    # Compare Return-Path and From domains
    if return_path_domain:
        return_path_match = (from_domain == return_path_domain)
    else:
        # If Return-Path is missing or empty, mark as mismatch
        return_path_match = False
        
    # Extract Authentication-Results
    auth_headers = msg.get_all("Authentication-Results", [])
    spf, dkim, dmarc = "none", "none", "none"
    
    if auth_headers:
        # Scan through the headers, prioritizing non-'none' values from the top-most header
        for header in auth_headers:
            h_spf, h_dkim, h_dmarc = parse_authentication_results(header)
            if spf == "none" and h_spf != "none":
                spf = h_spf
            if dkim == "none" and h_dkim != "none":
                dkim = h_dkim
            if dmarc == "none" and h_dmarc != "none":
                dmarc = h_dmarc
                
    # Fallback to Received-SPF check if SPF is none
    if spf == "none":
        received_spf = msg.get("Received-SPF", "")
        if received_spf:
            received_spf_lower = received_spf.lower()
            match = re.match(r'^([a-z0-9_-]+)\b', received_spf_lower)
            if match:
                spf = match.group(1)
                
    # Sender Domain Mismatch Check
    sender_domain_match = True
    reasons = []
    
    # 1. Display name spoofing (e.g. From: "paypal.com" <scammer@gmail.com>)
    display_name, _ = parseaddr(from_header)
    if display_name and "@" in display_name:
        display_email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', display_name)
        if display_email_match:
            display_email = display_email_match.group(0)
            display_domain = extract_domain(display_email)
            if display_domain != from_domain:
                sender_domain_match = False
                reasons.append(f"Display name domain '{display_domain}' mismatch with From domain '{from_domain}'")
                
    # 2. Domain alignment with Authentication-Results
    auth_results_str = " ".join(auth_headers) if auth_headers else ""
    auth_domains = re.findall(r'(?:header\.from|smtp\.mailfrom|header\.d|header\.i)\s*=\s*([a-zA-Z0-9\.-]+)', auth_results_str.lower())
    if auth_domains and from_domain:
        matched = False
        for ad in auth_domains:
            ad_clean = ad.lower().strip()
            # If domain matches or is sub/parent domain
            if from_domain == ad_clean or from_domain.endswith("." + ad_clean) or ad_clean.endswith("." + from_domain):
                matched = True
                break
        if not matched:
            sender_domain_match = False
            reasons.append("Sender domain does not match authenticated domains in Authentication-Results")
            
    # Compile validation details & reasons
    if spf == "fail":
        reasons.append("SPF authentication failed")
    elif spf == "none":
        reasons.append("SPF authentication missing")
        
    if dkim == "fail":
        reasons.append("DKIM authentication failed")
    elif dkim == "none":
        reasons.append("DKIM authentication missing")
        
    if dmarc == "fail":
        reasons.append("DMARC authentication failed")
    elif dmarc == "none":
        reasons.append("DMARC authentication missing")
        
    if not return_path_header:
        reasons.append("Return-Path header is missing")
    elif not return_path_match:
        reasons.append("Return-Path mismatch")
        
    # Extra check: DKIM-Signature signature presence
    dkim_sig = msg.get("DKIM-Signature", "")
    if not dkim_sig and dkim == "none":
        reasons.append("No DKIM signature found in headers")
        
    # Extra check: Received headers presence
    received_headers = msg.get_all("Received", [])
    if not received_headers:
        reasons.append("No transit (Received) headers found")
        
    # Normalize values for risk assessment
    def norm(s):
        s_low = s.lower().strip()
        if s_low in ["pass", "ok", "success"]:
            return "pass"
        if s_low in ["fail", "failed", "hardfail"]:
            return "fail"
        return "none"
        
    n_spf = norm(spf)
    n_dkim = norm(dkim)
    n_dmarc = norm(dmarc)
    
    # Calculate Risk Level (legacy)
    # 1. Trusted: all pass, domains match
    if n_spf == "pass" and n_dkim == "pass" and n_dmarc == "pass" and return_path_match and sender_domain_match:
        risk_level = "Trusted"
    # 2. High Risk: DMARC fails, OR both SPF and DKIM fail, OR any fail with a mismatch
    elif n_dmarc == "fail" or (n_spf == "fail" and n_dkim == "fail") or (n_spf == "fail" and not return_path_match) or (n_dkim == "fail" and not return_path_match):
        risk_level = "High Risk"
    # 3. Suspicious: Missing headers or one of them failed, etc.
    else:
        risk_level = "Suspicious"

    # Calculate Weighted Risk Score & Findings (new)
    risk_score = 0
    findings = []
    
    if spf.lower() in ("fail", "softfail"):
        risk_score += 30
        findings.append("SPF validation failed")
        
    if dkim.lower() == "fail":
        risk_score += 30
        findings.append("DKIM validation failed")
        
    if dmarc.lower() == "fail":
        risk_score += 30
        findings.append("DMARC validation failed")
        
    if not return_path_match:
        risk_score += 20
        findings.append("Return-Path mismatch detected")
        
    if not sender_domain_match:
        risk_score += 20
        findings.append("Sender domain mismatch detected")
        
    # Real-time domain analysis (WHOIS and threat intelligence / blacklist)
    if from_domain:
        try:
            import domain_checker
            domain_analysis = domain_checker.analyze_domain(from_domain)
            domain_age = domain_analysis.get("age_days")
            domain_blacklisted = domain_analysis.get("blacklisted", False)
            
            if isinstance(domain_age, (int, float)) and domain_age < 30:
                risk_score += 30
                findings.append(f"Sender domain is recently registered (< 30 days old: {domain_age} days)")
                reasons.append(f"Recently registered sender domain ({domain_age} days)")
                
            if domain_blacklisted:
                risk_score = 100
                findings.append("Sender domain is blacklisted on threat intelligence or DNSBL lists")
                reasons.append("Sender domain is blacklisted")
        except Exception:
            pass
            
    risk_score = min(risk_score, 100)
    
    if risk_score <= 20:
        trust_level = "Trusted"
        risk_level = "Trusted"
    elif risk_score <= 60:
        trust_level = "Suspicious"
        risk_level = "Suspicious"
    else:
        trust_level = "High Risk"
        risk_level = "High Risk"
        
    return {
        "sender": from_email if from_email else "unknown",
        "spf": spf,
        "dkim": dkim,
        "dmarc": dmarc,
        "return_path_match": return_path_match,
        "sender_domain_match": sender_domain_match,
        "risk_level": risk_level,
        "reasons": reasons,
        "success": True,
        "trust_level": trust_level,
        "risk_score": risk_score,
        "findings": findings
    }
