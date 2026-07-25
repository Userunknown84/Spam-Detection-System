#!/usr/bin/env python3
"""
<<<<<<< Updated upstream
EvoMail - Self-Evolving Cognitive Agent for Spam Detection
Red-Team/Blue-Team framework for continuous adaptation
=======
<<<<<<< HEAD
EvoMail/COG - Self-Evolving Cognitive Agent for Spam Detection
Red-Team/Blue-Team framework with memory and reasoning
=======
EvoMail - Self-Evolving Cognitive Agent for Spam Detection
Red-Team/Blue-Team framework for continuous adaptation
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
"""

import json
import random
import pickle
import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict
import hashlib
import os
<<<<<<< Updated upstream
from pathlib import Path
=======
<<<<<<< HEAD
import re
from pathlib import Path
import heapq
=======
from pathlib import Path
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
MEMORY_PATH = BASE_DIR / 'evo_memory.pkl'
MODEL_PATH = BASE_DIR / 'evo_model.pkl'
VECTORIZER_PATH = BASE_DIR / 'evo_vectorizer.pkl'

# ============================================
<<<<<<< Updated upstream
# MEMORY MODULE
=======
<<<<<<< HEAD
# MEMORY MODULE - Experience Compression & Reasoning
=======
# MEMORY MODULE
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
# ============================================

class MemoryModule:
    """Compresses and stores experiences for future reasoning"""
    
<<<<<<< Updated upstream
    def __init__(self):
=======
<<<<<<< HEAD
    def __init__(self, max_memory=10000):
=======
    def __init__(self):
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        self.experiences = []
        self.patterns = defaultdict(int)
        self.failures = []
        self.successes = []
<<<<<<< Updated upstream
        self.max_memory = 10000
=======
<<<<<<< HEAD
        self.max_memory = max_memory
>>>>>>> Stashed changes
        self.compression_threshold = 100
        
    def add_experience(self, experience):
<<<<<<< Updated upstream
=======
        """Add new experience to memory with importance scoring"""
        # Calculate importance
        importance = self._calculate_importance(experience)
        experience['importance'] = importance
        experience['timestamp'] = datetime.now().isoformat()
        
        self.experiences.append(experience)
=======
        self.max_memory = 10000
        self.compression_threshold = 100
        
    def add_experience(self, experience):
>>>>>>> Stashed changes
        """Add new experience to memory"""
        self.experiences.append({
            'timestamp': datetime.now().isoformat(),
            'data': experience,
            'importance': experience.get('importance', 1)
        })
<<<<<<< Updated upstream
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        
        # Compress if memory is full
        if len(self.experiences) > self.max_memory:
            self.compress()
            
<<<<<<< Updated upstream
        # Extract patterns
=======
<<<<<<< HEAD
        # Extract and update patterns
>>>>>>> Stashed changes
        if 'text' in experience:
            pattern = self.extract_pattern(experience['text'])
            self.patterns[pattern] += 1
            
    def extract_pattern(self, text):
        """Extract key pattern from text"""
        # Simple pattern extraction - can be enhanced with NLP
        words = text.lower().split()
<<<<<<< Updated upstream
        if len(words) > 3:
            return ' '.join(words[:3])  # Use first 3 words as pattern
=======
        if len(words) > 5:
            # Use sliding window of 3 words as pattern
            patterns = [' '.join(words[i:i+3]) for i in range(len(words)-2)]
            return patterns[0] if patterns else text[:20]
