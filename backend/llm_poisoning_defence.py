#!/usr/bin/env python3
"""
LLM Poisoning & Data Poisoning Defense System
Detects and prevents adversarial and data poisoning attacks on LLM-based spam detectors
"""

import json
import numpy as np
import pandas as pd
from collections import Counter, defaultdict
from pathlib import Path
import pickle
import re
from datetime import datetime
import hashlib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import PCA
import warnings
warnings.filterwarnings('ignore')

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / 'models'
MODEL_DIR.mkdir(exist_ok=True)

# ============================================
# DATA POISONING DETECTOR
# ============================================

class DataPoisoningDetector:
    """Detects poisoned samples in training data"""
    
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 3),
            stop_words='english'
        )
        self.anomaly_detector = IsolationForest(
            contamination=0.1,
            random_state=42,
            n_estimators=100
        )
        self.scaler = StandardScaler()
        self.is_trained = False
        
    def extract_features(self, texts):
        """Extract features from text samples"""
        if not texts:
            return np.array([])
        
        # TF-IDF features
        tfidf_features = self.vectorizer.fit_transform(texts).toarray()
        
        # Statistical features
        stat_features = []
        for text in texts:
            features = []
            features.append(len(text))  # Length
            features.append(len(text.split()))  # Word count
            features.append(sum(c.isupper() for c in text) / max(len(text), 1))  # Uppercase ratio
            features.append(sum(c in '!?.,;:' for c in text) / max(len(text), 1))  # Punctuation ratio
            features.append(len(re.findall(r'[^a-zA-Z0-9\s]', text)) / max(len(text), 1))  # Special chars
            stat_features.append(features)
        
        stat_features = np.array(stat_features)
        
        # Combine features
        if tfidf_features.shape[0] > 0:
            combined = np.hstack([tfidf_features, stat_features])
        else:
            combined = stat_features
        
        return combined
    
    def train(self, texts, labels):
        """Train anomaly detector on clean data"""
        if len(texts) < 10:
            print("⚠️ Not enough samples for training")
            return False
        
        # Extract features
        features = self.extract_features(texts)
        
        # Scale features
        features = self.scaler.fit_transform(features)
        
        # Train anomaly detector
        self.anomaly_detector.fit(features)
        self.is_trained = True
        
        self.save()
        return True
    
    def detect(self, texts):
        """Detect poisoned samples"""
        if not self.is_trained:
            return [{'is_poisoned': False, 'score': 0} for _ in texts]
        
        if not texts:
            return []
        
        # Extract features
        features = self.extract_features(texts)
        features = self.scaler.transform(features)
        
        # Detect anomalies
        predictions = self.anomaly_detector.predict(features)
        scores = self.anomaly_detector.score_samples(features)
        
        results = []
        for i, (pred, score) in enumerate(zip(predictions, scores)):
            is_poisoned = pred == -1  # -1 indicates anomaly
            # Normalize score
            normalized_score = 1 / (1 + np.exp(-score)) if score < 0 else score / (score + 1)
            results.append({
                'is_poisoned': bool(is_poisoned),
                'score': float(normalized_score),
                'text_preview': texts[i][:100] if texts[i] else ''
            })
        
        return results
    
    def save(self):
        """Save detector"""
        if self.is_trained:
            with open(MODEL_DIR / 'poisoning_detector.pkl', 'wb') as f:
                pickle.dump({
                    'vectorizer': self.vectorizer,
                    'anomaly_detector': self.anomaly_detector,
                    'scaler': self.scaler,
                    'is_trained': self.is_trained
                }, f)
            print(f"💾 Saved poisoning detector to {MODEL_DIR / 'poisoning_detector.pkl'}")
    
    def load(self):
        """Load detector"""
        try:
            with open(MODEL_DIR / 'poisoning_detector.pkl', 'rb') as f:
                data = pickle.load(f)
                self.vectorizer = data['vectorizer']
                self.anomaly_detector = data['anomaly_detector']
                self.scaler = data['scaler']
                self.is_trained = data['is_trained']
                print("✅ Poisoning detector loaded")
                return True
        except Exception as e:
            print(f"⚠️ Failed to load poisoning detector: {e}")
            return False


