[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![Docker Build](https://github.com/Userunknown84/Spam-Detection-System/actions/workflows/docker.yml/badge.svg)

# 🚀 Spam Detection System

A full-stack application that detects **Spam / Smishing / Offensive content** using Machine Learning.
The system includes:

* 🧠 ML Model (Python)
* ⚡ Python API (Flask / FastAPI)
* 🌐 Node.js Backend
* 💻 React Web App
* 📱 React Native Mobile App (Android & iOS)

---

## 📌 Project Architecture

```
User Input (Web / Mobile)
        ↓
React / React Native UI
        ↓
Node.js Backend (API Gateway)
        ↓
Python ML API (Model Inference)
        ↓
Prediction (Spam / Ham / Offensive)
```

---
## Routes

Python: (http://localhost:5000 or http://127.0.0.1:5000)
Node: (http://localhost:3000)
Reactjs: (http://localhost:5173)


---
## System Stability & Environment Fixes
This update addresses critical runtime issues that prevented the system from executing in the local development environment:

* **Security Policy Compliance:** Migrated the project to a directory with appropriate execution permissions to resolve `DLL load` errors.
* **Model Loading Error:** Corrected file path references to ensure the ML models are properly detected at runtime.
* **API Stability:** Fixed `500 Internal Server Error` by correctly serializing NumPy model outputs to JSON.

For a detailed breakdown, please refer to the recently merged Pull Request.

## 🧠 Machine Learning Model

### 📊 Dataset

* CSV format:

  * `text` / `message`
  * `label` (spam / ham / offensive)

### ⚙️ Algorithms Used

* Logistic Regression
* Naive Bayes
* Linear SVM (Best Accuracy)

### 📈 Performance

* Accuracy: ~97–98%
* Metrics:

  * Precision
  * Recall
  * F1-score
  * Confusion Matrix

---

### 🏋️ Model Training (Python)

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
import pickle

# Load dataset
X = df['text']
y = df['label']

# Vectorization
vectorizer = TfidfVectorizer()
X_vec = vectorizer.fit_transform(X)

# Model
model = LinearSVC()
model.fit(X_vec, y)

# Save
pickle.dump(model, open("model.pkl", "wb"))
pickle.dump(vectorizer, open("vectorizer.pkl", "wb"))
```

---
## Url Model
This project uses a **Logistic Regression** classifier to detect whether a URL is **Safe** or **Malicious**.

### Model
- **Algorithm:** Logistic Regression
- **Library:** Scikit-learn
- **Max Iterations:** 1000
- **Class Weight:** Balanced
- **Random State:** 42

### Feature Extraction
URLs are converted into numerical features using **TF-IDF (Term Frequency–Inverse Document Frequency)**.

- **Vectorizer:** TF-IDF
- **Analyzer:** Character-level
- **N-gram Range:** 3–5
- **Maximum Features:** 30,000

Character-level n-grams help capture patterns commonly found in malicious URLs, such as suspicious keywords, unusual domain names, and obfuscated URL structures.

### Dataset Labels

| Original Label | Binary Label |
|----------------|--------------|
| benign         | Safe (0)     |
| phishing       | Malicious (1)|
| malware        | Malicious (1)|
| defacement     | Malicious (1)|


### Saved Files

- `url_detector.pkl` – Trained Logistic Regression model.
- `url_vectorizer.pkl` – TF-IDF vectorizer used during prediction.

Accuracy: 0.9848841744013728
---

## 🐍 Python API (Flask)

### Running the Backend API

This project contains two backend implementations. You can choose to run either Flask or FastAPI.

**Option 1: Running Flask (api.py)**
```bash
cd backend
python api.py
```

The Flask ML API binds to `127.0.0.1` (localhost only) with the debugger
disabled by default. These are controlled via environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLASK_PORT` | `5000` | Port the API listens on. |
| `FLASK_HOST` | `127.0.0.1` | Interface to bind. Use `0.0.0.0` to expose on all interfaces **only behind a trusted proxy**. |
| `FLASK_DEBUG` | `false` | Enables the Werkzeug debugger. Keep off outside local development — it allows remote code execution. |

> ⚠️ Never run with `FLASK_DEBUG=true` while bound to a non-loopback host. The
> app refuses to start for that combination to prevent exposing the interactive
> debugger over the network.

### 📦 Install Dependencies

```bash
pip install flask scikit-learn
```

### 🚀 API Code

```python
from flask import Flask, request, jsonify
import pickle

app = Flask(__name__)

model = pickle.load(open("model.pkl", "rb"))
vectorizer = pickle.load(open("vectorizer.pkl", "rb"))

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json['text']
    vec = vectorizer.transform([data])
    prediction = model.predict(vec)[0]
    return jsonify({"result": prediction})

if __name__ == "__main__":
    app.run(port=5000)
```

---

## 🌐 Node.js Backend

### 📦 Install

```bash
npm install express axios cors
```

## 🧠 Explainable AI (XAI)

The Spam Detection System now returns human-readable explanation details with every prediction. This includes example reasons, matched spam keywords, triggered spam indicators, and a risk score.

### 🧾 Prediction API Response

```json
{
  "input": "Claim your reward now!",
  "result": "spam",
  "prediction": "spam",
  "confidence": 1.2345,
  "domain_analysis": {
    "domains_found": [],
    "max_risk_score": 0,
    "overall_risk": "SAFE",
    "details": []
  },
  "explanation": {
    "score": 94,
    "reasons": [
      "Suspicious URL detected",
      "Promotional keywords found",
      "Urgency language detected"
    ],
    "matched_keywords": [
      "claim",
      "reward",
      "free"
    ],
    "spam_patterns": {
      "urls": true,
      "capitalization": false,
      "punctuation": false,
      "urgency": true,
      "promotional": true,
      "financial": false,
      "banking": false,
      "otp": false,
      "crypto": false,
      "lottery": false,
      "threat": false,
      "emoji": false,
      "suspicious_domain": false,
      "phone_number": false,
      "shortened_url": false
    },
    "num_indicators": 3,
    "top_indicators": [
      "Suspicious URL detected",
      "Promotional keywords found",
      "Urgency language detected"
    ],
    "summary": "3 indicators triggered"
  }
}
```

### 💡 Example Request

```bash
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"Urgent! Claim your prize now at https://bit.ly/offer","type":"message"}'
```

### 📌 Notes

* The response is backward compatible with existing integrations.
* `result` and `prediction` both return the same label.
* `explanation` is optional in older API clients, but modern clients can use it to display detailed spam reasoning.

## Mongo Db Atlas Backend
.env

MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/spamdetection?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d



### ⚙️ Server Code

```javascript
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/predict", async (req, res) => {
  try {
    const response = await axios.post("http://localhost:5000/predict", {
      text: req.body.text,
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).send("Error");
  }
});

app.listen(3000, () => console.log("Node server running"));
```

## Rate Limiting

Prediction endpoints are protected against abuse using
`express-rate-limit`.

Default configuration:

```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

When the limit is exceeded the API returns:

`HTTP 429 Too Many Requests`

---

## 💻 React Frontend

### 📦 Setup

```bash
npm create vite@latest
npm install axios
```

### ⚛️ Example Component

```javascript
import { useState } from "react";
import axios from "axios";

function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");

  const handlePredict = async () => {
    const res = await axios.post("http://localhost:3000/predict", { text });
    setResult(res.data.result);
  };

  return (
    <div>
      <h1>Spam Detection</h1>
      <input onChange={(e) => setText(e.target.value)} />
      <button onClick={handlePredict}>Check</button>
      <p>{result}</p>
    </div>
  );
}

export default App;
```

---

## 📱 React Native App (Android & iOS)

### 📦 Setup

```bash
npx create-expo-app
npm install axios
```

### 📲 Example Code

```javascript
import { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import axios from "axios";

export default function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");

  const predict = async () => {
    const res = await axios.post("http://YOUR_IP:3000/predict", { text });
    setResult(res.data.result);
  };

  return (
    <View>
      <Text>Spam Detection</Text>
      <TextInput onChangeText={setText} />
      <Button title="Check" onPress={predict} />
      <Text>{result}</Text>
    </View>
  );
}
```
---

## 🗄️ Email Classification Database (FastAPI)

A MySQL-based system to store and manage classified email records (located in `fastapi_backend/`).

### Database Setup

```bash
mysql -u root -p < fastapi_backend/schema.sql
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/emails/` | Insert new email record |
| PATCH | `/api/emails/{id}/mark` | Mark as spam or legitimate |
| GET | `/api/emails/spam` | Retrieve all spam emails |
| GET | `/api/emails/legitimate` | Retrieve all legitimate emails |
| GET | `/api/emails/count/spam` | Count total spam emails |
| GET | `/api/emails/count/legitimate` | Count total legitimate emails |

### Export Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/emails/export?format=csv` | Download all emails as CSV |
| GET | `/api/emails/export?format=pdf` | Download all emails as PDF report |

### CSV Export Format
email_id, subject, sender, is_spam, timestamp
1, Win a FREE iPhone!!!, promo@spam.com, Spam, 2024-01-01 10:00:00
2, Team standup at 10am, manager@company.com, Legitimate, 2024-01-01 11:00:00

### PDF Report Includes
- Summary: total emails, spam count, legitimate count
- Full table with all email records

### Email Record Fields

- `email_id` — Auto-generated unique ID
- `subject` — Email subject
- `sender` — Sender email address
- `is_spam` — Boolean spam status
- `timestamp` — Record creation time

---

## 🔁 User Feedback Loop

After every prediction, the web app asks **"Was this prediction correct?"**:

* ✅ **Yes** — records the prediction as confirmed correct
* ❌ **No** — shows a dropdown to pick the correct label (`ham`, `spam`, `smishing`), then submits the correction

### How it flows

```
React Widget → POST /feedback (Node backend) → POST /feedback (Flask ML API) → feedback_store.csv
```

### `POST /feedback`

Available on both the Node backend (`/feedback`, requires authentication) and the Flask ML API (`/feedback`).

**Request body:**
```json
{
  "text": "Congratulations! You won a free prize, click here",
  "predicted_label": "ham",
  "correct_label": "spam"
}
```

**Responses:**
* `201` — `{"message": "Feedback recorded. Thank you!"}`
* `400` — `{"error": "Invalid feedback data"}` if `text` is empty or `correct_label` is not one of `ham`, `spam`, `smishing`

Feedback is appended to `backend/feedback_store.csv` (gitignored) with columns:

| Column | Description |
|--------|-------------|
| `text` | The original input text |
| `predicted_label` | What the model predicted |
| `correct_label` | What the user said it should be |
| `submitted_at` | UTC timestamp |

### Retraining the model

Once enough feedback has accumulated, run:

```bash
cd backend
python retrain.py
```

This merges `feedback_store.csv` with the original training dataset (`DATASET_PATH`, default `dataset.csv`), retrains the TF-IDF vectorizer, LinearSVC model and label encoder, and overwrites `linear_svm_model.pkl`, `tfidf_vectorizer.pkl` and `label_encoder.pkl`.

---
## .env.example (Frontend)
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
VITE_API_URI=http://localhost:3000
VITE_PYTHON_URI=http://127.0.0.1:5000

---

## .env.example (Backend)
DATABASE_PATH=spam_detection.db
API_KEY=
BASE_URL=http://localhost:8000
PORT=8000
FRONTEND_URL=http://localhost:5173
FRONTEND_DEV_URL=http://localhost:3000
FLASK_PORT=5000
# Flask ML API debugger. Keep this OFF (false) outside local development — the
# Werkzeug debugger allows remote code execution. Accepts 1/true/yes/on.
FLASK_DEBUG=false
# Interface the Flask ML API binds to. Defaults to localhost only. Set to
# 0.0.0.0 to expose on all interfaces (only do this behind a trusted proxy and
# never together with FLASK_DEBUG=true — the app will refuse to start).
FLASK_HOST=127.0.0.1
MODEL_PATH=linear_svm_model.pkl
VECTORIZER_PATH=tfidf_vectorizer.pkl
LABEL_ENCODER_PATH=label_encoder.pkl
URL_MODEL_PATH=url_detector.pkl
URL_VECTORIZER_PATH=url_vectorizer.pkl
CLIENT_URL=http://localhost:3000
PASSWORD_RESET_TOKEN_EXPIRES=15m
EMAIL_FROM="Spam Detection System <noreply@example.com>"
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here

# MongoDB (used for scan history / analytics dashboard)
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority

# Default Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_USERNAME=admin
# IMAP scheduled scanning (issue #186) — used to encrypt stored inbox credentials at rest.
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
IMAP_ENCRYPTION_KEY=G2upyOUQyViHzWnWDY5m_DuHFTRaxkdyDnoYtLkTwUk=
# Where the sqlite store for IMAP connections/scan history lives (defaults to backend/imap_connections.db)
IMAP_DB_PATH=

# Shared secret authenticating Node→Flask requests. MANDATORY: the Flask ML API
# refuses to start if this is missing or shorter than 32 characters, and there
# is no default. Set the SAME value here as in the Node service's .env.
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
INTERNAL_SECRET=

---

## 🔐 Features

* ✅ Spam / Smishing Detection
* ✅ Offensive Content Classification
* ✅ Real-time Prediction API
* ✅ Cross-platform (Web + Mobile)
* ✅ Scalable Architecture

---

## 🛡️ Email Header Analysis for Sender Verification

Features:
* **SPF validation**: Verifies if the email sender is authorized by the domain's SPF records.
* **DKIM validation**: Confirms the email signature matches the sender's public keys.
* **DMARC validation**: Validates whether alignment passes based on SPF/DKIM verification results.
* **Return-Path analysis**: Checks for mismatches between the `From` address domain and `Return-Path` domain.
* **Sender verification**: Identifies display name domain mismatch or domain alignment anomalies.

### Scoring Logic
* SPF Failure: +30 points
* DKIM Failure: +30 points
* DMARC Failure: +30 points
* Return-Path Mismatch: +20 points
* Domain Mismatch: +20 points

### Trust Levels
* `0–20` score: **Trusted**
* `21–60` score: **Suspicious**
* `61+` score: **High Risk**

### Endpoint

#### `POST /analyze-email-header`
Supports both Option A (JSON body) and Option B (`multipart/form-data` with EML file upload).

**Request (Option A - JSON):**
```json
{
  "headers": "From: Alice <alice@example.com>\nReturn-Path: <spammer@evil.com>..."
}
```

**Request (Option B - multipart/form-data):**
Submit files (EML format) under key `file`.

**Response:**
```json
{
  "success": true,
  "trust_level": "Suspicious",
  "risk_score": 45,
  "findings": [
    "SPF validation failed",
    "Return-Path mismatch detected"
  ]
}
```

---

## 📬 Gmail & Outlook Integration for Automatic Email Scanning

Allows users to link their Gmail and Outlook accounts securely via OAuth 2.0 and automatically scan the latest incoming emails.

### Features
* **OAuth 2.0 Integration**: Authorize with Google and Microsoft to scan live inboxes.
* **Inline Risk Scoring**: Integrates directly with the Sender Verification analysis module to show trust levels (Trusted, Suspicious, High Risk) for each email based on SPF, DKIM, and DMARC headers.
* **Aggregated Insights**: Displays metrics cards showing Total, Spam/Risk, and Clean emails in the scanned inbox batch.
* **Collapsible Email Reports**: Expand any scanned email to view the snippet and domain alignment validation details.

### Environment Setup

Add these credentials to your backend `.env` file:
```env
# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft Graph OAuth 2.0 Credentials
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
```

### Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/gmail/auth-url` | Protected | Returns the Google OAuth 2.0 consent page URL |
| `GET` | `/gmail/connect` | Protected | Exchanges the authorization code for Gmail access/refresh tokens |
| `GET` | `/gmail/emails` | Protected | Fetches up to 50 of the latest Gmail emails |
| `GET` | `/outlook/auth-url` | Protected | Returns the Microsoft Graph OAuth 2.0 consent page URL |
| `GET` | `/outlook/connect` | Protected | Exchanges the authorization code for Microsoft Graph tokens |
| `GET` | `/outlook/emails` | Protected | Fetches up to 50 of the latest Outlook emails |
| `POST` | `/scan-emails` | Protected | Fetches latest emails for provider and runs ML classification and header verification |

---

## 🧠 Spam Pattern Insights & Analytics Dashboard

Features:
* **Top keywords frequency**: Displays the most common keywords associated with threats.
* **Trending phrases**: Analyzes bigrams/trigrams to identify key word sequences in spam (e.g. `claim your prize`).
* **Suspicious terms tracking**: Extracts recently flagged tokens from threat classifications.
* **Category indicators**: Groups common threat indicators by category (Spam, Smishing, Offensive).

### Endpoint

#### `GET /spam-insights`
Available on both the Node backend (`/spam-insights`, requires authentication) and the Flask ML API (`/spam-insights`).

**Query Parameters:**
- `limit` (optional, default: 10): Limits the number of keywords/phrases returned.
- `category` (optional, e.g. `spam`): Filters the source metrics to a specific threat category.

**Example Response:**
```json
{
  "top_keywords": [
    {"keyword": "free", "count": 45},
    {"keyword": "prize", "count": 35}
  ],
  "trending_phrases": [
    {"phrase": "click here now", "count": 25},
    {"phrase": "claim your prize", "count": 20}
  ],
  "recent_suspicious_terms": [
    "crypto giveaway",
    "verify wallet"
  ],
  "category_indicators": {
    "spam": ["free", "prize", "winner"],
    "smishing": ["otp", "verify", "bank"],
    "offensive": ["abusive", "hate"]
  }
}
```

---

## 📁 Bulk Spam Detection

Features:
* **CSV upload**: Upload a CSV file containing either a `text` or `message` column header (case-insensitive) to run batch predictions.
* **TXT upload**: Upload a TXT file containing one message per non-empty line.
* **Bulk predictions**: Batch inference is performed efficiently on the ML model.
* **Detection statistics**: Displays total messages, spam/non-spam counts, and spam percentages.
* **CSV report export**: Downloadable CSV file containing the original message and predicted classification.

### Endpoints

#### `POST /bulk-predict`
Requires `multipart/form-data` file upload with a key name of `file`.

**Example Response:**
```json
{
  "total_messages": 3,
  "spam_count": 2,
  "non_spam_count": 1,
  "spam_percentage": 66.67,
  "results": [
    {
      "message": "Congratulations! You won a free prize",
      "prediction": "spam"
    },
    {
      "message": "Meeting tomorrow at 10am",
      "prediction": "ham"
    }
  ]
}
```

#### `POST /bulk-predict/export`
Requires `multipart/form-data` file upload with a key name of `file`. Returns a downloadable CSV report file:
```csv
message,prediction
Congratulations! You won a free prize,spam
Meeting tomorrow at 10am,ham
```

---

## 🎨 Theme Customization System

The frontend now includes a fully customizable theme system that allows users to personalize the application's appearance.

## Features
Added 5 unique themes:
Ocean
Sunset
Forest
Purple
Mono

## Theme selector accessible through the 🎨 Theme button in the top-right corner.
Full support for Light Mode and Dark Mode across all themes.
Dynamic adaptation of:
Background gradients
Cards and panels
Buttons and accent colors
Interactive UI elements
Theme preferences are maintained throughout the user's active session.
Seamless theme switching without affecting application functionality.


---

## 🛠 Tech Stack

* Python (ML + API)
* Scikit-learn
* Flask
* Node.js
* Express
* React
* React Native
* Axios

---

## Spam Detection Inbox Scanner (Browser Extension)

Chrome/Firefox extension (Manifest V3) that scans visible Gmail and Outlook web
messages and shows an inline spam/smishing/offensive badge, using the existing
Spam Detection System classification API as its backend. Implements issue #187.

## How it works

- Content scripts (`src/content/gmail.js`, `src/content/outlook.js`) find
  message rows in the inbox list, extract the subject + preview text, and ask
  the background service worker to classify it.
- The background service worker (`src/background.js`) holds the API base URL
  and an account token (set via the options page) and calls the existing
  `POST /predict` endpoint on the Node backend.
- Results are cached **in memory only**, per page load, keyed by the
  provider's own message/thread id. Reloading the tab clears the cache.
- Each badge has a rescan (↻) and dismiss (✕) control.

## Install (development / unpacked)

This extension is not on the Chrome Web Store or Firefox AMO — it ships as
source code in this repo, inside the `extension/` folder. You need that
folder on your local disk before a browser can load it.

### Step 1: Get the `extension/` folder onto your machine

Pick whichever is easiest for you:

- **Clone the whole repo (recommended if you'll also run the backend):**
  ```sh
  git clone https://github.com/Rudra-clrscr/Spam-Detection-System.git
  cd Spam-Detection-System
  git checkout feature/187-browser-extension
  ```
  The extension lives at `Spam-Detection-System/extension`.

- **Download just this PR's `extension/` folder as a zip, no git required:**
  1. Go to <https://download-directory.github.io/>
  2. Paste this URL and press enter:
     `https://github.com/Rudra-clrscr/Spam-Detection-System/tree/feature/187-browser-extension/extension`
  3. Unzip the downloaded file.



### Step 2: Load it into your browser

**Chrome / Edge / Brave:**
1. Go to `chrome://extensions`, enable "Developer mode" (toggle, top-right).
2. Click "Load unpacked" and select the `extension/` folder (the one
   containing `manifest.json` directly — not its parent).
3. You should see "Spam Detection Inbox Scanner" appear in the list with a
   purple envelope icon and no error badge.

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on…" and select `extension/manifest.json`.
   (Temporary add-ons are removed when Firefox restarts — see
   [web-ext](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
   for a persistent dev workflow.)

## Configure

1. Click the extension icon → "Open settings".
2. Set the API base URL (defaults to `http://localhost:3000`, the Node
   gateway used by the rest of this project).
3. Log into the Spam Detection web app. If it's running locally at
   `localhost:5173` (the Vite dev default), a content script
   (`src/content/webapp-bridge.js`) picks up your login token from
   `localStorage` automatically within a few seconds — no manual step needed.
   Otherwise, open devtools on the web app's page, run
   `localStorage.getItem('token')`, and paste the result into "Account token".

If you deploy the frontend or backend somewhere other than `localhost`, add
that origin to `host_permissions`/the relevant `content_scripts.matches`
entry in `manifest.json` before loading the extension (or use
`chrome.permissions.request` — out of scope for this first pass).

## Privacy

- Only the subject + a short preview snippet (truncated to 500 characters) is
  sent to the classification API per message — never the full message body.
- Classification results are kept in memory only, scoped to the current page
  load. Nothing is written to `chrome.storage` or disk except your API base
  URL and account token (used to authenticate to your own backend).
- Dismissing a flag only affects local in-memory state; it does not call the
  backend.

## Known limitations

- Gmail/Outlook DOM selectors (`src/content/gmail.js`, `src/content/outlook.js`)
  are based on current unofficial markup and **will break** if Google/Microsoft
  change their markup. If badges stop appearing, inspect a message row in
  devtools and update the selectors at the top of the relevant file.
- Loaded unpacked against a real, logged-in Gmail inbox: badges rendered on
  visible rows, and the classification pipeline (content script → background
  worker → Node `/predict` → Flask ML API) was confirmed via backend logs to
  return real Safe/Spam/Smishing predictions for real message subjects/
  previews. Visual confirmation that every badge displays the correct label
  in the browser (vs. a stale/failed state) is still pending re-check after
  a backend restart during testing. Outlook web has not been separately
  verified live — its selectors are still best-effort.
- A failed scan (e.g. backend temporarily unreachable) renders a "Scan
  failed" badge and is **not cached**, so it retries automatically the next
  time the inbox DOM updates — this is intentional, not a bug, but can look
  alarming if every row shows it briefly while the backend is still starting
  up.

## Publishing (optional follow-up)

This PR ships the extension as source only — it is not published to any
store. Getting a one-click "Add to Chrome"/"Add to Firefox" install requires
the project maintainer to submit it under their own developer account. Draft
listing copy, a privacy policy, permission justifications, and icons are in
`store-listing/` and `icons/` to make that easier later; real screenshots
still need to be captured from a live browser session (see
`store-listing/screenshots/README.md`).

## Tests

Pure logic (caching, text truncation, badge mapping) is covered by
`node --test`:

```sh
cd extension
npm test
```

DOM scanning and the background/options/popup UI require a real browser and
are not covered by automated tests in this PR.


---

## 📌 Future Improvements

*  Use Deep Learning (LSTM / BERT / CLIP)
*  Multilingual Support
*  More accuracy and advanced model 
* Include Email predicton perfectly and add mobile numbers also to track
* Include Url prediction perfectly to check url is safe or not

---

## 🐳 Running with Docker

> ✅ All three images (`ml-api`, `node-backend`, `frontend`) are automatically built and the ML API is smoke-tested via [GitHub Actions](.github/workflows/docker.yml) on every push and pull request to `main`, so the Dockerfiles always stay in sync with the latest code.

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

### 🔧 Environment Configuration

Before running `docker-compose up`, create a `.env` file in the project root with the following required variables:

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `JWT_SECRET` | Secret key for JWT token generation | ✅ Yes | `your-super-secret-jwt-key-12345` |
| `MONGODB_URI` | MongoDB connection string | ✅ Yes | `mongodb://localhost:27017/spam-detection` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | ✅ Yes | `123456789-abcdefg.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | ✅ Yes | `GOCSPX-abcdefghijklmnop` |
| `API_URL` | ML Prediction API URL | ✅ Yes | `http://localhost:5000/predict` |
| `FRONTEND_URL` | Frontend URL | ✅ Yes | `http://localhost:5173` |
| `VITE_API_URI` | Backend API URL (Frontend) | ✅ Yes | `http://localhost:3000/api` |


# Frontend
VITE_API_URI=http://localhost:3000/api
VITE_ML_API_URI=http://localhost:5000/predict

### Docker Hub Images

Pre-built images are available — no build step required:

| Service | Docker Hub |
|---|---|
| Flask ML API | [rudra2006/spam-ml-api](https://hub.docker.com/r/rudra2006/spam-ml-api) |
| Node.js Backend | [rudra2006/spam-node-backend](https://hub.docker.com/r/rudra2006/spam-node-backend) |
| React Frontend | [rudra2006/spam-frontend](https://hub.docker.com/r/rudra2006/spam-frontend) |

### Quick Start (New Users — No Clone Needed)

Images are pre-built on Docker Hub. Just download the compose file and run:

```bash
curl -O https://raw.githubusercontent.com/Userunknown84/Spam-Detection-System/main/docker-compose.yml
docker-compose up
```

Docker will automatically pull all 3 images. No build step, no clone required.

### Quick Start (From Source)

```bash
git clone https://github.com/Userunknown84/Spam-Detection-System.git
cd Spam-Detection-System
docker-compose up --build
```

| Service | URL |
|---|---|
| React Frontend | http://localhost |
| Node.js Backend | http://localhost:3000 |
| Flask ML API | http://localhost:5000 |

### Stop all containers
```bash
docker-compose down
```

### Architecture in Docker

```
Browser → nginx (port 80) → node-backend (port 3000) → ml-api (port 5000)
```

- **ml-api**: Python Flask service that loads the SVM model and serves `/predict`
- **node-backend**: Node.js API gateway forwarding requests to ml-api
- **frontend**: React app built with Vite, served via nginx; nginx proxies `/predict` to node-backend

---

## 👨‍💻 Author

Aditya Sharma

---

## ⭐ Contribute

Feel free to fork, improve and contribute to this project!

---

## 📜 License

This project is open-source and available under the GPL-3.0 License.

You are free to use, modify, and distribute this project for personal or commercial use, provided that proper credit is given.

For more details, see the [LICENSE](https://www.gnu.org/licenses/gpl-3.0) file.
