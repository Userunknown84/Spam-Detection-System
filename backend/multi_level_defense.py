#!/usr/bin/env python3
"""
Multi-Level Adversarial Defense System
Detects adversarial attacks at word, character, sentence, and paragraph levels
"""

import re
import sys
import json
import argparse
import numpy as np
from collections import Counter, defaultdict
from pathlib import Path
import pickle
from datetime import datetime
import hashlib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import LinearSVC
from sklearn.linear_model import LogisticRegression
import joblib
import os

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / 'models'
MODEL_DIR.mkdir(exist_ok=True)

# ============================================
# CHARACTER LEVEL DETECTOR
# ============================================

class CharacterPatternDetector:
    """Detects character-level obfuscation attacks"""
    
    def __init__(self):
        self.leetspeak_map = {
            'a': ['@', '4', 'á', 'â', 'à', 'α'],
            'e': ['3', 'é', 'è', 'ê', 'ë', 'ε'],
            'i': ['1', '!', 'í', 'ì', 'ι', '|'],
            'o': ['0', 'ó', 'ò', 'ö', 'ο', 'ø'],
            's': ['$', '5', 'z', 'ş', 'σ', 'ž'],
            't': ['7', '+', '†'],
            'l': ['1', '|', 'ł', 'ℓ'],
            'b': ['8', '6', 'ß'],
            'g': ['9', '6', 'ğ', 'η'],
            'c': ['(', '<', '{', 'ç', '¢'],
            'r': ['2', '®', 'я'],
            'u': ['v', 'ü', 'µ'],
            'n': ['ñ', 'ŋ', 'η'],
            'x': ['×', '%', 'ж'],
            'y': ['¥', 'ý', 'ÿ', 'φ'],
            'p': ['ρ', 'Þ'],
            'd': ['∂', 'ð'],
            'f': ['ƒ', '∫'],
            'h': ['ĥ', 'ħ'],
            'k': ['κ', 'ķ'],
            'm': ['м', 'ṁ'],
            'w': ['ω', 'ŵ', 'ѡ']
        }
        
        self.homoglyph_pattern = re.compile(r'[^\x00-\x7F]')
        self.repeated_pattern = re.compile(r'(.)\1{3,}')
        
    def detect(self, text):
        """Detect character-level adversarial patterns"""
        results = {
            'leetspeak_score': 0,
            'homoglyph_count': 0,
            'repeated_chars': 0,
            'suspicious': False,
            'details': []
        }
        
        if not text or len(text) == 0:
            return results
        
        # Check leetspeak
        leetspeak_count = 0
        for char in text.lower():
            if char in self.leetspeak_map:
                leetspeak_count += 1
        
        results['leetspeak_score'] = leetspeak_count / len(text)
        
        if results['leetspeak_score'] > 0.1:
            results['suspicious'] = True
            results['details'].append(f"Leetspeak detected: {results['leetspeak_score']:.2%}")
        
        # Check homoglyphs (Unicode characters)
        homoglyphs = self.homoglyph_pattern.findall(text)
        results['homoglyph_count'] = len(homoglyphs)
        if homoglyphs:
            results['suspicious'] = True
            results['details'].append(f"Homoglyphs detected: {len(homoglyphs)}")
        
        # Check repeated characters
        repeated = self.repeated_pattern.findall(text)
        results['repeated_chars'] = len(repeated)
        if repeated:
            results['suspicious'] = True
            results['details'].append(f"Repeated chars: {len(repeated)}")
        
        results['confidence'] = min(1.0, (
            results['leetspeak_score'] * 2 +
            results['homoglyph_count'] * 0.05 +
            results['repeated_chars'] * 0.1
        ))
        
        return results


# ============================================
# WORD LEVEL DETECTOR
# ============================================

