# 📧 Spam Detection System

An AI-powered Spam Detection System built with **Streamlit** and **Machine Learning** to identify spam across multiple communication channels. The application detects spam in **Emails**, **SMS messages**, **URLs**, and supports **Bulk Prediction** for uploaded files.

---

## 🚀 Features

* 📧 Email Spam Detection
* 📱 SMS Spam Detection
* 🔗 URL Threat Detection
* 📂 Bulk Prediction (CSV, TXT, PDF, DOCX)
* 🛡 Rule-Based Security Analysis
* 📊 Threat Score Calculation
* ⚠ Risk Level Classification (Low / Medium / High)
* 📜 Prediction History
* 📥 Download Prediction Results (CSV)

---

## 🧠 Machine Learning Models

### Text Spam Detection

* TF-IDF Vectorizer
* Linear Support Vector Machine (Linear SVM)

### URL Detection

* TF-IDF Vectorizer
* Random Forest Classifier

---

## 🔒 URL Security Analysis

Apart from ML prediction, the application performs additional security checks including:

* HTTPS Validation
* IP Address Detection
* URL Shortener Detection
* Suspicious Top-Level Domains (TLDs)
* '@' Symbol Detection
* Excessive Hyphens
* Long URL Detection

Each URL receives a **Threat Score** and **Risk Level**.

---

## 📂 Supported File Formats

* CSV
* TXT
* PDF
* DOCX

---

## 📊 Bulk Prediction

Bulk Prediction enables users to upload multiple messages for analysis.

For every record, the application provides:

* Spam Prediction
* Threat Score
* Risk Level

The processed results can be downloaded as a CSV file.

---

## 🛠 Tech Stack

* Python
* Streamlit
* Scikit-learn
* Pandas
* NumPy
* Joblib
* PDFPlumber
* python-docx

---

## 📦 Installation

Clone the repository:

```bash
git clone https://github.com/your-username/spam-detection-system.git
cd spam-detection-system
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the application:

```bash
streamlit run app.py
```

---

## 📁 Project Structure

```text
Spam-Detection-System/
│
├── app.py
├── requirements.txt
├── README.md
│
├── models/
│   ├── linear_svm_model.pkl
│   ├── tfidf_vectorizer.pkl
│   ├── label_encoder.pkl
│   ├── url_detector.pkl
│   └── url_vectorizer.pkl
│
└── assets/
```

---

## 🎯 Future Improvements

* Gmail Integration
* Outlook Integration
* Real-Time Email Scanning
* Browser Extension
* QR Code URL Scanner
* Phishing Website Detection
* AI Explainable Predictions
* Dashboard & Analytics
* User Authentication
* Cloud Database Support

---

## 📄 License

This project is intended for educational, research, and demonstration purposes.

---

## 👨‍💻 Author

**Aditya Sharma**

If you found this project useful, consider giving it a ⭐ on GitHub.
