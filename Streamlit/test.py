import joblib

files = [
    "models/linear_svm_model.pkl",
    "models/tfidf_vectorizer.pkl",
    "models/label_encoder.pkl",
    "models/url_detector.pkl",
    "models/url_vectorizer.pkl"
]


for f in files:
    try:
        obj = joblib.load(f)
        print(f, "✅ Loaded")
    except Exception as e:
        print(f, "❌ Error:", e)