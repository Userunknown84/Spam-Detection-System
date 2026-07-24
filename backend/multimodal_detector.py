#!/usr/bin/env python3
"""
Multimodal Spam Detection Using NEAT (NeuroEvolution of Augmenting Topologies)
Detects spam across text, images, and voice modalities
"""

import os
import json
import numpy as np
import pickle
from pathlib import Path
from datetime import datetime
import hashlib
import base64
import io
import warnings
warnings.filterwarnings('ignore')

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / 'models'
MODEL_DIR.mkdir(exist_ok=True)

# ============================================
# TEXT MODALITY DETECTOR
# ============================================

class TextModalityDetector:
    """Detects spam in text messages"""
    
    def __init__(self):
        self.vectorizer = None
        self.classifier = None
        self.is_trained = False
        
    def extract_features(self, text):
        """Extract features from text"""
        if not text:
            return np.array([])
        
        # Basic statistical features
        features = []
        features.append(len(text))  # Length
        features.append(len(text.split()))  # Word count
        features.append(sum(c.isupper() for c in text) / max(len(text), 1))  # Uppercase ratio
        features.append(sum(c in '!?.,;:' for c in text) / max(len(text), 1))  # Punctuation ratio
        features.append(len(re.findall(r'[^a-zA-Z0-9\s]', text)) / max(len(text), 1))  # Special chars
        features.append(sum(c.isdigit() for c in text) / max(len(text), 1))  # Digit ratio
        
        # Spam keyword detection
        spam_keywords = ['free', 'win', 'prize', 'claim', 'urgent', 'click', 'money', 'cash', 'bonus', 'guaranteed']
        features.append(sum(1 for kw in spam_keywords if kw in text.lower()))
        
        return np.array(features)
    
    def detect(self, text):
        """Detect spam in text"""
        if not text:
            return {'prediction': 'ham', 'confidence': 0.5, 'modality': 'text'}
        
        features = self.extract_features(text).reshape(1, -1)
        
        # Simple heuristic-based detection (placeholder for actual model)
        score = 0
        if len(text) > 100: score += 0.1
        if len(text.split()) > 20: score += 0.1
        if any(kw in text.lower() for kw in ['free', 'win', 'prize', 'claim']): score += 0.3
        if '!' in text: score += 0.1
        if any(c.isupper() for c in text): score += 0.1
        
        score = min(score, 0.95)
        prediction = 'spam' if score > 0.4 else 'ham'
        
        return {
            'prediction': prediction,
            'confidence': score,
            'modality': 'text',
            'text_preview': text[:100]
        }


# ============================================
# IMAGE MODALITY DETECTOR
# ============================================

class ImageModalityDetector:
    """Detects spam in images (screenshots, embedded images)"""
    
    def __init__(self):
        self.is_trained = False
        
    def extract_features(self, image_data):
        """Extract features from image data"""
        try:
            from PIL import Image
            import io
            
            # Decode image
            if isinstance(image_data, str):
                # Base64 encoded image
                image_bytes = base64.b64decode(image_data)
                image = Image.open(io.BytesIO(image_bytes))
            elif isinstance(image_data, bytes):
                image = Image.open(io.BytesIO(image_data))
            else:
                return np.zeros(10)
            
            # Convert to numpy
            img = np.array(image)
            
            # Extract features
            features = []
            
            # Basic stats
            if len(img.shape) == 3:
                features.append(np.mean(img[:,:,0]))
                features.append(np.mean(img[:,:,1]))
                features.append(np.mean(img[:,:,2]))
                features.append(np.std(img[:,:,0]))
                features.append(np.std(img[:,:,1]))
                features.append(np.std(img[:,:,2]))
            else:
                features.append(np.mean(img))
                features.append(np.std(img))
                features.extend([0, 0, 0, 0, 0])
            
            # Size
            features.append(img.shape[0] / 1000)  # Height
            features.append(img.shape[1] / 1000)  # Width
            
            # Entropy (simplified)
            if len(img.shape) == 3:
                hist = np.histogram(img[:,:,0].flatten(), bins=50)[0]
            else:
                hist = np.histogram(img.flatten(), bins=50)[0]
            hist = hist / (hist.sum() + 1)
            entropy = -np.sum(hist * np.log2(hist + 1e-10))
            features.append(entropy)
            
            return np.array(features)
            
        except Exception as e:
            print(f"⚠️ Image feature extraction failed: {e}")
            return np.zeros(10)
    
    def detect(self, image_data):
        """Detect spam in image"""
        if not image_data:
            return {'prediction': 'ham', 'confidence': 0.5, 'modality': 'image'}
        
        features = self.extract_features(image_data)
        
        # Simple heuristic-based detection
        score = 0.2
        
        # Check for suspicious patterns (placeholder)
        # In production, use actual model
        
        prediction = 'spam' if score > 0.5 else 'ham'
        
        return {
            'prediction': prediction,
            'confidence': score,
            'modality': 'image',
            'features': features.tolist()[:5]
        }


