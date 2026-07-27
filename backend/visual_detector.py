#!/usr/bin/env python3
"""
VBSF - Visual-Based Spam Filtering
Multi-modal detection using OCR + CNN ensemble
"""

import os
import json
import base64
import numpy as np
from PIL import Image
from io import BytesIO
from pathlib import Path
import pickle
import re
from datetime import datetime

# OCR
import pytesseract
import cv2

# ML
from sklearn.naive_bayes import MultinomialNB
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler
import joblib

# For HTML rendering
import tempfile
import subprocess
import time

from html_sanitizer import sanitize_html_for_rendering

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / 'models'
MODELS_DIR.mkdir(exist_ok=True)

OCR_MODEL_PATH = MODELS_DIR / 'ocr_model.pkl'
CNN_MODEL_PATH = MODELS_DIR / 'cnn_model.pkl'
ENSEMBLE_MODEL_PATH = MODELS_DIR / 'ensemble_model.pkl'
VECTORIZER_PATH = MODELS_DIR / 'ocr_vectorizer.pkl'

# ============================================
# EMAIL RENDERER
# ============================================

# Chrome/Chromium flags that keep the headless renderer from reaching the
# network. "--host-resolver-rules=MAP * ~NOTFOUND" makes every hostname fail to
# resolve, so even a resource URL that slips past sanitization cannot be fetched
# (defence-in-depth against SSRF). The rest disable background networking that
# could otherwise phone home.
SSRF_SAFE_BROWSER_FLAGS = [
    "--host-resolver-rules=MAP * ~NOTFOUND",
    "--no-proxy-server",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-component-update",
    "--no-first-run",
]


class EmailRenderer:
    """Renders HTML emails as images for visual analysis"""
    
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp()
        
    def render(self, html_content, width=800, height=600):
        """Render HTML content as PIL Image"""
        # Strip anything that would trigger an outbound fetch (external images,
        # stylesheets, iframes, private/link-local/metadata URLs) before the
        # untrusted HTML reaches the browser. See issue #925.
        html_content = sanitize_html_for_rendering(html_content)
        try:
            # Try using html2image
            from html2image import Html2Image
            hti = Html2Image(
                output_path=self.temp_dir,
                custom_flags=SSRF_SAFE_BROWSER_FLAGS,
            )
            
            # Create temp HTML file
            html_file = os.path.join(self.temp_dir, 'email.html')
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            # Render to image
            png_file = os.path.join(self.temp_dir, 'email.png')
            hti.screenshot(html_file=html_file, save_as='email.png', size=(width, height))
            
            # Load image
            img = Image.open(png_file)
            
            # Cleanup
            os.remove(html_file)
            os.remove(png_file)
            
            return img
            
        except Exception as e:
            print(f"⚠️ html2image failed: {e}")
            # Fallback: Create simple image from text
            return self._render_text_fallback(html_content, width, height)
    
    def _render_text_fallback(self, html_content, width, height):
        """Fallback renderer for simple text"""
        from PIL import Image, ImageDraw, ImageFont
        
        # Extract visible text
        import re
        text = re.sub(r'<[^>]+>', ' ', html_content)
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Create image with text
        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 14)
        except:
            font = ImageFont.load_default()
        
        # Draw text
        y = 10
        for line in text.split('\n'):
            if y > height - 20:
                break
            draw.text((10, y), line[:100], fill='black', font=font)
            y += 20
        
        return img


# ============================================
# OCR PIPELINE
# ============================================