class SynonymDetector:
    """Detects synonym replacement attacks"""
    
    def __init__(self):
        self.spam_synonyms = {
            'free': ['complimentary', 'gratis', 'without charge', 'on the house', 'costless'],
            'claim': ['win', 'get', 'receive', 'earn', 'collect', 'obtain'],
            'prize': ['reward', 'bonus', 'award', 'gift', 'compensation'],
            'urgent': ['immediate', 'critical', 'important', 'pressing', 'essential'],
            'click': ['tap', 'press', 'visit', 'go to', 'access'],
            'win': ['earn', 'gain', 'secure', 'achieve', 'attain'],
            'money': ['cash', 'funds', 'currency', 'capital', 'finances'],
            'limited': ['restricted', 'scant', 'minimal', 'finite', 'controlled'],
            'offer': ['proposal', 'deal', 'opportunity', 'proposition', 'bid'],
            'guaranteed': ['assured', 'certain', 'promised', 'secure', 'confirmed'],
            'exclusive': ['private', 'select', 'elite', 'privileged', 'personal'],
            'unlimited': ['infinite', 'boundless', 'endless', 'unrestricted', 'without limits'],
            'instant': ['immediate', 'prompt', 'rapid', 'swift', 'accelerated'],
            'bonus': ['incentive', 'reward', 'extra', 'premium', 'additional'],
            'cash': ['money', 'currency', 'funds', 'capital', 'liquidity'],
            'deal': ['offer', 'opportunity', 'proposition', 'arrangement', 'transaction']
        }
        
        self.suspicious_patterns = [
            r'\b[A-Z][a-z]+\b\s+\b[A-Z][a-z]+\b\s+\b[A-Z][a-z]+\b',
            r'\b[A-Z]{2,}\b'
        ]
        self.compiled_patterns = [re.compile(p) for p in self.suspicious_patterns]
        
    def detect(self, text):
        """Detect word-level adversarial patterns"""
        results = {
            'synonym_score': 0,
            'suspicious_words': [],
            'unusual_caps': 0,
            'suspicious': False,
            'details': []
        }
        
        if not text:
            return results
            
        words = text.lower().split()
        total_words = len(words)
        
        if total_words == 0:
            return results
        
        # Check for synonyms
        synonym_count = 0
        for word in words:
            word_clean = word.strip('.,!?')
            for spam_word, synonyms in self.spam_synonyms.items():
                if word_clean in synonyms:
                    synonym_count += 1
                    results['suspicious_words'].append(word_clean)
                    break
        
        results['synonym_score'] = synonym_count / total_words
        
        if results['synonym_score'] > 0.15:
            results['suspicious'] = True
            results['details'].append(f"Synonyms detected: {synonym_count}")
        
        # Check for suspicious patterns
        for pattern in self.compiled_patterns:
            matches = pattern.findall(text)
            if matches:
                results['unusual_caps'] += len(matches)
                results['suspicious'] = True
                results['details'].append(f"Unusual caps: {len(matches)}")
        
        results['confidence'] = min(1.0, (
            results['synonym_score'] * 2 +
            results['unusual_caps'] * 0.05
        ))
        
        return results


# ============================================
# SENTENCE LEVEL DETECTOR
# ============================================

class SemanticAnalyzer:
    """Detects sentence-level rephrasing attacks"""
    
    def __init__(self):
        self.urgency_patterns = [
            r'\b(urgent|immediate|critical|important|pressing|essential|imperative|crucial)\b',
            r'\b(act now|don\'t delay|limited time|hurry|expires|deadline)\b',
            r'\b(guaranteed|promised|secure|confirmed|assured)\b',
            r'\b(exclusive|private|personal|select|elite)\b'
        ]
        self.compiled_urgency = [re.compile(p, re.I) for p in self.urgency_patterns]
        
        self.spam_starters = [
            'congratulations', 'you have won', 'you are the winner', 
            'you have been selected', 'you are eligible', 'you are the lucky',
            'claim your', 'get your free', 'win a', 'earn money'
        ]
        
    def detect(self, text):
        """Detect sentence-level adversarial patterns"""
        results = {
            'urgency_score': 0,
            'spam_structure': False,
            'sentence_count': 0,
            'suspicious': False,
            'details': []
        }
        
        if not text:
            return results
            
        sentences = re.split(r'[.!?]+', text)
        results['sentence_count'] = len([s for s in sentences if s.strip()])
        
        if results['sentence_count'] == 0:
            return results
        
        # Check urgency patterns
        urgency_matches = 0
        for pattern in self.compiled_urgency:
            matches = pattern.findall(text)
            urgency_matches += len(matches)
        
        results['urgency_score'] = urgency_matches / results['sentence_count']
        
        if results['urgency_score'] > 0.3:
            results['suspicious'] = True
            results['details'].append(f"Urgency patterns: {urgency_matches}")
        
        # Check for spam starters
        text_lower = text.lower()
        for starter in self.spam_starters:
            if starter in text_lower:
                results['spam_structure'] = True
                results['suspicious'] = True
                results['details'].append(f"Spam sentence pattern: {starter}")
                break
        
        results['confidence'] = min(1.0, (
            results['urgency_score'] * 1.5 +
            (1 if results['spam_structure'] else 0) * 0.3
        ))
        
        return results