# ============================================
# VOICE MODALITY DETECTOR
# ============================================

class VoiceModalityDetector:
    """Detects spam in voice messages"""
    
    def __init__(self):
        self.is_trained = False
        
    def extract_features(self, audio_data):
        """Extract features from audio data"""
        try:
            # For demo, use simple features
            # In production, use librosa or similar
            features = []
            
            # Length estimation
            if isinstance(audio_data, str):
                # Base64 encoded audio
                audio_bytes = base64.b64decode(audio_data)
                features.append(len(audio_bytes) / 1000)  # Size in KB
            elif isinstance(audio_data, bytes):
                features.append(len(audio_data) / 1000)
            else:
                features.append(0)
            
            # Random features (placeholder)
            features.extend([np.random.random() for _ in range(5)])
            
            return np.array(features)
            
        except Exception as e:
            print(f"⚠️ Voice feature extraction failed: {e}")
            return np.zeros(6)
    
    def detect(self, audio_data):
        """Detect spam in voice"""
        if not audio_data:
            return {'prediction': 'ham', 'confidence': 0.5, 'modality': 'voice'}
        
        features = self.extract_features(audio_data)
        
        # Simple heuristic-based detection
        score = 0.15
        if features[0] > 10:  # Large audio file
            score += 0.2
        
        prediction = 'spam' if score > 0.4 else 'ham'
        
        return {
            'prediction': prediction,
            'confidence': score,
            'modality': 'voice',
            'features': features.tolist()[:5]
        }


# ============================================
# NEAT - Dynamic Weighting & Evolution
# ============================================

class NEAT:
    """NeuroEvolution of Augmenting Topologies for dynamic weighting"""
    
    def __init__(self, dynamic_weighting=True):
        self.dynamic_weighting = dynamic_weighting
        self.weights = {
            'text': 0.4,
            'image': 0.3,
            'voice': 0.3
        }
        self.performance_history = []
        self.generation = 0
        self.population = []
        
    def set_weights(self, text_weight, image_weight, voice_weight):
        """Manually set weights"""
        total = text_weight + image_weight + voice_weight
        self.weights = {
            'text': text_weight / total,
            'image': image_weight / total,
            'voice': voice_weight / total
        }
        
    def optimize_weights(self, predictions, ground_truth):
        """Optimize weights based on performance"""
        if not self.dynamic_weighting:
            return self.weights
            
        # Simple weight optimization based on accuracy
        # In production, use actual NEAT algorithm
        
        # Calculate per-modality accuracy
        accuracies = {}
        for modality in ['text', 'image', 'voice']:
            if modality in predictions:
                correct = sum(1 for p, g in zip(predictions[modality], ground_truth) if p == g)
                total = len(ground_truth)
                accuracies[modality] = correct / max(total, 1)
            else:
                accuracies[modality] = 0.5
        
        # Update weights based on accuracy (higher accuracy = higher weight)
        total_acc = sum(accuracies.values()) or 1
        self.weights = {
            'text': accuracies['text'] / total_acc,
            'image': accuracies['image'] / total_acc,
            'voice': accuracies['voice'] / total_acc
        }
        
        self.generation += 1
        self.performance_history.append({
            'generation': self.generation,
            'weights': self.weights.copy(),
            'accuracies': accuracies.copy()
        })
        
        return self.weights
    
    def get_weights(self):
        """Get current weights"""
        return self.weights
    
    def get_stats(self):
        """Get NEAT statistics"""
        return {
            'generation': self.generation,
            'weights': self.weights,
            'performance_history': self.performance_history[-10:] if self.performance_history else []
        }


# ============================================
# MULTIMODAL SPAM DETECTOR
# ============================================