# ============================================
# DATA VALIDATOR
# ============================================

class DataValidator:
    """Validates training data for consistency and quality"""
    
    def __init__(self):
        self.label_consistency_threshold = 0.8
        self.min_samples_per_class = 10
        
    def validate(self, texts, labels):
        """Validate training data"""
        results = {
            'is_valid': True,
            'issues': [],
            'stats': {},
            'recommendations': []
        }
        
        # Check if empty
        if not texts or not labels:
            results['is_valid'] = False
            results['issues'].append('Empty dataset')
            return results
        
        # Check label distribution
        label_counts = Counter(labels)
        results['stats']['label_counts'] = dict(label_counts)
        results['stats']['total_samples'] = len(texts)
        
        # Check class balance
        for label, count in label_counts.items():
            if count < self.min_samples_per_class:
                results['issues'].append(f"Class '{label}' has only {count} samples (min: {self.min_samples_per_class})")
                results['recommendations'].append(f"Collect more samples for class '{label}'")
        
        # Check for duplicates
        text_hashes = [hashlib.md5(t.encode()).hexdigest() for t in texts]
        duplicate_count = len(text_hashes) - len(set(text_hashes))
        if duplicate_count > 0:
            results['issues'].append(f"Found {duplicate_count} duplicate samples")
            results['recommendations'].append("Remove duplicate samples from dataset")
        
        # Check for label consistency
        if len(set(labels)) > 1:
            # Check if labels are consistent (same label for similar texts)
            label_consistency = self._check_label_consistency(texts, labels)
            if label_consistency < self.label_consistency_threshold:
                results['issues'].append(f"Label consistency score too low: {label_consistency:.2f}")
                results['recommendations'].append("Review labels for consistency")
        
        # Check for suspiciously short/long texts
        text_lengths = [len(t) for t in texts]
        avg_length = np.mean(text_lengths)
        std_length = np.std(text_lengths)
        outliers = [i for i, l in enumerate(text_lengths) if l > avg_length + 3*std_length or l < avg_length - 3*std_length]
        if outliers:
            results['issues'].append(f"Found {len(outliers)} text length outliers")
            results['recommendations'].append("Review unusually long or short texts")
        
        results['is_valid'] = len(results['issues']) == 0
        results['stats']['avg_text_length'] = float(avg_length)
        results['stats']['std_text_length'] = float(std_length)
        
        return results
    
    def _check_label_consistency(self, texts, labels):
        """Check if similar texts have consistent labels"""
        if len(texts) < 10:
            return 1.0
        
        # Simple consistency check using TF-IDF similarity
        vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
        try:
            vectors = vectorizer.fit_transform(texts)
            similarities = (vectors * vectors.T).toarray()
            
            # For each text, check if similar texts have same label
            consistent = 0
            total = 0
            for i in range(len(texts)):
                similar_indices = np.where(similarities[i] > 0.5)[0]
                for j in similar_indices:
                    if i != j:
                        total += 1
                        if labels[i] == labels[j]:
                            consistent += 1
            
            return consistent / max(total, 1)
        except:
            return 1.0
    
    def clean(self, texts, labels):
        """Clean dataset by removing invalid samples"""
        validated = self.validate(texts, labels)
        
        if validated['is_valid']:
            return texts, labels
        
        # Remove duplicates
        seen = set()
        clean_texts = []
        clean_labels = []
        for text, label in zip(texts, labels):
            text_hash = hashlib.md5(text.encode()).hexdigest()
            if text_hash not in seen:
                seen.add(text_hash)
                clean_texts.append(text)
                clean_labels.append(label)
        
        # Remove length outliers
        text_lengths = [len(t) for t in clean_texts]
        avg_length = np.mean(text_lengths) if text_lengths else 0
        std_length = np.std(text_lengths) if text_lengths else 1
        final_texts = []
        final_labels = []
        for text, label in zip(clean_texts, clean_labels):
            if avg_length - 3*std_length <= len(text) <= avg_length + 3*std_length:
                final_texts.append(text)
                final_labels.append(label)
        
        return final_texts, final_labels