# ============================================
# PARAGRAPH LEVEL DETECTOR
# ============================================

class LLMContentDetector:
    """Detects AI-generated paragraph-level attacks"""
    
    def __init__(self):
        self.ai_indicators = [
            r'\b(additionally|furthermore|moreover|consequently|therefore|thus|hence)\b',
            r'\b(in conclusion|to summarize|overall|ultimately)\b',
            r'\b(moreover|furthermore|additionally|in addition)\b',
            r'\b(however|nevertheless|nonetheless|whereas|although)\b'
        ]
        self.compiled_indicators = [re.compile(p, re.I) for p in self.ai_indicators]
        
        self.suspicious_phrases = [
            'click here', 'visit this link', 'limited time offer',
            'act now', 'don\'t miss out', 'exclusive opportunity',
            'you have been selected', 'claim your prize'
        ]
        
    def detect(self, text):
        """Detect paragraph-level AI-generated patterns"""
        results = {
            'ai_indicator_count': 0,
            'suspicious_phrases': [],
            'length': len(text),
            'suspicious': False,
            'details': []
        }
        
        if not text:
            return results
        
        # Check AI indicators
        for pattern in self.compiled_indicators:
            matches = pattern.findall(text)
            results['ai_indicator_count'] += len(matches)
        
        if results['ai_indicator_count'] > 3:
            results['suspicious'] = True
            results['details'].append(f"AI indicators: {results['ai_indicator_count']}")
        
        # Check suspicious phrases
        text_lower = text.lower()
        for phrase in self.suspicious_phrases:
            if phrase in text_lower:
                results['suspicious_phrases'].append(phrase)
                results['suspicious'] = True
        
        if results['suspicious_phrases']:
            results['details'].append(f"Suspicious phrases: {len(results['suspicious_phrases'])}")
        
        # Check for unusually long paragraphs
        if results['length'] > 500:
            results['suspicious'] = True
            results['details'].append(f"Unusually long: {results['length']} chars")
        
        results['confidence'] = min(1.0, (
            results['ai_indicator_count'] * 0.1 +
            len(results['suspicious_phrases']) * 0.15 +
            (1 if results['length'] > 500 else 0) * 0.2
        ))
        
        return results


# ============================================
# MULTI-LEVEL ADVERSARIAL DEFENSE
# ============================================