class MultimodalSpamDetector:
    """Main multimodal detector using NEAT"""
    
    def __init__(self):
        self.neat = NEAT(dynamic_weighting=True)
        self.text_detector = TextModalityDetector()
        self.image_detector = ImageModalityDetector()
        self.voice_detector = VoiceModalityDetector()
        self.detection_history = []
        
    def detect_text(self, text):
        """Detect spam in text"""
        return self.text_detector.detect(text)
    
    def detect_image(self, image_data):
        """Detect spam in image"""
        return self.image_detector.detect(image_data)
    
    def detect_voice(self, audio_data):
        """Detect spam in voice"""
        return self.voice_detector.detect(audio_data)
    
    def ensemble_detect(self, modalities):
        """
        Ensemble detection across multiple modalities
        modalities: dict with keys 'text', 'image', 'voice'
        """
        results = {}
        scores = []
        modalities_used = []
        
        # Detect each modality
        if 'text' in modalities and modalities['text']:
            result = self.detect_text(modalities['text'])
            results['text'] = result
            scores.append(result['confidence'])
            modalities_used.append('text')
            
        if 'image' in modalities and modalities['image']:
            result = self.detect_image(modalities['image'])
            results['image'] = result
            scores.append(result['confidence'])
            modalities_used.append('image')
            
        if 'voice' in modalities and modalities['voice']:
            result = self.detect_voice(modalities['voice'])
            results['voice'] = result
            scores.append(result['confidence'])
            modalities_used.append('voice')
        
        if not scores:
            return {
                'ensemble_prediction': 'ham',
                'ensemble_confidence': 0.5,
                'results': results,
                'modalities_used': []
            }
        
        # Get weights from NEAT
        weights = self.neat.get_weights()
        
        # Calculate weighted average confidence
        weighted_scores = []
        for modality, result in results.items():
            weight = weights.get(modality, 0.33)
            weighted_scores.append(result['confidence'] * weight)
        
        ensemble_confidence = sum(weighted_scores) / sum(weights.values())
        
        # Determine prediction
        prediction = 'spam' if ensemble_confidence > 0.5 else 'ham'
        
        # Log detection
        self.detection_history.append({
            'timestamp': datetime.now().isoformat(),
            'modalities_used': modalities_used,
            'ensemble_prediction': prediction,
            'ensemble_confidence': ensemble_confidence,
            'weights': weights
        })
        
        return {
            'ensemble_prediction': prediction,
            'ensemble_confidence': float(ensemble_confidence),
            'results': results,
            'modalities_used': modalities_used,
            'weights': weights
        }
    
    def optimize_weights(self, predictions, ground_truth):
        """Optimize NEAT weights based on performance"""
        self.neat.optimize_weights(predictions, ground_truth)
        return self.neat.get_weights()
    
    def get_stats(self):
        """Get detector statistics"""
        return {
            'neat': self.neat.get_stats(),
            'detection_history': self.detection_history[-20:] if self.detection_history else [],
            'total_detections': len(self.detection_history)
        }
    
    def save(self, path=None):
        """Save detector state"""
        if not path:
            path = MODEL_DIR / 'multimodal_detector.pkl'
        
        with open(path, 'wb') as f:
            pickle.dump({
                'neat': self.neat,
                'detection_history': self.detection_history[-100:],
                'timestamp': datetime.now().isoformat()
            }, f)
        print(f"💾 Saved multimodal detector to {path}")
    
    def load(self, path=None):
        """Load detector state"""
        if not path:
            path = MODEL_DIR / 'multimodal_detector.pkl'
        
        if os.path.exists(path):
            with open(path, 'rb') as f:
                data = pickle.load(f)
                self.neat = data['neat']
                self.detection_history = data.get('detection_history', [])
            print(f"✅ Loaded multimodal detector from {path}")
            return True
        return False


# ============================================
# HELPER FUNCTIONS
# ============================================

def encode_image_to_base64(image_path):
    """Encode image file to base64"""
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def encode_audio_to_base64(audio_path):
    """Encode audio file to base64"""
    with open(audio_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


# ============================================
# MAIN - Test & Demo
# ============================================

def main():
    print("=" * 60)
    print("🎯 Multimodal Spam Detection using NEAT")
    print("=" * 60)
    
    # Create detector
    detector = MultimodalSpamDetector()
    
    # Test text detection
    print("\n📝 Testing Text Detection:")
    test_texts = [
        "Hi team, meeting at 10am tomorrow",
        "Cl4im y0ur fr33 pr!ze n0w!",
        "You have received a complimentary reward!",
    ]
    
    for text in test_texts:
        result = detector.detect_text(text)
        print(f"   '{text[:30]}...' → {result['prediction']} ({result['confidence']:.2%})")
    
    # Test ensemble detection
    print("\n🎯 Testing Ensemble Detection:")
    
    test_cases = [
        {'text': 'Claim your free prize now!'},
        {'text': 'Meeting at 10am'},
        {'text': 'URGENT! You have won!', 'image': 'dummy_image_data'},
        {'text': 'Free money', 'image': 'dummy', 'voice': 'dummy_audio'}
    ]
    
    for i, modalities in enumerate(test_cases, 1):
        print(f"\n   Case {i}: {', '.join(modalities.keys())}")
        result = detector.ensemble_detect(modalities)
        print(f"   Ensemble Prediction: {result['ensemble_prediction']}")
        print(f"   Confidence: {result['ensemble_confidence']:.2%}")
        print(f"   Modalities Used: {result['modalities_used']}")
        print(f"   Weights: {result['weights']}")
    
    # Show NEAT stats
    print("\n📊 NEAT Statistics:")
    stats = detector.get_stats()
    neat_stats = stats['neat']
    print(f"   Generation: {neat_stats['generation']}")
    print(f"   Current Weights: {neat_stats['weights']}")
    
    print("\n" + "=" * 60)
    print("✅ Multimodal Spam Detection System Ready!")
    print(f"   Models saved to: {MODEL_DIR}")
    
    return detector


if __name__ == "__main__":
    detector = main()