=======
        # Extract patterns
        if 'text' in experience:
            pattern = self.extract_pattern(experience['text'])
            self.patterns[pattern] += 1
            
    def extract_pattern(self, text):
        """Extract key pattern from text"""
        # Simple pattern extraction - can be enhanced with NLP
        words = text.lower().split()
        if len(words) > 3:
            return ' '.join(words[:3])  # Use first 3 words as pattern
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        return text[:20]
    
    def compress(self):
        """Compress experiences to save memory"""
        # Keep only important experiences
        self.experiences.sort(key=lambda x: x['importance'], reverse=True)
        self.experiences = self.experiences[:self.max_memory // 2]
        
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
        # Apply importance decay
        for exp in self.experiences:
            exp['importance'] *= self.importance_decay
            
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        # Keep only top patterns
        top_patterns = sorted(
            self.patterns.items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:1000]
        self.patterns = defaultdict(int, dict(top_patterns))
        
<<<<<<< Updated upstream
    def get_relevant_experiences(self, text, limit=10):
        """Get experiences relevant to current text"""
        pattern = self.extract_pattern(text)
=======
<<<<<<< HEAD
    def recall(self, text, limit=10):
        """Retrieve relevant experiences for reasoning"""
        pattern = self._extract_pattern(text)
>>>>>>> Stashed changes
        relevant = []
        
        for exp in self.experiences:
            if pattern in exp['data'].get('text', ''):
                relevant.append(exp)
                
<<<<<<< Updated upstream
=======
        # Sort by importance and recency
        relevant.sort(key=lambda x: (x['importance'], x['timestamp']), reverse=True)
=======
    def get_relevant_experiences(self, text, limit=10):
        """Get experiences relevant to current text"""
        pattern = self.extract_pattern(text)
        relevant = []
        
        for exp in self.experiences:
            if pattern in exp['data'].get('text', ''):
                relevant.append(exp)
                
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        return relevant[:limit]
    
    def get_failure_patterns(self, limit=20):
        """Get most common failure patterns"""
<<<<<<< Updated upstream
        failures = [e for e in self.experiences if e['data'].get('failed', False)]
=======
<<<<<<< HEAD
        failures = [e for e in self.experiences if e.get('failed', False)]
>>>>>>> Stashed changes
        patterns = defaultdict(int)
        
        for f in failures:
            pattern = self.extract_pattern(f['data'].get('text', ''))
            patterns[pattern] += 1
            
        return sorted(patterns.items(), key=lambda x: x[1], reverse=True)[:limit]
    
<<<<<<< Updated upstream
=======
    def get_stats(self):
        """Get memory statistics"""
        return {
            'total_experiences': len(self.experiences),
            'unique_patterns': len(self.patterns),
            'failures': len([e for e in self.experiences if e.get('failed', False)]),
            'successes': len([e for e in self.experiences if e.get('success', False)]),
            'evaded_attacks': len([e for e in self.experiences if e.get('evaded', False)])
        }
    
=======
        failures = [e for e in self.experiences if e['data'].get('failed', False)]
        patterns = defaultdict(int)
        
        for f in failures:
            pattern = self.extract_pattern(f['data'].get('text', ''))
            patterns[pattern] += 1
            
        return sorted(patterns.items(), key=lambda x: x[1], reverse=True)[:limit]
    
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    def save(self, path=MEMORY_PATH):
        """Save memory to disk"""
        with open(path, 'wb') as f:
            pickle.dump({
                'experiences': self.experiences,
                'patterns': dict(self.patterns),
                'failures': self.failures,
                'successes': self.successes
            }, f)
            
    def load(self, path=MEMORY_PATH):
        """Load memory from disk"""
        if os.path.exists(path):
            with open(path, 'rb') as f:
                data = pickle.load(f)
                self.experiences = data.get('experiences', [])
                self.patterns = defaultdict(int, data.get('patterns', {}))
                self.failures = data.get('failures', [])
                self.successes = data.get('successes', [])


# ============================================
# RED TEAM - Adversarial Generator
# ============================================

<<<<<<< Updated upstream
class RedTeam:
    """Generates novel evasion tactics to test the model"""
=======
<<<<<<< HEAD
class AdversarialGenerator:
    """Red Team - Generates novel evasion tactics"""
=======
class RedTeam:
    """Generates novel evasion tactics to test the model"""
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    
    def __init__(self):
        self.attack_types = [
            'character_substitution',
            'synonym_replacement',
            'noise_injection',
            'sentence_rephrasing',
            'homoglyph_attack',
            'padding_attack',
<<<<<<< Updated upstream
            'spacing_attack'
=======
<<<<<<< HEAD
            'spacing_attack',
            'unicode_smuggling',
            'zero_width_attack'
>>>>>>> Stashed changes
        ]
        
        self.substitutions = {
            'a': ['@', '4', 'á', 'â', 'à', 'α'],
            'e': ['3', 'é', 'è', 'ê', 'ë', 'ε'],
            'i': ['1', '!', 'í', 'ì', 'ι', '|'],
            'o': ['0', 'ó', 'ò', 'ö', 'ο'],
            's': ['$', '5', 'z', 'ş', 'σ'],
            't': ['7', '+', '†'],
            'l': ['1', '|', 'ł'],
            'b': ['8', '6', 'ß'],
            'g': ['9', '6', 'ğ'],
            'c': ['(', '<', '{', 'ç']
        }
        
        self.synonyms = {
            'free': ['complimentary', 'gratis', 'no cost', 'without charge', 'on the house', 'costless'],
            'claim': ['win', 'get', 'receive', 'earn', 'collect', 'obtain', 'acquire'],
            'prize': ['reward', 'bonus', 'award', 'gift', 'compensation', 'prize money'],
            'urgent': ['immediate', 'critical', 'important', 'pressing', 'essential', 'imperative'],
            'click': ['tap', 'press', 'visit', 'go to', 'access', 'navigate to'],
            'win': ['earn', 'gain', 'secure', 'achieve', 'attain', 'obtain'],
            'money': ['cash', 'funds', 'currency', 'capital', 'finances', 'wealth'],
            'limited': ['restricted', 'scant', 'minimal', 'finite', 'controlled', 'bounded']
        }
        
<<<<<<< Updated upstream
    def generate_attack(self, text, attack_type=None):
=======
    def generate_attack(self, text, attack_type=None, intensity=0.3):
=======
            'spacing_attack'
        ]
        
        self.substitutions = {
            'a': ['@', '4', 'á', 'â', 'à', 'α'],
            'e': ['3', 'é', 'è', 'ê', 'ë', 'ε'],
            'i': ['1', '!', 'í', 'ì', 'ι', '|'],
            'o': ['0', 'ó', 'ò', 'ö', 'ο'],
            's': ['$', '5', 'z', 'ş', 'σ'],
            't': ['7', '+', '†'],
            'l': ['1', '|', 'ł'],
            'b': ['8', '6', 'ß'],
            'g': ['9', '6', 'ğ'],
            'c': ['(', '<', '{', 'ç']
        }
        
        self.synonyms = {
            'free': ['complimentary', 'gratis', 'no cost', 'without charge', 'on the house', 'costless'],
            'claim': ['win', 'get', 'receive', 'earn', 'collect', 'obtain', 'acquire'],
            'prize': ['reward', 'bonus', 'award', 'gift', 'compensation', 'prize money'],
            'urgent': ['immediate', 'critical', 'important', 'pressing', 'essential', 'imperative'],
            'click': ['tap', 'press', 'visit', 'go to', 'access', 'navigate to'],
            'win': ['earn', 'gain', 'secure', 'achieve', 'attain', 'obtain'],
            'money': ['cash', 'funds', 'currency', 'capital', 'finances', 'wealth'],
            'limited': ['restricted', 'scant', 'minimal', 'finite', 'controlled', 'bounded']
        }
        
    def generate_attack(self, text, attack_type=None):
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        """Generate an adversarial variant"""
        if not attack_type:
            attack_type = random.choice(self.attack_types)
            
        if attack_type == 'character_substitution':
