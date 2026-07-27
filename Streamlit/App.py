import streamlit as st
import joblib
import pandas as pd
import numpy as np
import pdfplumber
from docx import Document
from urllib.parse import urlparse
import re
import matplotlib.pyplot as plt
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def _resolve_model_path(filename):
    for d in (BASE_DIR, BASE_DIR / "backend"):
        p = d / filename
        if p.exists():
            return p
    return BASE_DIR / filename


suspicious_tlds = [
    ".xyz",
    ".top",
    ".click",
    ".zip",
    ".shop",
    ".buzz",
    ".online"
]

st.set_page_config(
    page_title="Spam Detection System",
    page_icon="📧",
    layout="wide"
)


@st.cache_resource
def load_models():
    text_model = joblib.load(_resolve_model_path("linear_svm_model.pkl"))
    text_vectorizer = joblib.load(_resolve_model_path("tfidf_vectorizer.pkl"))
    label_encoder = joblib.load(_resolve_model_path("label_encoder.pkl"))

    url_model_path = _resolve_model_path("url_detector.pkl")
    url_vectorizer_path = _resolve_model_path("url_vectorizer.pkl")

    url_model = joblib.load(url_model_path) if url_model_path.exists() else None
    url_vectorizer = joblib.load(url_vectorizer_path) if url_vectorizer_path.exists() else None

    return (
        text_model,
        text_vectorizer,
        label_encoder,
        url_model,
        url_vectorizer
    )



model, vectorizer, encoder, url_detector, url_vectorizer = load_models()

if "reset_counter" not in st.session_state:
    st.session_state.reset_counter = 0

if "history" not in st.session_state:
    st.session_state.history = []

st.title("📧 Spam Detection System")

st.write("""
AI-powered application to detect spam in:

- 📩 Emails
- 📱 SMS
- 🔗 URLs
- 📂 Bulk Files
""")

st.divider()

with st.sidebar:

    st.header("⚙ Features")

    st.success("Email Detection")

    st.success("SMS Detection")

    st.success("URL Detection")

    st.success("Bulk Prediction")


    st.markdown("---")


if "show_examples" not in st.session_state:
    st.session_state.show_examples = False

if st.button(
    "📖 Show Spam Examples"
    if not st.session_state.show_examples
    else "❌ Close Spam Examples"
):
    st.session_state.show_examples = not st.session_state.show_examples


if st.session_state.show_examples:

    tab1, tab2, tab3 = st.tabs(
        ["📧 Email", "📱 SMS", "🔗 URL"]
    )

    with tab1:
        st.code("""
Congratulations!
You won an iPhone.

Click here to claim.

Limited Time Offer.
""")

    with tab2:
        st.code("""
Win ₹50,000

Click here now.

Free Recharge.

Claim Reward.
""")

    with tab3:
        st.code("""
http://free-prize.xyz

https://claim-now.info

http://verify-account-login.com
""")

option = st.selectbox(
    "Select Detection Type",
    [
        "Select",
        "Email",
        "SMS",
        "URL",
        "Bulk Prediction"
    ],
    key=f"option_{st.session_state.reset_counter}"
)

# ==========================================
# Email / SMS Detection
# ==========================================

# text
def analyze_text(text):

    score = 0
    findings = []

    # URL present
    if re.search(r'https?://', text):
        findings.append("Contains URL")
        score += 20

    # Email address
    if re.search(r'\S+@\S+', text):
        findings.append("Contains Email Address")
        score += 5

    # Phone number
    if re.search(r'\b\d{10}\b', text):
        findings.append("Contains Phone Number")
        score += 10

    # OTP
    if "otp" in text.lower():
        findings.append("Mentions OTP")
        score += 15

    # Urgent words
    suspicious = [
        "urgent",
        "verify",
        "winner",
        "free",
        "lottery",
        "claim",
        "reward",
        "bank",
        "password"
    ]

    found = []

    for word in suspicious:

        if word in text.lower():

            found.append(word)

            score += 10

    return score, findings, found

