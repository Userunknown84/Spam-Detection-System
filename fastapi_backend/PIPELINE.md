# 5-Step Spam Detection Pipeline

This document describes the advanced spam detection pipeline architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     STEP 1: Raw Input                           │
│                   (Raw Email Text)                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                 STEP 2: Text Vectorization                       │
│              (TF-IDF Vectorizer: max_features=2000)             │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────▼──────────────┐      ┌──────────▼─────────────┐
│    STEP 3a:          │      │    STEP 3b:            │
│  Linear SVM          │      │ Metadata Extraction    │
│ Parallel Processing  │      │   • Text Length        │
│  Generates:          │      │   • Link Count         │
│  Spam Score          │      │   • Exclamation Count  │
└───────┬──────────────┘      └──────────┬─────────────┘
        │                                 │
        └────────────────┬────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              STEP 4: Feature Fusion                              │
│     (Combine Spam Score + Metadata Features)                    │
│   Creates feature vector for final classification              │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│           STEP 5: Final Classification                           │
│                                                                  │
│   Primary: XGBoost Model                                         │
│   Fallback: Linear SVM                                           │
│                                                                  │
│   Output: Spam / Ham (with confidence)                          │
└──────────────────────────────────────────────────────────────────┘
```

## Component Details

### Step 1: Raw Input
- Accepts raw email text as string input
- Validates input is non-empty and properly formatted

### Step 2: Text Vectorization
- Uses TF-IDF (Term Frequency-Inverse Document Frequency) vectorizer
- Configuration: `max_features=2000`
- Converts raw text into numerical feature vectors

### Step 3: Parallel Processing
Runs two operations in parallel:

**3a. Linear SVM Classifier**
- Generates spam score using decision function
- Score indicates likelihood of being spam
- Higher absolute value = higher confidence

**3b. Metadata Extraction**
- **Text Length**: Total character count
- **Link Count**: Number of URLs detected
- **Exclamation Count**: Number of exclamation marks
- **Word Count**: Number of words
- **Uppercase Ratio**: Proportion of uppercase characters
- **Special Character Count**: Non-alphanumeric characters

### Step 4: Feature Fusion
Combines outputs from Step 3:
- Spam score from SVM
- All metadata features
- Engineered features:
  - Normalized text length
  - Link score (capped at 1.0)
  - Exclamation score (capped at 1.0)

### Step 5: Final Classification
**Primary Classifier: XGBoost**
- Uses fused features from Step 4
- Provides probability-based confidence scores
- Supports multi-class classification

**Fallback Classifier: Linear SVM**
- Used if XGBoost model unavailable
- Falls back automatically on error
- Returns decision-function confidence

## API Endpoints

### Traditional Prediction
```
POST /predict
```

Uses only Linear SVM model (legacy endpoint).

**Request:**
```json
{
  "text": "Your email text here",
  "type": "email"
}
```

**Response:**
```json
{
  "prediction": "spam",
  "confidence": 0.8532
}
```

### Pipeline-Based Prediction
```
POST /predict-pipeline
```

Uses the complete 5-step pipeline architecture.

**Request:**
```json
{
  "text": "Your email text here",
  "type": "email"
}
```

**Response:**
```json
{
  "prediction": "spam",
  "confidence": 0.8532,
  "spam_score": 1.2345,
  "metadata": {
    "text_length": 245.0,
    "link_count": 2.0,
    "exclamation_count": 1.0,
    "word_count": 42.0,
    "uppercase_ratio": 0.15,
    "special_char_count": 12.0
  },
  "fused_features": {
    "spam_score": 1.2345,
    "text_length": 245.0,
    "link_count": 2.0,
    "exclamation_count": 1.0,
    "word_count": 42.0,
    "uppercase_ratio": 0.15,
    "special_char_count": 12.0,
    "text_length_normalized": 0.0245,
    "link_score": 0.4,
    "exclamation_score": 0.1
  }
}
```

## Usage Example

```python
from fastapi_backend.pipeline import SpamDetectionPipeline
import joblib

# Load models
model = joblib.load("linear_svm_model.pkl")
vectorizer = joblib.load("tfidf_vectorizer.pkl")
label_encoder = joblib.load("label_encoder.pkl")
xgboost_model = joblib.load("xgboost_model.pkl")  # Optional

# Initialize pipeline
pipeline = SpamDetectionPipeline(
    svm_model=model,
    tfidf_vectorizer=vectorizer,
    xgboost_model=xgboost_model,
    label_encoder=label_encoder
)

# Process text
result = pipeline.process("Your email text here")

# Results include:
# - prediction: Final classification
# - confidence: Confidence score
# - spam_score: SVM decision function output
# - metadata: Extracted features
# - fused_features: Combined feature set
```

## Dependencies

- `scikit-learn`: TF-IDF vectorizer and Linear SVM
- `xgboost`: Final classification (optional)
- `numpy`: Numerical operations
- `concurrent.futures`: Parallel processing

## Performance Notes

- **Parallel Processing**: SVM and metadata extraction run concurrently in Step 3
- **Memory Efficient**: Processes text sequentially, no batch requirements
- **Fallback Support**: Gracefully falls back to SVM if XGBoost unavailable
- **Logging**: Detailed logging at each pipeline step for debugging

## Future Enhancements

- Add caching for repeated predictions
- Implement batch processing for bulk predictions
- Add confidence threshold-based filtering
- Support for custom metadata extractors
- Model versioning support