<<<<<<< Updated upstream
            return self.character_substitution(text)
=======
<<<<<<< HEAD
            return self._character_substitution(text, intensity)
>>>>>>> Stashed changes
        elif attack_type == 'synonym_replacement':
            return self.synonym_replacement(text)
        elif attack_type == 'noise_injection':
            return self.noise_injection(text)
        elif attack_type == 'sentence_rephrasing':
            return self.sentence_rephrasing(text)
        elif attack_type == 'homoglyph_attack':
            return self.homoglyph_attack(text)
        elif attack_type == 'padding_attack':
            return self.padding_attack(text)
        elif attack_type == 'spacing_attack':
            return self.spacing_attack(text)
        return text
    
<<<<<<< Updated upstream
    def character_substitution(self, text, intensity=0.3):
=======
    def _character_substitution(self, text, intensity=0.3):
=======
            return self.character_substitution(text)
        elif attack_type == 'synonym_replacement':
            return self.synonym_replacement(text)
        elif attack_type == 'noise_injection':
            return self.noise_injection(text)
        elif attack_type == 'sentence_rephrasing':
            return self.sentence_rephrasing(text)
        elif attack_type == 'homoglyph_attack':
            return self.homoglyph_attack(text)
        elif attack_type == 'padding_attack':
            return self.padding_attack(text)
        elif attack_type == 'spacing_attack':
            return self.spacing_attack(text)
        return text
    
    def character_substitution(self, text, intensity=0.3):
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        """Replace characters with visually similar alternatives"""
        result = []
        for char in text:
            if char.lower() in self.substitutions and random.random() < intensity:
                result.append(random.choice(self.substitutions[char.lower()]))
            else:
                result.append(char)
        return ''.join(result)
    
<<<<<<< Updated upstream
    def synonym_replacement(self, text, intensity=0.4):
=======
<<<<<<< HEAD
    def _synonym_replacement(self, text, intensity=0.4):
=======
    def synonym_replacement(self, text, intensity=0.4):
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        """Replace words with synonyms"""
        words = text.split()
        result = []
        for word in words:
            word_clean = word.lower().strip('.,!?')
            if word_clean in self.synonyms and random.random() < intensity:
                new_word = random.choice(self.synonyms[word_clean])
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
                punct = word[-1] if word[-1] in '.,!?' else ''
=======
>>>>>>> Stashed changes
                # Preserve punctuation
                punct = ''
                if word and word[-1] in '.,!?':
                    punct = word[-1]
                    word = word[:-1]
<<<<<<< Updated upstream
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                result.append(new_word + punct)
            else:
                result.append(word)
        return ' '.join(result)
    
<<<<<<< Updated upstream
    def noise_injection(self, text, intensity=0.15):
=======
<<<<<<< HEAD
    def _noise_injection(self, text, intensity=0.15):
=======
    def noise_injection(self, text, intensity=0.15):
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        """Insert random noise characters"""
        if len(text) < 5:
            return text
        result = list(text)
<<<<<<< Updated upstream
        noise_chars = [' ', '.', '!', '?', ',', ';', ':' , '-', '_', '*']
=======
<<<<<<< HEAD
        noise_chars = [' ', '.', '!', '?', ',', ';', ':', '-', '_', '*']
=======
        noise_chars = [' ', '.', '!', '?', ',', ';', ':' , '-', '_', '*']
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        
        num_noise = max(1, int(len(text) * intensity))
        positions = random.sample(range(len(text)), min(num_noise, len(text) - 1))
        for pos in sorted(positions, reverse=True):
            char = random.choice(noise_chars)
            result.insert(pos, char)
        return ''.join(result)
    
<<<<<<< Updated upstream
    def sentence_rephrasing(self, text):
        """Simple rule-based sentence rephrasing"""
=======
<<<<<<< HEAD
    def _sentence_rephrasing(self, text):
        """Rule-based sentence rephrasing"""