# ============================================
# ADVERSARIAL ATTACK DETECTOR
# ============================================

class AdversarialAttackDetector:
    """Detects adversarial attacks on LLM-based spam detectors"""
    
    def __init__(self):
        self.patterns = {
            'char_obfuscation': re.compile(r'[@4áâ][3éè][1!í][0óö][$5z]'),
            'synonym_replacement': re.compile(r'\b(complimentary|gratis|without charge|on the house)\b', re.I),
            'repeated_punctuation': re.compile(r'[!?.,]{3,}'),
            'excessive_caps': re.compile(r'[A-Z]{5,}'),
            'url_obfuscation': re.compile(r'https?://[^\s]+\?[^\s]+'),
            'homoglyph': re.compile(r'[^\x00-\x7F]')
        }
        
    def detect(self, text):
        """Detect adversarial patterns in text"""
        results = {
            'is_adversarial': False,
            'patterns_detected': [],
            'confidence': 0.0,
            'details': {}
        }
        
        if not text:
            return results
        
        score = 0
        for pattern_name, pattern in self.patterns.items():
            matches = pattern.findall(text)
            if matches:
                results['patterns_detected'].append(pattern_name)
                results['details'][pattern_name] = len(matches)
                score += len(matches) * 0.1
        
        score = min(score, 1.0)
        results['confidence'] = score
        results['is_adversarial'] = score > 0.3
        
        return results


# ============================================
# LLM POISONING DEFENSE - Main Orchestrator
# ============================================

class LLMPoisoningDefense:
    """Main defense system for LLM poisoning attacks"""
    
    def __init__(self):
        self.poisoning_detector = DataPoisoningDetector()
        self.validator = DataValidator()
        self.adversarial_detector = AdversarialAttackDetector()
        self.defense_enabled = True
        
        # Load existing models
        self.poisoning_detector.load()
    
    def validate_training_data(self, texts, labels):
        """Complete validation pipeline for training data"""
        results = {
            'is_valid': True,
            'poisoned_samples': [],
            'validation_results': {},
            'cleaned_texts': texts,
            'cleaned_labels': labels,
            'adversarial_analysis': [],
            'recommendations': []
        }
        
        # Step 1: Data validation
        validation = self.validator.validate(texts, labels)
        results['validation_results'] = validation
        
        if not validation['is_valid']:
            results['is_valid'] = False
            results['recommendations'].extend(validation['recommendations'])
        
        # Step 2: Check for poisoned samples
        if self.poisoning_detector.is_trained:
            poisoning_results = self.poisoning_detector.detect(texts)
            poisoned_indices = [i for i, r in enumerate(poisoning_results) if r['is_poisoned']]
            
            if poisoned_indices:
                results['poisoned_samples'] = [{
                    'index': i,
                    'text': texts[i][:200],
                    'score': poisoning_results[i]['score']
                } for i in poisoned_indices[:10]]
                results['is_valid'] = False
                results['recommendations'].append(f"Remove {len(poisoned_indices)} poisoned samples")
        
        # Step 3: Adversarial attack detection
        for text in texts[:20]:  # Sample for performance
            adversarial = self.adversarial_detector.detect(text)
            if adversarial['is_adversarial']:
                results['adversarial_analysis'].append({
                    'text': text[:100],
                    'patterns': adversarial['patterns_detected'],
                    'confidence': adversarial['confidence']
                })
                results['recommendations'].append("Review for adversarial patterns")
        
        # Step 4: Clean dataset if needed
        if not results['is_valid']:
            clean_texts, clean_labels = self.validator.clean(texts, labels)
            results['cleaned_texts'] = clean_texts
            results['cleaned_labels'] = clean_labels
            results['recommendations'].append(f"Dataset cleaned: {len(clean_texts)} samples remaining")
        
        return results
    
    def detect_adversarial_input(self, text):
        """Detect adversarial input in real-time"""
        return self.adversarial_detector.detect(text)
    
    def train_poisoning_detector(self, clean_texts, clean_labels):
        """Train the poisoning detector on clean data"""
        return self.poisoning_detector.train(clean_texts, clean_labels)
    
    def get_status(self):
        """Get system status"""
        return {
            'defense_enabled': self.defense_enabled,
            'poisoning_detector_trained': self.poisoning_detector.is_trained,
            'model_path': str(MODEL_DIR / 'poisoning_detector.pkl')
        }