class OCRPipeline:
    """Extracts and classifies text from rendered images"""
    
    def __init__(self):
        self.vectorizer = None
        self.nb_classifier = None
        self.dt_classifier = None
        self.is_trained = False
        
        # Load if exists
        self.load()
    
    def extract_text(self, image):
        """Extract text from image using Tesseract OCR"""
        try:
            # Convert PIL to OpenCV
            if isinstance(image, Image.Image):
                image = np.array(image)
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            
            # Preprocess for better OCR
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # OCR
            text = pytesseract.image_to_string(thresh, config='--psm 6')
            
            return text.strip()
        except Exception as e:
            print(f"⚠️ OCR failed: {e}")
            return ""
    
    def extract_features(self, text):
        """Extract features from OCR text"""
        if not self.vectorizer:
            return None
        return self.vectorizer.transform([text])
    
    def predict(self, text):
        """Predict using both classifiers"""
        if not self.is_trained:
            return {'spam': 0.5, 'ham': 0.5}
        
        features = self.extract_features(text)
        if features is None:
            return {'spam': 0.5, 'ham': 0.5}
        
        # Get predictions from both classifiers
        nb_prob = self.nb_classifier.predict_proba(features)[0]
        dt_prob = self.dt_classifier.predict_proba(features)[0]
        
        # Average probabilities
        avg_prob = (nb_prob + dt_prob) / 2
        
        return {
            'spam': float(avg_prob[1]),
            'ham': float(avg_prob[0]),
            'prediction': 'spam' if avg_prob[1] > avg_prob[0] else 'ham'
        }
    
    def train(self, texts, labels):
        """Train OCR classifiers"""
        # Vectorize
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),
            stop_words='english'
        )
        X = self.vectorizer.fit_transform(texts)
        
        # Train classifiers
        self.nb_classifier = MultinomialNB()
        self.nb_classifier.fit(X, labels)
        
        self.dt_classifier = DecisionTreeClassifier(
            max_depth=10,
            min_samples_split=5,
            random_state=42
        )
        self.dt_classifier.fit(X, labels)
        
        self.is_trained = True
        
        # Save
        self.save()
        
        return True
    
    def save(self):
        """Save classifiers"""
        if self.is_trained:
            joblib.dump(self.vectorizer, VECTORIZER_PATH)
            joblib.dump(self.nb_classifier, OCR_MODEL_PATH)
            joblib.dump(self.dt_classifier, OCR_MODEL_PATH.replace('.pkl', '_dt.pkl'))
    
    def load(self):
        """Load classifiers"""
        try:
            if os.path.exists(VECTORIZER_PATH):
                self.vectorizer = joblib.load(VECTORIZER_PATH)
                self.nb_classifier = joblib.load(OCR_MODEL_PATH)
                self.dt_classifier = joblib.load(OCR_MODEL_PATH.replace('.pkl', '_dt.pkl'))
                self.is_trained = True
                print("✅ OCR models loaded")
            else:
                print("⚠️ No OCR models found - training required")
        except Exception as e:
            print(f"⚠️ Failed to load OCR models: {e}")


# ============================================
# CNN PIPELINE - Visual Analysis
# ============================================