=======
    def sentence_rephrasing(self, text):
        """Simple rule-based sentence rephrasing"""
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        rules = [
            (r'claim your (.*?) now', r'you can get your \1 today'),
            (r'you have won', r'congratulations, you are the winner of'),
            (r'click here', r'visit this link'),
            (r'free (.*?)', r'complimentary \1'),
            (r'urgent', r'important'),
            (r'limited time', r'hurry, only for a short period'),
            (r'act now', r'don\'t delay, take action'),
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
            (r'you are (.*?)', r'\1 you are'),
>>>>>>> Stashed changes
        ]
        result = text
        for pattern, replacement in rules:
            import re
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        return result
    
    def homoglyph_attack(self, text):
        """Use visually similar characters from different scripts"""
        homoglyphs = {
<<<<<<< Updated upstream
=======
            'a': 'а', 'e': 'е', 'o': 'о', 'p': 'р', 'c': 'с',
            'x': 'х', 'y': 'у', 'h': 'н', 'k': 'к', 'm': 'м'
=======
        ]
        result = text
        for pattern, replacement in rules:
            import re
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        return result
    
    def homoglyph_attack(self, text):
        """Use visually similar characters from different scripts"""
        homoglyphs = {
>>>>>>> Stashed changes
            'a': 'а',  # Cyrillic
            'e': 'е',  # Cyrillic
            'o': 'о',  # Cyrillic
            'p': 'р',  # Cyrillic
            'c': 'с',  # Cyrillic
            'x': 'х',  # Cyrillic
            'y': 'у',  # Cyrillic
<<<<<<< Updated upstream
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        }
        result = []
        for char in text:
            if char.lower() in homoglyphs and random.random() < 0.3:
                result.append(homoglyphs[char.lower()])
            else:
                result.append(char)
        return ''.join(result)
    
<<<<<<< Updated upstream
    def padding_attack(self, text):
=======
<<<<<<< HEAD
    def _padding_attack(self, text):
=======
    def padding_attack(self, text):
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        """Add padding characters between words"""
        words = text.split()
        padding = ['', '.', ',', '!', '?', ' ']
        padded = []
        for i, word in enumerate(words):
            padded.append(word)
            if i < len(words) - 1 and random.random() < 0.3:
                padded.append(random.choice(padding))
        return ' '.join(padded)
    
<<<<<<< Updated upstream
    def spacing_attack(self, text):
=======
<<<<<<< HEAD
    def _spacing_attack(self, text):
=======
    def spacing_attack(self, text):
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        """Insert extra spaces within words"""
        if len(text) < 5:
            return text
        result = []
        for char in text:
            result.append(char)
<<<<<<< Updated upstream
            if random.random() < 0.05:  # 5% chance of extra space
                result.append(' ')
        return ''.join(result)
    
=======
<<<<<<< HEAD
            if random.random() < 0.05:
                result.append(' ')
        return ''.join(result)
    
    def _unicode_smuggling(self, text):
        """Use Unicode variations to smuggle text"""
        # Add zero-width characters that don't affect display
        zero_width = ['\u200b', '\u200c', '\u200d', '\ufeff']
        if len(text) > 10:
            pos = random.randint(5, len(text) - 5)
            char = random.choice(zero_width)
            return text[:pos] + char + text[pos:]
        return text
    
    def _zero_width_attack(self, text):
        """Add zero-width characters between words"""
        words = text.split()
        zero_width = ['\u200b', '\u200c', '\u200d']
        result = []
        for i, word in enumerate(words):
            result.append(word)
            if i < len(words) - 1 and random.random() < 0.4:
                result.append(random.choice(zero_width))
        return ' '.join(result)
    
=======
            if random.random() < 0.05:  # 5% chance of extra space
                result.append(' ')
        return ''.join(result)
    
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    def generate_batch(self, texts, num_variants=3):
        """Generate multiple attacks for a batch of texts"""
        attacks = []
        for text in texts:
            for _ in range(num_variants):
                attack_type = random.choice(self.attack_types)