# ============================================
# MAIN - Test & Demo
# ============================================

def main():
    print("=" * 60)
    print("🛡️ LLM Poisoning & Data Poisoning Defense System")
    print("=" * 60)
    
    defense = LLMPoisoningDefense()
    
    # Test dataset
    clean_texts = [
        "Meeting at 10am tomorrow",
        "Please review the attached document",
        "Team standup at 2pm",
        "Weekly report is ready",
        "Can you review this PR?",
        "Deployment scheduled for Friday",
        "API documentation updated",
        "Security patch released",
        "Database migration completed",
        "New feature deployed"
    ] * 5  # Duplicate to make more samples
    
    clean_labels = ["ham"] * 50
    
    # Train poisoning detector
    print("\n🔄 Training poisoning detector...")
    defense.train_poisoning_detector(clean_texts, clean_labels)
    
    # Test with poisoned data
    poisoned_texts = [
        "Claim your free prize now!",  # Spam
        "You have won a free iPhone",  # Spam
        "URGENT! Your account needs verification",  # Spam
        "Free money waiting for you",  # Spam
        "Limited time offer, act now",  # Spam
        "Congratulations! You're a winner",  # Spam
    ]
    poisoned_labels = ["spam"] * 6
    
    # Mixed dataset
    mixed_texts = clean_texts + poisoned_texts
    mixed_labels = clean_labels + poisoned_labels
    
    print("\n🧪 Testing Poisoning Detection:")
    print("-" * 40)
    
    # Validate training data
    results = defense.validate_training_data(mixed_texts, mixed_labels)
    
    print(f"\n📊 Validation Results:")
    print(f"   Is Valid: {'✅ YES' if results['is_valid'] else '❌ NO'}")
    print(f"   Total Samples: {len(mixed_texts)}")
    print(f"   Poisoned Samples Found: {len(results['poisoned_samples'])}")
    print(f"   Cleaned Samples: {len(results['cleaned_texts'])}")
    
    if results['poisoned_samples']:
        print(f"\n⚠️ Poisoned Samples Detected:")
        for sample in results['poisoned_samples'][:3]:
            print(f"   - {sample['text'][:50]}... (Score: {sample['score']:.2f})")
    
    # Test adversarial detection
    print("\n🧪 Testing Adversarial Attack Detection:")
    print("-" * 40)
    
    test_texts = [
        "Hi team, meeting tomorrow",
        "Cl4im y0ur fr33 pr!ze n0w!",
        "You have received a complimentary reward",
        "URGENT!!! IMMEDIATE ACTION REQUIRED!!!"
    ]
    
    for text in test_texts:
        result = defense.detect_adversarial_input(text)
        print(f"\n   Text: {text[:40]}...")
        print(f"   Is Adversarial: {'✅ YES' if result['is_adversarial'] else '❌ NO'}")
        print(f"   Confidence: {result['confidence']:.2%}")
        if result['patterns_detected']:
            print(f"   Patterns: {', '.join(result['patterns_detected'])}")
    
    print("\n" + "=" * 60)
    print("✅ LLM Poisoning Defense System Ready!")
    print(f"   Models saved to: {MODEL_DIR}")
    
    return defense


if __name__ == "__main__":
    defense = main()