class MultiLevelAdversarialDefense:
    """Orchestrates all level detectors and provides ensemble voting"""
    
    def __init__(self):
        self.detectors = {
            'character': CharacterPatternDetector(),
            'word': SynonymDetector(),
            'sentence': SemanticAnalyzer(),
            'paragraph': LLMContentDetector()
        }
        self.weights = {
            'character': 0.25,
            'word': 0.25,
            'sentence': 0.25,
            'paragraph': 0.25
        }
        self.threshold = 0.5
        self.meta_classifier = None
        
        # Load if exists
        self.load()
    
    def detect(self, text):
        """Run all detectors and ensemble vote"""
        results = {}
        confidence_scores = []
        level_results = {}
        
        for level, detector in self.detectors.items():
            result = detector.detect(text)
            level_results[level] = result
            confidence_scores.append(result.get('confidence', 0))
            results[level] = result
        
        # Calculate ensemble confidence
        if self.meta_classifier:
            try:
                features = self._extract_meta_features(level_results)
                ensemble_confidence = float(self.meta_classifier.predict_proba([features])[0][1])
            except:
                ensemble_confidence = np.average(confidence_scores, weights=list(self.weights.values()))
        else:
            ensemble_confidence = np.average(confidence_scores, weights=list(self.weights.values()))
        
        # Determine if adversarial
        is_adversarial = ensemble_confidence > self.threshold
        
        # Generate report
        report = {
            'is_adversarial': is_adversarial,
            'ensemble_confidence': float(ensemble_confidence),
            'level_results': level_results,
            'summary': self._generate_summary(level_results, is_adversarial),
            'attack_levels': [level for level, r in level_results.items() if r.get('suspicious', False)]
        }
        
        return report
    
    def _extract_meta_features(self, level_results):
        """Extract features for meta-classifier"""
        features = []
        for level, result in level_results.items():
            features.append(result.get('confidence', 0))
            features.append(1 if result.get('suspicious', False) else 0)
            features.append(len(result.get('details', [])))
        return features
    
    def _generate_summary(self, level_results, is_adversarial):
        """Generate human-readable summary"""
        if not is_adversarial:
            return "No adversarial patterns detected"
        
        summary = "Adversarial attack detected at level(s): "
        attack_levels = [level for level, r in level_results.items() if r.get('suspicious', False)]
        summary += ", ".join(attack_levels)
        
        details = []
        for level, result in level_results.items():
            if result.get('suspicious', False) and result.get('details'):
                details.extend(result['details'])
        
        if details:
            summary += ". Details: " + "; ".join(details[:3])
        
        return summary
    
    def train_meta_classifier(self, X, y):
        """Train meta-classifier on labeled adversarial samples"""
        self.meta_classifier = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self.meta_classifier.fit(X, y)
        self.save()
        return self.meta_classifier
    
    def save(self):
        """Save meta-classifier"""
        if self.meta_classifier:
            joblib.dump(self.meta_classifier, MODEL_DIR / 'meta_classifier.pkl')
            print(f"💾 Saved meta-classifier to {MODEL_DIR / 'meta_classifier.pkl'}", file=sys.stderr)
    
    def load(self):
        """Load meta-classifier"""
        try:
            if (MODEL_DIR / 'meta_classifier.pkl').exists():
                self.meta_classifier = joblib.load(MODEL_DIR / 'meta_classifier.pkl')
                print("✅ Meta-classifier loaded", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Failed to load meta-classifier: {e}", file=sys.stderr)


# ============================================
# MAIN - Test & Demo
# ============================================

def main():
    print("=" * 60)
    print("🛡️ Multi-Level Adversarial Defense System")
    print("=" * 60)
    
    defense = MultiLevelAdversarialDefense()
    
    test_texts = [
        "Hi team, meeting at 10am tomorrow in Conference Room A.",
        "Cl4im y0ur fr33 pr!ze n0w!",
        "You have received a complimentary reward!",
        "URGENT! IMMEDIATE ACTION REQUIRED! LIMITED TIME OFFER! ACT NOW!",
        "Furthermore, we would like to additionally inform you that you have been selected for an exclusive opportunity. Moreover, this is a limited time offer that you should not miss. Consequently, we urge you to act immediately. In conclusion, click the link below to claim your prize.",
        "!mp0rt4nt! You h4v3 w0n 4 fr33 pr!ze! Claim immediately! This is a limited time opportunity that you should not miss."
    ]
    
    print("\n🧪 Testing Detection:")
    print("-" * 40)
    
    for i, text in enumerate(test_texts, 1):
        print(f"\n{i}. Text: {text[:60]}...")
        result = defense.detect(text)
        print(f"   Is Adversarial: {'✅ YES' if result['is_adversarial'] else '❌ NO'}")
        print(f"   Confidence: {result['ensemble_confidence']:.2%}")
        print(f"   Attack Levels: {result['attack_levels'] if result['attack_levels'] else 'None'}")
        print(f"   Summary: {result['summary'][:80]}...")
    
    print("\n" + "=" * 60)
    print("✅ Multi-Level Adversarial Defense System Ready!")
    print(f"   Models saved to: {MODEL_DIR}")
    
    return defense




# ============================================
# CLI INTERFACE
# ============================================
# Bridges the Express `/adversarial/*` routes (routes/adversarialRoutes.js) to
# this module. Those routes spawn:
#     python multi_level_defense.py --command <detect|train|status> --params <JSON>
# and expect a single JSON object on stdout plus exit code 0 on success (non-zero
# with a message on stderr on failure).


def _json_default(value):
    """Fallback encoder for numpy scalar types the detectors may emit."""
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _emit(payload):
    """Write a JSON object to stdout for the calling Express process."""
    sys.stdout.write(json.dumps(payload, default=_json_default))
    sys.stdout.flush()


def _normalize_label(label):
    """Map a training label onto the binary target (1 = adversarial)."""
    if isinstance(label, bool):
        return int(label)
    if isinstance(label, (int, float)):
        return 1 if label >= 1 else 0
    if isinstance(label, str):
        return 1 if label.strip().lower() in {"1", "adversarial", "spam", "attack", "true", "yes"} else 0
    raise ValueError(f"Unsupported label value: {label!r}")


def _command_detect(defense, params):
    text = params.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Parameter 'text' is required and must be a non-empty string")
    return defense.detect(text)


def _command_train(defense, params):
    samples = params.get("samples")
    if not isinstance(samples, list) or len(samples) == 0:
        raise ValueError("Parameter 'samples' is required and must be a non-empty array")

    features = []
    labels = []
    for index, sample in enumerate(samples):
        if not isinstance(sample, dict):
            raise ValueError(f"Sample at index {index} must be an object with 'text' and 'label'")
        text = sample.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"Sample at index {index} is missing a non-empty 'text'")
        if "label" not in sample:
            raise ValueError(f"Sample at index {index} is missing 'label'")

        level_results = {
            level: detector.detect(text)
            for level, detector in defense.detectors.items()
        }
        features.append(defense._extract_meta_features(level_results))
        labels.append(_normalize_label(sample["label"]))

    if len(set(labels)) < 2:
        raise ValueError("Training requires samples from at least two distinct labels")

    defense.train_meta_classifier(features, labels)
    return {"trained": True, "samples": len(samples), "features_per_sample": len(features[0])}