if option in ["Email", "SMS"]:

    st.subheader(f"📩 {option} Spam Detection")

    with st.expander("📄 Sample Inputs"):

        st.code("Congratulations! You have won a FREE iPhone. Click here now!")

        st.code("Your OTP for login is 483921. Do not share it with anyone.")

        st.code("Meeting has been scheduled tomorrow at 10 AM.")

    message = st.text_area(
    "Enter your message",
    key=f"message_{st.session_state.reset_counter}",
    height=200,
    placeholder="Type your email or SMS here..."
)

    if st.button("🔍 Detect Spam"):

        if message.strip():

            vector = vectorizer.transform([message])

            prediction = model.predict(vector)

            result = encoder.inverse_transform(prediction)[0]

            confidence = None

            if hasattr(model, "decision_function"):

                try:
                    score = model.decision_function(vector)

                # Handle binary and multiclass outputs
                    if hasattr(score, "ndim") and score.ndim > 1:
                        score = float(np.max(np.abs(score)))
                    else:
                        score = float(abs(score[0]))

                    confidence = min(score * 20, 99.9)

                except Exception as e:
                    st.error(f"Confidence Error: {e}")
                    confidence = None

                

            col1, col2 = st.columns(2)

            with col1:

                if result.lower() == "spam":

                    st.error(f"🚨 {result.upper()}")

                else:

                    st.success(f"✅ {result.upper()}")

            with col2:

                if confidence is not None:

                    st.metric(
                        "Confidence",
                        f"{confidence:.2f}%"
                    )

                else:

                    st.metric(
                        "Characters",
                        len(message)
                    )

            st.session_state.history.append({

                "Type": option,
                "Input": message[:80],
                "Prediction": result

            })

        else:

            st.warning("Please enter some text.")
    



# ==========================================
# URL Detection
# ==========================================


shorteners = [
    "bit.ly",
    "tinyurl.com",
    "goo.gl",
    "t.co",
    "is.gd",
    "ow.ly",
    "buff.ly",
    "cutt.ly",
    "rebrand.ly",
    "shorturl.at",
    "rb.gy",
    "lnkd.in"
]


def url_security(url):

    checks = []
    score = 0

    parsed = urlparse(url)

    if parsed.scheme != "https":
        score += 20
        checks.append("❌ Not using HTTPS")

    if re.search(r"\d+\.\d+\.\d+\.\d+", url):
        score += 25
        checks.append("⚠ Uses IP Address")

    if "@" in url:
        score += 20
        checks.append("⚠ Contains @ symbol")

    if len(url) > 75:
        score += 10
        checks.append("⚠ Very Long URL")

    if url.count("-") >= 3:
        score += 10
        checks.append("⚠ Multiple '-' characters")

    if any(shortener in url.lower() for shortener in shorteners):
        score += 25
        checks.append("⚠ Uses URL Shortener")

    suspicious_tlds = [
        ".xyz",
        ".top",
        ".click",
        ".zip",
        ".shop",
        ".buzz",
        ".online"
    ]

    for tld in suspicious_tlds:
        if url.lower().endswith(tld):
            score += 20
            checks.append(f"⚠ Suspicious TLD ({tld})")

    return score, checks
    

if option == "URL":

    st.subheader("🔗 URL Security Detection")

    url = st.text_input(
    "Enter URL",
    key=f"url_{st.session_state.reset_counter}",
    placeholder="https://example.com"
)

    if st.button("🛡 Check URL"):

        if url.strip():

            # ---------------- ML Prediction ----------------

            vector = url_vectorizer.transform([url])

            prediction = url_detector.predict(vector)[0]

            label_map = {
                0: "Phishing",
                1: "Safe",
                2: "Malware",
                3: "Defacement"
            }

            status = label_map[int(prediction)]

            if status == "Safe":

                st.success(f"✅ URL Status : {status}")

            else:

                st.error(f"🚨 URL Status : {status}")

            # ---------------- Security Analysis ----------------

            security_score, checks = url_security(url)

            if security_score <= 20:
                risk = "🟢 Low"

            elif security_score <= 50:
                risk = "🟡 Medium"

            else:
                risk = "🔴 High"

            st.divider()

            st.subheader("🛡 Security Analysis")

            col1, col2 = st.columns(2)

            with col1:
                st.metric(
                    "Risk Level",
                    risk
                )

            with col2:
                st.metric(
                    "Security Score",
                    f"{security_score}/100"
                )

            st.progress(
                min(security_score, 100) / 100
            )

            if checks:

                st.warning("Detected Security Issues")

                for item in checks:
                    st.write(item)

            else:

                st.success(
                    "✅ No suspicious URL patterns detected."
                )

            st.session_state.history.append({

                "Type": "URL",
                "Input": url,
                "Prediction": status

            })

        else:

            st.warning(
                "Please enter a URL."
            )


# ==========================================
# Bulk Prediction
# ==========================================