<<<<<<< Updated upstream
                variant = self.generate_attack(text, attack_type)
                attacks.append({
                    'original': text,
                    'variant': variant,
                    'attack_type': attack_type
=======
<<<<<<< HEAD
                intensity = 0.2 + random.random() * 0.3
                variant = self.generate_attack(text, attack_type, intensity)
                attacks.append({
                    'original': text,
                    'variant': variant,
                    'attack_type': attack_type,
                    'intensity': intensity
=======
                variant = self.generate_attack(text, attack_type)
                attacks.append({
                    'original': text,
                    'variant': variant,
                    'attack_type': attack_type
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                })
        return attacks


# ============================================
# BLUE TEAM - Adaptive Detector
# ============================================

<<<<<<< Updated upstream
class BlueTeam:
    """Learns from failures and adapts detection"""
=======
<<<<<<< HEAD
class SpamDetector:
    """Blue Team - Learns from failures and adapts"""
=======
class BlueTeam:
    """Learns from failures and adapts detection"""
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.label_encoder = None
        self.training_history = []
        self.failure_log = []
        self.adaptation_count = 0
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
        self.confidence_threshold = 0.6
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        
    def load_model(self, model_path, vectorizer_path, label_encoder_path):
        """Load existing model"""
        import joblib
        self.model = joblib.load(model_path)
        self.vectorizer = joblib.load(vectorizer_path)
        self.label_encoder = joblib.load(label_encoder_path)
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
        return True
    
    def detect(self, text):
        """Detect spam with confidence score"""
        if not self.model or not self.vectorizer:
            return {'prediction': 'ham', 'confidence': 0.5}
>>>>>>> Stashed changes
        
    def detect_failures(self, predictions, ground_truth):
        """Identify where the model failed"""
        failures = []
        for pred, truth in zip(predictions, ground_truth):
            if pred != truth:
                failures.append({
                    'predicted': pred,
                    'actual': truth,
                    'timestamp': datetime.now().isoformat()
                })
        return failures
    
    def learn_from_failure(self, failure_data, memory):
        """Learn from a failure"""
        self.failure_log.append(failure_data)
<<<<<<< Updated upstream
=======
        self.adaptation_count += 1
=======
        
    def detect_failures(self, predictions, ground_truth):
        """Identify where the model failed"""
        failures = []
        for pred, truth in zip(predictions, ground_truth):
            if pred != truth:
                failures.append({
                    'predicted': pred,
                    'actual': truth,
                    'timestamp': datetime.now().isoformat()
                })
        return failures
    
    def learn_from_failure(self, failure_data, memory):
        """Learn from a failure"""
        self.failure_log.append(failure_data)
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        
        # Add to memory
        memory.add_experience({
            'text': failure_data.get('text', ''),
            'predicted': failure_data.get('predicted', ''),
            'actual': failure_data.get('actual', ''),
            'failed': True,
<<<<<<< Updated upstream
            'importance': 2  # Higher importance
=======
<<<<<<< HEAD
            'attack_type': failure_data.get('attack_type', 'unknown'),
            'importance': 3.0
>>>>>>> Stashed changes
        })
        
        # Update adaptation count
        self.adaptation_count += 1
        
    def adapt(self, training_data, labels):
        """Adapt the model with new training data"""
        if not self.model or not self.vectorizer:
            return
            
        # Vectorize new data
        X_new = self.vectorizer.transform(training_data)
        y_new = self.label_encoder.transform(labels)
        
        # Incremental learning
        # For SVM, we need to retrain (simplified approach)
        # In production, use partial_fit if available
        
<<<<<<< Updated upstream
        # Log adaptation
=======
        # Train model
        model = LinearSVC(class_weight='balanced', max_iter=2000, random_state=42)
        model.fit(X, y)
        
        # Save
        self.model = model
        self.vectorizer = vectorizer
        self.label_encoder = le
        
        # Log training
=======
            'importance': 2  # Higher importance
        })
        
        # Update adaptation count
        self.adaptation_count += 1
        
    def adapt(self, training_data, labels):
        """Adapt the model with new training data"""
        if not self.model or not self.vectorizer:
            return
            
        # Vectorize new data
        X_new = self.vectorizer.transform(training_data)
        y_new = self.label_encoder.transform(labels)
        
        # Incremental learning
        # For SVM, we need to retrain (simplified approach)
        # In production, use partial_fit if available
        
        # Log adaptation
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        self.training_history.append({
            'timestamp': datetime.now().isoformat(),
            'num_samples': len(training_data),
            'adaptation': self.adaptation_count
        })
        
<<<<<<< Updated upstream
        return X_new, y_new
=======
<<<<<<< HEAD
        return True


# ============================================
# COGNITIVE REASONING - GNN Enhanced
# ============================================

class CognitiveGNN:
    """Cognitive Graph Neural Network for reasoning"""
    
    def __init__(self):
        self.memory_graph = {}
        self.node_embeddings = {}
        self.reasoning_depth = 3
        
    def build_graph(self, memory):
        """Build reasoning graph from memory"""
        graph = {}
        for exp in memory.experiences:
            node_id = hashlib.md5(exp.get('text', '').encode()).hexdigest()
            if node_id not in graph:
                graph[node_id] = {
                    'text': exp.get('text', '')[:100],
                    'importance': exp.get('importance', 1.0),
                    'connections': [],
                    'label': exp.get('predicted', 'unknown')
                }
                
        # Add connections between related experiences
        nodes = list(graph.keys())
        for i in range(len(nodes)):
            for j in range(i + 1, len(nodes)):
                if self._are_related(graph[nodes[i]]['text'], graph[nodes[j]]['text']):
                    graph[nodes[i]]['connections'].append(nodes[j])
                    graph[nodes[j]]['connections'].append(nodes[i])
                    
        return graph
    
    def _are_related(self, text1, text2):
        """Check if two texts are related"""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        if not words1 or not words2:
            return False
        overlap = len(words1 & words2)
        return overlap > 0
    
    def reason(self, memory, query_text=None):
        """Perform cognitive reasoning on memory"""
        graph = self.build_graph(memory)
        
        if query_text:
            # Find relevant nodes
            query_words = set(query_text.lower().split())
            relevant = []
            for node_id, node_data in graph.items():
                node_words = set(node_data['text'].lower().split())
                if query_words & node_words:
                    relevant.append((node_id, len(query_words & node_words)))
            
            # Sort by relevance
            relevant.sort(key=lambda x: x[1], reverse=True)
            
            if relevant:
                # Follow connections for reasoning depth
                reasoning_path = []
                for node_id, _ in relevant[:3]:
                    path = self._traverse_graph(graph, node_id, depth=self.reasoning_depth)
                    reasoning_path.extend(path)
                    
                return {
                    'reasoning_path': reasoning_path,
                    'conclusion': self._synthesize_insight(reasoning_path, query_text)
                }
        
        return {
            'graph_size': len(graph),
            'nodes': len(graph),
            'connections': sum(len(n['connections']) for n in graph.values()) // 2
        }
    
    def _traverse_graph(self, graph, node_id, depth=3):
        """Traverse graph for reasoning"""
        visited = set()
        path = []
        
        def dfs(current, d):
            if d == 0 or current not in graph:
                return
            visited.add(current)
            path.append({
                'node': current,
                'text': graph[current]['text'][:50],
                'label': graph[current]['label']
            })
            for neighbor in graph[current]['connections'][:3]:
                if neighbor not in visited:
                    dfs(neighbor, d - 1)
        
        dfs(node_id, depth)
        return path
    
    def _synthesize_insight(self, reasoning_path, query_text):
        """Synthesize reasoning into insight"""
        if not reasoning_path:
            return "No relevant memory found"
        
        labels = [p['label'] for p in reasoning_path if p['label'] != 'unknown']
        if labels:
            most_common = max(set(labels), key=labels.count)
            return f"Based on {len(reasoning_path)} related experiences, pattern suggests '{most_common}'"
        
        return "Insufficient data for reasoning"
=======
        return X_new, y_new
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes


# ============================================
# COGNITIVE AGENT - Main Orchestrator
# ============================================

class CognitiveAgent:
    """Self-evolving cognitive agent for spam detection"""
    
    def __init__(self):
        self.memory = MemoryModule()
<<<<<<< Updated upstream
        self.red_team = RedTeam()
        self.blue_team = BlueTeam()
=======
<<<<<<< HEAD
        self.red_team = AdversarialGenerator()
        self.blue_team = SpamDetector()
        self.coggcn = CognitiveGNN()
=======
        self.red_team = RedTeam()
        self.blue_team = BlueTeam()
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        self.evolution_cycle = 0
        self.config = {
            'evolution_interval_hours': 24,
            'min_samples_for_evolution': 10,
<<<<<<< Updated upstream
            'memory_size': 10000,
            'attack_variants': 3
=======
<<<<<<< HEAD
            'attack_variants': 3,
            'confidence_threshold': 0.6
>>>>>>> Stashed changes
        }
        
<<<<<<< Updated upstream
        # Load existing state if available
=======
        # Load existing state
=======
            'memory_size': 10000,
            'attack_variants': 3
        }
        
        # Load existing state if available
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        self.load_state()
        
    def detect(self, text):
        """Detect spam with cognitive reasoning"""
<<<<<<< Updated upstream
        # Check memory for similar patterns
        relevant = self.memory.get_relevant_experiences(text, limit=5)
=======
<<<<<<< HEAD
        # 1. Get base prediction from Blue Team
        result = self.blue_team.detect(text)
>>>>>>> Stashed changes
        
        # Get base prediction from model
        if self.blue_team.model:
            import joblib
            vector = self.blue_team.vectorizer.transform([text])
            prediction = self.blue_team.model.predict(vector)[0]
            confidence = self.get_confidence(text)
        else:
            prediction = 'ham'
            confidence = 0.5
            
        # Enhance with memory
        if relevant:
            memory_boost = self.memory_enhance(relevant, prediction)
            confidence = min(confidence + memory_boost, 0.99)
            
        return {
            'prediction': prediction,
            'confidence': confidence,
            'memory_used': len(relevant),
            'evolution_cycle': self.evolution_cycle
        }
    
    def get_confidence(self, text):
        """Get prediction confidence"""
        if not self.blue_team.model:
            return 0.5
        try:
            import joblib
            vector = self.blue_team.vectorizer.transform([text])
            if hasattr(self.blue_team.model, 'predict_proba'):
                proba = self.blue_team.model.predict_proba(vector)
                return float(max(proba[0]))
            elif hasattr(self.blue_team.model, 'decision_function'):
                decision = self.blue_team.model.decision_function(vector)
                proba = 1 / (1 + np.exp(-np.abs(decision)))
                return float(proba)
        except:
            pass
        return 0.5
    
    def memory_enhance(self, relevant, prediction):
        """Boost confidence based on memory"""
        # Count how many relevant experiences confirm the prediction
        confirmations = 0
        for exp in relevant:
            if exp['data'].get('predicted', '') == prediction:
                confirmations += 1
<<<<<<< Updated upstream
        boost = min(confirmations * 0.05, 0.2)  # Max 20% boost
=======
            if exp.get('actual', '') == prediction:
                confirmations += 1
                
        boost = min(confirmations * 0.05, 0.2)
=======
        # Check memory for similar patterns
        relevant = self.memory.get_relevant_experiences(text, limit=5)
        
        # Get base prediction from model
        if self.blue_team.model:
            import joblib
            vector = self.blue_team.vectorizer.transform([text])
            prediction = self.blue_team.model.predict(vector)[0]
            confidence = self.get_confidence(text)
        else:
            prediction = 'ham'
            confidence = 0.5
            
        # Enhance with memory
        if relevant:
            memory_boost = self.memory_enhance(relevant, prediction)
            confidence = min(confidence + memory_boost, 0.99)
            
        return {
            'prediction': prediction,
            'confidence': confidence,
            'memory_used': len(relevant),
            'evolution_cycle': self.evolution_cycle
        }
    
    def get_confidence(self, text):
        """Get prediction confidence"""
        if not self.blue_team.model:
            return 0.5
        try:
            import joblib
            vector = self.blue_team.vectorizer.transform([text])
            if hasattr(self.blue_team.model, 'predict_proba'):
                proba = self.blue_team.model.predict_proba(vector)
                return float(max(proba[0]))
            elif hasattr(self.blue_team.model, 'decision_function'):
                decision = self.blue_team.model.decision_function(vector)
                proba = 1 / (1 + np.exp(-np.abs(decision)))
                return float(proba)
        except:
            pass
        return 0.5
    
    def memory_enhance(self, relevant, prediction):
        """Boost confidence based on memory"""
        # Count how many relevant experiences confirm the prediction
        confirmations = 0
        for exp in relevant:
            if exp['data'].get('predicted', '') == prediction:
                confirmations += 1
        boost = min(confirmations * 0.05, 0.2)  # Max 20% boost
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        return boost
    
    def evolve(self, new_data=None):
        """Self-evolve the agent"""
        self.evolution_cycle += 1
<<<<<<< Updated upstream
        
        # Step 1: Generate attacks using Red Team
=======
<<<<<<< HEAD
        results = {
            'evolution_cycle': self.evolution_cycle,
            'attacks_generated': 0,
            'evaded_attacks': 0,
            'memory_size': len(self.memory.experiences),
            'timestamp': datetime.now().isoformat()
        }
        
        # Step 1: Red Team generates attacks
=======
        
        # Step 1: Generate attacks using Red Team
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        if new_data:
            attacks = self.red_team.generate_batch(
                new_data, 
                num_variants=self.config['attack_variants']
            )
        else:
            # Use memory to generate attacks
            texts = []
<<<<<<< Updated upstream
            for exp in self.memory.experiences[-100:]:
                if 'text' in exp['data']:
                    texts.append(exp['data']['text'])
=======
<<<<<<< HEAD
            for exp in self.memory.experiences[-50:]:
                if 'text' in exp:
                    texts.append(exp['text'])
=======
            for exp in self.memory.experiences[-100:]:
                if 'text' in exp['data']:
                    texts.append(exp['data']['text'])
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
            if texts:
                attacks = self.red_team.generate_batch(
                    texts,
                    num_variants=self.config['attack_variants']
                )
            else:
                attacks = []
        
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
        results['attacks_generated'] = len(attacks)
        
>>>>>>> Stashed changes
        # Step 2: Test Blue Team on attacks
        if attacks and self.blue_team.model:
            import joblib
            results = []
            for attack in attacks:
                variant = attack['variant']
                vector = self.blue_team.vectorizer.transform([variant])
                prediction = self.blue_team.model.predict(vector)[0]
                
                # Check if attack evaded detection
                # Assuming we want to detect spam
                if prediction == 'ham':  # Attack evaded detection
                    results.append({
                        'attack': attack,
                        'prediction': prediction,
                        'evaded': True
                    })
                    
            # Step 3: Learn from evaded attacks
            for result in results:
                if result['evaded']:
                    # Add to memory
                    self.memory.add_experience({
                        'text': result['attack']['variant'],
                        'original': result['attack']['original'],
                        'attack_type': result['attack']['attack_type'],
                        'predicted': 'ham',
                        'actual': 'spam',
                        'evaded': True,
<<<<<<< Updated upstream
                        'importance': 3  # High importance
=======
                        'failed': True,
                        'importance': 4.0
=======
        # Step 2: Test Blue Team on attacks
        if attacks and self.blue_team.model:
            import joblib
            results = []
            for attack in attacks:
                variant = attack['variant']
                vector = self.blue_team.vectorizer.transform([variant])
                prediction = self.blue_team.model.predict(vector)[0]
                
                # Check if attack evaded detection
                # Assuming we want to detect spam
                if prediction == 'ham':  # Attack evaded detection
                    results.append({
                        'attack': attack,
                        'prediction': prediction,
                        'evaded': True
                    })
                    
            # Step 3: Learn from evaded attacks
            for result in results:
                if result['evaded']:
                    # Add to memory
                    self.memory.add_experience({
                        'text': result['attack']['variant'],
                        'original': result['attack']['original'],
                        'attack_type': result['attack']['attack_type'],
                        'predicted': 'ham',
                        'actual': 'spam',
                        'evaded': True,
                        'importance': 3  # High importance
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                    })
                    
                    # Blue Team learns
                    self.blue_team.learn_from_failure({
<<<<<<< Updated upstream
                        'text': result['attack']['variant'],
=======
<<<<<<< HEAD
                        'text': attack['variant'],
>>>>>>> Stashed changes
                        'predicted': 'ham',
                        'actual': 'spam',
                        'attack_type': result['attack']['attack_type']
                    }, self.memory)
        
        # Step 4: Compress memory
        self.memory.compress()
        
        # Step 5: Save state
        self.save_state()
        
<<<<<<< Updated upstream
=======
        return results
=======
                        'text': result['attack']['variant'],
                        'predicted': 'ham',
                        'actual': 'spam',
                        'attack_type': result['attack']['attack_type']
                    }, self.memory)
        
        # Step 4: Compress memory
        self.memory.compress()
        
        # Step 5: Save state
        self.save_state()
        
>>>>>>> Stashed changes
        return {
            'evolution_cycle': self.evolution_cycle,
            'attacks_generated': len(attacks),
            'evaded_attacks': len(results) if attacks else 0,
            'memory_size': len(self.memory.experiences),
            'timestamp': datetime.now().isoformat()
        }
<<<<<<< Updated upstream
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    
    def save_state(self):
        """Save cognitive agent state"""
        self.memory.save(MEMORY_PATH)
        
    def load_state(self):
        """Load cognitive agent state"""
        if os.path.exists(MEMORY_PATH):
            self.memory.load(MEMORY_PATH)
            
    def get_stats(self):
        """Get agent statistics"""
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
        memory_stats = self.memory.get_stats()
>>>>>>> Stashed changes
        return {
            'evolution_cycle': self.evolution_cycle,
            'memory_size': len(self.memory.experiences),
            'patterns_count': len(self.memory.patterns),
            'failure_count': len(self.blue_team.failure_log),
            'adaptation_count': self.blue_team.adaptation_count,
<<<<<<< Updated upstream
            'attack_types': self.red_team.attack_types
=======
            'last_evolution': self.last_evolution.isoformat() if self.last_evolution else None,
            'attack_types': self.red_team.attack_types[:5],
            'confidence_threshold': self.config['confidence_threshold']
=======
        return {
            'evolution_cycle': self.evolution_cycle,
            'memory_size': len(self.memory.experiences),
            'patterns_count': len(self.memory.patterns),
            'failure_count': len(self.blue_team.failure_log),
            'adaptation_count': self.blue_team.adaptation_count,
            'attack_types': self.red_team.attack_types
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        }


# ============================================
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
# MAIN - Test & Demo
=======
>>>>>>> Stashed changes
# EVOLUTION SCHEDULER
# ============================================

class EvolutionScheduler:
    """Schedules automatic evolution of the cognitive agent"""
    
    def __init__(self, agent):
        self.agent = agent
        self.last_evolution = None
        self.schedule = {
            'interval_hours': 24,
            'enabled': True
        }
        
    def check_and_evolve(self, force=False):
        """Check if evolution is needed"""
        if not self.schedule['enabled'] and not force:
            return None
            
        if force:
            return self.agent.evolve()
            
        now = datetime.now()
        if self.last_evolution:
            elapsed = (now - self.last_evolution).total_seconds() / 3600
            if elapsed >= self.schedule['interval_hours']:
                result = self.agent.evolve()
                self.last_evolution = now
                return result
        else:
            # First evolution
            result = self.agent.evolve()
            self.last_evolution = now
            return result
            
        return None
    
    def get_next_evolution_time(self):
        """Get next scheduled evolution time"""
        if not self.last_evolution:
            return datetime.now()
        return self.last_evolution + timedelta(hours=self.schedule['interval_hours'])


# ============================================
# MAIN - Standalone Execution
<<<<<<< Updated upstream
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
# ============================================

def main():
    print("=" * 60)
<<<<<<< Updated upstream
    print("🧠 EvoMail - Self-Evolving Cognitive Agent")
=======
<<<<<<< HEAD
    print("🧠 EvoMail/COG - Self-Evolving Cognitive Agent")
=======
    print("🧠 EvoMail - Self-Evolving Cognitive Agent")
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    print("=" * 60)
    
    # Create agent
    agent = CognitiveAgent()
    
    print(f"\n📊 Agent Stats:")
    stats = agent.get_stats()
    for key, value in stats.items():
<<<<<<< Updated upstream
        print(f"   {key}: {value}")
=======
<<<<<<< HEAD
        if key != 'attack_types':
            print(f"   {key}: {value}")
=======
        print(f"   {key}: {value}")
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    
    print("\n🔄 Running initial evolution...")
    result = agent.evolve()
    print(f"   Evolution Cycle: {result['evolution_cycle']}")
    print(f"   Memory Size: {result['memory_size']}")
    
<<<<<<< Updated upstream
    # Create scheduler
    scheduler = EvolutionScheduler(agent)
    
    print("\n⏰ Scheduler Status:")
    print(f"   Enabled: {scheduler.schedule['enabled']}")
    print(f"   Interval: {scheduler.schedule['interval_hours']} hours")
    
=======
<<<<<<< HEAD
>>>>>>> Stashed changes
    # Test detection
    test_texts = [
        "Claim your free prize now!",
        "Meeting at 10am tomorrow",
        "You have won a free iPhone!"
    ]
    
    print("\n🧪 Testing Detection:")
    for text in test_texts:
        result = agent.detect(text)
        print(f"   '{text[:30]}...' → {result['prediction']} (conf: {result['confidence']:.2f})")
    
<<<<<<< Updated upstream
    print("\n✅ EvoMail initialized successfully!")
=======
    print("\n" + "=" * 60)
    print("✅ EvoMail Cognitive Agent initialized!")
=======
    # Create scheduler
    scheduler = EvolutionScheduler(agent)
    
    print("\n⏰ Scheduler Status:")
    print(f"   Enabled: {scheduler.schedule['enabled']}")
    print(f"   Interval: {scheduler.schedule['interval_hours']} hours")
    
    # Test detection
    test_texts = [
        "Claim your free prize now!",
        "Meeting at 10am tomorrow",
        "You have won a free iPhone!"
    ]
    
    print("\n🧪 Testing Detection:")
    for text in test_texts:
        result = agent.detect(text)
        print(f"   '{text[:30]}...' → {result['prediction']} (conf: {result['confidence']:.2f})")
    
    print("\n✅ EvoMail initialized successfully!")
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    print(f"   Memory Path: {MEMORY_PATH}")
    
    return agent


if __name__ == "__main__":
    agent = main()