def _command_status(defense):
    return {
        "ready": True,
        "meta_classifier_loaded": defense.meta_classifier is not None,
        "threshold": defense.threshold,
        "levels": list(defense.detectors.keys()),
        "weights": defense.weights,
        "model_dir": str(MODEL_DIR),
    }


def run_cli(argv=None):
    parser = argparse.ArgumentParser(description="Multi-Level Adversarial Defense CLI")
    parser.add_argument(
        "--command",
        choices=["detect", "train", "status"],
        help="Operation to run. Omit to run the interactive demo.",
    )
    parser.add_argument(
        "--params",
        default="{}",
        help="JSON-encoded parameters for the command.",
    )
    args = parser.parse_args(argv)

    # No command -> preserve the original demo behaviour when run directly.
    if args.command is None:
        main()
        return 0

    try:
        params = json.loads(args.params)
    except json.JSONDecodeError as error:
        _emit({"success": False, "error": f"Invalid --params JSON: {error}"})
        return 1
    if not isinstance(params, dict):
        _emit({"success": False, "error": "--params must be a JSON object"})
        return 1

    try:
        defense = MultiLevelAdversarialDefense()
        if args.command == "detect":
            result = _command_detect(defense, params)
        elif args.command == "train":
            result = _command_train(defense, params)
        else:
            result = _command_status(defense)
    except Exception as error:  # surfaced to Express via stderr + non-zero exit
        print(f"{args.command} failed: {error}", file=sys.stderr)
        _emit({"success": False, "command": args.command, "error": str(error)})
        return 1

    _emit({"success": True, "command": args.command, **result})
    return 0


if __name__ == "__main__":
    sys.exit(run_cli())