if option == "Bulk Prediction":

    st.subheader("📂 Bulk Spam Detection")

    uploaded_file = st.file_uploader(
        "Upload CSV / PDF / DOCX / TXT",
        type=["csv", "pdf", "docx", "txt"],
        key=f"bulk_upload_{st.session_state.reset_counter}"
    )

    if uploaded_file:
        ext = uploaded_file.name.split(".")[-1].lower()

        st.success(f"Uploaded : {uploaded_file.name}")

        # ---------------- CSV ----------------

        if ext == "csv":
            df = pd.read_csv(uploaded_file)

            st.dataframe(df.head())

            column = st.selectbox(
                "Select Text Column",
                df.columns
            )

            if st.button("Predict CSV"):

                X = vectorizer.transform(df[column].astype(str))

                pred = model.predict(X)

                predictions = encoder.inverse_transform(pred)

                scores = []
                risks = []

                for text in df[column].astype(str):

                    score, _, _ = analyze_text(text)

                    scores.append(score)

                    if score <= 20:
                        risks.append("🟢 Low")

                    elif score <= 50:
                        risks.append("🟡 Medium")

                    else:
                        risks.append("🔴 High")

                df["Prediction"] = predictions
                df["Threat Score"] = scores
                df["Risk"] = risks

                st.dataframe(df, use_container_width=True)

                st.subheader("📊 Summary")

                col1, col2, col3 = st.columns(3)

                with col1:
                    st.metric("Total Records", len(df))

                with col2:
                    st.metric(
                        "Spam",
                        (df["Prediction"].str.lower() == "spam").sum()
                    )

                with col3:
                    st.metric(
                        "Average Threat Score",
                        f"{sum(scores)/len(scores):.1f}"
                    )

                csv = df.to_csv(index=False).encode()

                st.download_button(
                    "⬇ Download Result",
                    csv,
                    "prediction.csv",
                    "text/csv"
                )

        # ---------------- TXT ----------------

        elif ext == "txt":
            text = uploaded_file.read().decode("utf-8")

            st.text_area("Preview", text, height=250)

            if st.button("Predict TXT"):

                vector = vectorizer.transform([text])

                pred = model.predict(vector)

                result = encoder.inverse_transform(pred)[0]

                st.success(f"Prediction : {result}")

                score, findings, words = analyze_text(text)

                st.subheader("🛡 Security Analysis")

                st.metric("Threat Score", f"{score}/100")

                if score <= 20:
                    st.success("🟢 Low Risk")

                elif score <= 50:
                    st.warning("🟡 Medium Risk")

                else:
                    st.error("🔴 High Risk")

        # ---------------- PDF ----------------

        elif ext == "pdf":

            text = ""

            with pdfplumber.open(uploaded_file) as pdf:

                for page in pdf.pages:

                    page_text = page.extract_text()

                    if page_text:
                        text += page_text + "\n"

            st.text_area("Preview", text, height=250)

            if st.button("Predict PDF"):

                vector = vectorizer.transform([text])

                pred = model.predict(vector)

                result = encoder.inverse_transform(pred)[0]

                st.success(f"Prediction : {result}")

                score, findings, words = analyze_text(text)

                st.subheader("🛡 Security Analysis")

                st.metric("Threat Score", f"{score}/100")

                if score <= 20:
                    st.success("🟢 Low Risk")

                elif score <= 50:
                    st.warning("🟡 Medium Risk")

                else:
                    st.error("🔴 High Risk")

        # ---------------- DOCX ----------------

        elif ext == "docx":

            doc = Document(uploaded_file)

            text = "\n".join(
                p.text for p in doc.paragraphs
            )

            st.text_area("Preview", text, height=250)

            if st.button("Predict DOCX"):

                vector = vectorizer.transform([text])

                pred = model.predict(vector)

                result = encoder.inverse_transform(pred)[0]

                st.success(f"Prediction : {result}")

                score, findings, words = analyze_text(text)

                st.subheader("🛡 Security Analysis")

                st.metric("Threat Score", f"{score}/100")

                if score <= 20:
                    st.success("🟢 Low Risk")

                elif score <= 50:
                    st.warning("🟡 Medium Risk")

                else:
                    st.error("🔴 High Risk")




if st.button("🔄 Reset"):

    st.session_state.history = []

    st.session_state.reset_counter += 1

    st.rerun()
# ==========================================
# Prediction History
# ==========================================

if st.session_state.history:

    st.divider()

    st.subheader("📜 Recent Predictions")

    history_df = pd.DataFrame(
        st.session_state.history
    )

    st.dataframe(
        history_df,
        use_container_width=True,
        hide_index=True
    )

    col1, col2 = st.columns(2)

    with col1:

        st.metric(
            "Total Predictions",
            len(history_df)
        )

    with col2:

        spam_count = (
            history_df["Prediction"]
            .astype(str)
            .str.lower()
            .isin(["spam", "phishing", "malware", "defacement"])
            .sum()
        )

        st.metric(
            "Threats Detected",
            spam_count
        )

    csv = history_df.to_csv(index=False).encode("utf-8")

    st.download_button(
        "⬇ Download History",
        csv,
        "prediction_history.csv",
        "text/csv"
    )


# ==========================================
# Footer
# ==========================================

st.divider()

st.markdown(
    """
---
<center>

### 🛡 Spam Detection System

AI-powered detection for **Email**, **SMS**, **URLs**, and **Bulk Files**.

© 2026 Spam Detection System | All Rights Reserved

</center>
""",
    unsafe_allow_html=True
)