class CNNVisualPipeline:
    """Visual pattern classification using CNN"""
    
    def __init__(self):
        self.model = None
        self.scaler = None
        self.is_trained = False
        
        # Load if exists
        self.load()
    
    def extract_features(self, image):
        """Extract visual features from image"""
        try:
            # Convert PIL to numpy
            if isinstance(image, Image.Image):
                img = np.array(image)
            else:
                img = image
            
            # Resize
            img = cv2.resize(img, (224, 224))
            
            # Convert to grayscale if needed
            if len(img.shape) == 3:
                img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Extract simple features (HOG + color histogram)
            features = []
            
            # HOG features
            hog = cv2.HOGDescriptor()
            hog_features = hog.compute(img)
            if hog_features is not None:
                features.extend(hog_features.flatten()[:100])
            
            # Color histogram (if RGB)
            if len(img.shape) == 3:
                hist = cv2.calcHist([img], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
                features.extend(hist.flatten()[:50])
            
            # Texture features (GLCM - simplified)
            # Add some statistical features
            features.extend([
                np.mean(img),
                np.std(img),
                np.var(img),
                np.median(img),
                np.max(img),
                np.min(img)
            ])
            
            return np.array(features).reshape(1, -1)
            
        except Exception as e:
            print(f"⚠️ Visual feature extraction failed: {e}")
            return np.zeros((1, 10))
    
    def predict(self, image):
        """Predict using CNN"""
        if not self.is_trained:
            return {'spam': 0.5, 'ham': 0.5}
        
        features = self.extract_features(image)
        if self.scaler:
            features = self.scaler.transform(features)
        
        # Simple logistic regression as CNN substitute
        proba = self.model.predict_proba(features)[0]
        
        return {
            'spam': float(proba[1]),
            'ham': float(proba[0]),
            'prediction': 'spam' if proba[1] > proba[0] else 'ham'
        }
    
    def train(self, images, labels):
        """Train CNN model"""
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        
        # Extract features from images
        features = []
        for img in images:
            feat = self.extract_features(img)
            features.append(feat)
        
        X = np.vstack(features)
        
        # Scale
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        # Train
        self.model = LogisticRegression(
            class_weight='balanced',
            max_iter=1000,
            random_state=42
        )
        self.model.fit(X_scaled, labels)
        
        self.is_trained = True
        self.save()
        
        return True
    
    def save(self):
        """Save CNN model"""
        if self.is_trained:
            joblib.dump({
                'model': self.model,
                'scaler': self.scaler
            }, CNN_MODEL_PATH)
    
    def load(self):
        """Load CNN model"""
        try:
            if os.path.exists(CNN_MODEL_PATH):
                data = joblib.load(CNN_MODEL_PATH)
                self.model = data['model']
                self.scaler = data['scaler']
                self.is_trained = True
                print("✅ CNN model loaded")
            else:
                print("⚠️ No CNN model found - training required")
        except Exception as e:
            print(f"⚠️ Failed to load CNN model: {e}")


# ============================================
# STACKING ENSEMBLE
# ============================================

class StackingEnsemble:
    """Ensemble of OCR + CNN classifiers"""
    
    def __init__(self):
        self.meta_classifier = None
        self.is_trained = False
        self.ocr = OCRPipeline()
        self.cnn = CNNVisualPipeline()
        self.renderer = EmailRenderer()
        
        # Load if exists
        self.load()
    
    def detect(self, html_content):
        """Full detection pipeline"""
        try:
            # Step 1: Render email as image
            image = self.renderer.render(html_content)
            
            # Step 2: OCR Pipeline
            ocr_text = self.ocr.extract_text(image)
            ocr_result = self.ocr.predict(ocr_text)
            
            # Step 3: CNN Visual Pipeline
            cnn_result = self.cnn.predict(image)
            
            # Step 4: Ensemble
            if self.is_trained:
                # Stack predictions
                features = np.array([
                    ocr_result['spam'],
                    ocr_result['ham'],
                    cnn_result['spam'],
                    cnn_result['ham']
                ]).reshape(1, -1)
                
                meta_proba = self.meta_classifier.predict_proba(features)[0]
                final_prediction = 'spam' if meta_proba[1] > meta_proba[0] else 'ham'
                final_confidence = max(meta_proba)
            else:
                # Simple averaging
                avg_spam = (ocr_result['spam'] + cnn_result['spam']) / 2
                avg_ham = (ocr_result['ham'] + cnn_result['ham']) / 2
                final_prediction = 'spam' if avg_spam > avg_ham else 'ham'
                final_confidence = max(avg_spam, avg_ham)
            
            return {
                'prediction': final_prediction,
                'confidence': float(final_confidence),
                'ocr': ocr_result,
                'cnn': cnn_result,
                'ocr_text': ocr_text[:200],  # Preview
                'method': 'vbsf_ensemble'
            }
            
        except Exception as e:
            print(f"❌ VBSF detection failed: {e}")
            return {
                'prediction': 'unknown',
                'confidence': 0.0,
                'error': str(e)
            }
    
    def train(self, html_contents, labels):
        """Train the full ensemble"""
        print("🔄 Training VBSF Ensemble...")
        
        # Step 1: Render and extract OCR
        print("   📄 Rendering emails and extracting OCR...")
        ocr_texts = []
        for html in html_contents[:100]:  # Limit for speed
            image = self.renderer.render(html)
            text = self.ocr.extract_text(image)
            ocr_texts.append(text)
        
        # Step 2: Train OCR
        print("   📝 Training OCR classifiers...")
        self.ocr.train(ocr_texts, labels)
        
        # Step 3: Train CNN
        print("   🖼️ Training CNN classifier...")
        # Use rendered images
        images = []
        for html in html_contents[:100]:
            img = self.renderer.render(html)
            images.append(img)
        self.cnn.train(images, labels)
        
        # Step 4: Train Meta-Classifier (Stacking)
        print("   🔗 Training stacking ensemble...")
        
        # Get predictions from both pipelines
        meta_features = []
        for i, html in enumerate(html_contents[:100]):
            image = self.renderer.render(html)
            
            # OCR prediction
            text = self.ocr.extract_text(image)
            ocr = self.ocr.predict(text)
            
            # CNN prediction
            cnn = self.cnn.predict(image)
            
            meta_features.append([
                ocr['spam'],
                ocr['ham'],
                cnn['spam'],
                cnn['ham']
            ])
        
        # Train meta-classifier
        X_meta = np.array(meta_features)
        y_meta = np.array(labels[:len(meta_features)])
        
        self.meta_classifier = LogisticRegression(
            class_weight='balanced',
            random_state=42
        )
        self.meta_classifier.fit(X_meta, y_meta)
        
        self.is_trained = True
        
        # Save
        self.save()
        
        print("✅ VBSF Ensemble training complete!")
        return True
    
    def save(self):
        """Save ensemble"""
        if self.is_trained:
            joblib.dump(self.meta_classifier, ENSEMBLE_MODEL_PATH)
            print(f"💾 Saved ensemble to {ENSEMBLE_MODEL_PATH}")
    
    def load(self):
        """Load ensemble"""
        try:
            if os.path.exists(ENSEMBLE_MODEL_PATH):
                self.meta_classifier = joblib.load(ENSEMBLE_MODEL_PATH)
                self.is_trained = True
                print("✅ VBSF Ensemble loaded")
            else:
                print("⚠️ No ensemble found - training required")
        except Exception as e:
            print(f"⚠️ Failed to load ensemble: {e}")


# ============================================
# SAMPLE DATA GENERATOR (For Testing)
# ============================================

def generate_sample_data(num_samples=20):
    """Generate sample email HTML for testing"""
    samples = []
    
    spam_templates = [
        """
        <html>
        <body style="font-family: Arial; color: #ff0000;">
            <h1>🎉 CONGRATULATIONS!</h1>
            <p style="font-size: 24px; color: #ff6600;">
                You have WON a FREE iPhone 15 Pro!
            </p>
            <p style="font-size: 14px; color: #333;">
                Click <a href="http://fake-prize.com">HERE</a> to claim your prize.
            </p>
            <p style="font-size: 10px; color: #999;">
                This is a limited time offer. Act now!
            </p>
        </body>
        </html>
        """,
        """
        <html>
        <body>
            <div style="background: #ffff00; padding: 20px;">
                <h2 style="color: #ff0000;">URGENT! Your Account is at Risk</h2>
                <p>Please verify your banking details immediately.</p>
                <p><a href="http://fake-bank.com/verify">Verify Now</a></p>
            </div>
        </body>
        </html>
        """
    ]
    
    ham_templates = [
        """
        <html>
        <body>
            <h2>Meeting Reminder</h2>
            <p>Team meeting at 10am tomorrow in Conference Room A.</p>
            <p>Please bring your laptops.</p>
            <p>Best regards,<br>Manager</p>
        </body>
        </html>
        """,
        """
        <html>
        <body>
            <h3>Weekly Report</h3>
            <p>Here is the weekly report for your review.</p>
            <p>Attachments: report.pdf</p>
            <p>Thank you,<br>Team</p>
        </body>
        </html>
        """
    ]
    
    for i in range(num_samples):
        if i % 2 == 0:
            template = spam_templates[i % len(spam_templates)]
            label = 'spam'
        else:
            template = ham_templates[i % len(ham_templates)]
            label = 'ham'
        
        samples.append({
            'html': template,
            'label': label,
            'id': f'sample_{i}'
        })
    
    return samples


# ============================================
# MAIN
# ============================================

def main():
    print("=" * 60)
    print("🎯 VBSF - Visual-Based Spam Filtering")
    print("=" * 60)
    
    # Create ensemble
    ensemble = StackingEnsemble()
    
    # Check if trained
    if ensemble.is_trained:
        print("\n✅ VBSF Ensemble is ready!")
        
        # Test detection
        test_html = """
        <html>
        <body>
            <h1>FREE PRIZE!</h1>
            <p>You have won $1,000,000!</p>
            <a href="http://fake.com">Claim Now</a>
        </body>
        </html>
        """
        
        result = ensemble.detect(test_html)
        print(f"\n🧪 Test Detection:")
        print(f"   Prediction: {result['prediction']}")
        print(f"   Confidence: {result['confidence']:.2%}")
        print(f"   OCR Text Preview: {result.get('ocr_text', '')[:100]}...")
        
    else:
        print("\n⚠️ VBSF Ensemble not trained!")
        print("   Generating sample data for training...")
        
        # Generate sample data
        samples = generate_sample_data(20)
        htmls = [s['html'] for s in samples]
        labels = [s['label'] for s in samples]
        
        print(f"   Generated {len(samples)} samples")
        print("   Training VBSF Ensemble...")
        
        ensemble.train(htmls, labels)
        
        # Test
        test_html = """
        <html>
        <body>
            <h1>Congratulations! You Won!</h1>
            <p>Click here to claim your prize.</p>
        </body>
        </html>
        """
        
        result = ensemble.detect(test_html)
        print(f"\n🧪 Test Detection:")
        print(f"   Prediction: {result['prediction']}")
        print(f"   Confidence: {result['confidence']:.2%}")
    
    print("\n✅ VBSF initialized successfully!")
    print(f"   Models saved to: {MODELS_DIR}")


if __name__ == "__main__":
    main()