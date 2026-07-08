import os
import urllib.parse
import requests
from concurrent.futures import ThreadPoolExecutor

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

def get_gmail_auth_url(redirect_uri):
    """Generates the Google OAuth 2.0 authorization URL."""
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/gmail.readonly",
        "access_type": "offline",
        "prompt": "consent"
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)

def get_gmail_tokens(code, redirect_uri):
    """Exchanges authorization code for Google access and refresh tokens."""
    data = {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }
    response = requests.post("https://oauth2.googleapis.com/token", data=data)
    response.raise_for_status()
    return response.json()

def refresh_gmail_token(refresh_token):
    """Refreshes the Google access token using the refresh token."""
    data = {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }
    response = requests.post("https://oauth2.googleapis.com/token", data=data)
    response.raise_for_status()
    return response.json()

def fetch_single_message(msg_id, headers):
    """Fetches details for a single email message from Gmail API."""
    try:
        msg_r = requests.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}", headers=headers)
        if msg_r.status_code == 200:
            return msg_r.json()
    except Exception:
        pass
    return None

def fetch_gmail_emails(access_token, limit=50):
    """Fetches latest email headers and snippets from Gmail API."""
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults={limit}", headers=headers)
    r.raise_for_status()
    res = r.json()
    
    emails = []
    messages = res.get("messages", [])
    
    # Fetch details concurrently using ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=10) as executor:
        msg_ids = [m["id"] for m in messages]
        results = list(executor.map(lambda mid: fetch_single_message(mid, headers), msg_ids))
        
    for msg_data in results:
        if not msg_data:
            continue
            
        msg_id = msg_data.get("id")
        
        # Parse headers
        payload_headers = msg_data.get("payload", {}).get("headers", [])
        subject = "No Subject"
        sender = "Unknown Sender"
        date = "Unknown Date"
        
        for h in payload_headers:
            name_lower = h.get("name", "").lower()
            if name_lower == "from":
                sender = h.get("value", "")
            elif name_lower == "subject":
                subject = h.get("value", "")
            elif name_lower == "date":
                date = h.get("value", "")
                
        body_preview = msg_data.get("snippet", "")
        
        # Build raw headers block for downstream header analysis
        raw_headers_list = []
        for h in payload_headers:
            raw_headers_list.append(f"{h.get('name')}: {h.get('value')}")
        raw_headers = "\n".join(raw_headers_list)
        
        emails.append({
            "id": msg_id,
            "subject": subject,
            "sender": sender,
            "body": body_preview,
            "date": date,
            "raw_headers": raw_headers
        })
        
    return emails
