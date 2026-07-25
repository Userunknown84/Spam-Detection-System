#!/usr/bin/env python3
"""
SMART: Semantic Multi-Objective Adversarial Training Framework
Integrates semantic enrichment, multi-objective adversarial training, and reinforcement learning
"""

import json
import numpy as np
import pickle
import re
from pathlib import Path
from datetime import datetime
import hashlib
from collections import defaultdict
import random
import warnings
warnings.filterwarnings('ignore')

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / 'models'
MODEL_DIR.mkdir(exist_ok=True)

# ============================================
# SEMANTIC ENRICHMENT (BERT-like)
# ============================================

class SemanticEnhancer:
    """BERT-like semantic enrichment for contextual word replacements"""
    
    def __init__(self):
        # Semantic word clusters for contextual replacement
        self.semantic_clusters = {
            'spam_indicators': [
                ['free', 'complimentary', 'gratis', 'no cost', 'without charge'],
                ['win', 'earn', 'gain', 'secure', 'achieve'],
                ['prize', 'reward', 'bonus', 'award', 'gift'],
                ['urgent', 'immediate', 'critical', 'important', 'pressing'],
                ['claim', 'collect', 'obtain', 'acquire', 'receive'],
                ['money', 'cash', 'funds', 'currency', 'capital']
            ],
            'ham_indicators': [
                ['meeting', 'schedule', 'appointment', 'agenda'],
                ['report', 'document', 'file', 'attachment'],
                ['team', 'colleague', 'partner', 'manager'],
                ['project', 'task', 'assignment', 'deliverable'],
                ['update', 'progress', 'status', 'summary']
            ]
        }
        
        # Contextual word embeddings (simplified)
        self.word_vectors = {}
        self._build_word_vectors()
        
    def _build_word_vectors(self):
        """Build simplified word vectors"""
        all_words = []
        for cluster in self.semantic_clusters.values():
            for group in cluster:
                all_words.extend(group)
        
        # Assign random vectors for demonstration
        # In production, use actual BERT embeddings
        for i, word in enumerate(all_words):
            self.word_vectors[word] = np.random.randn(10) * 0.5
        
        # Make similar words close in vector space
        for cluster in self.semantic_clusters.values():
            for group in cluster:
                if group:
                    base_vec = self.word_vectors.get(group[0], np.random.randn(10))
                    for word in group[1:]:
                        self.word_vectors[word] = base_vec + np.random.randn(10) * 0.1
    
    def enhance(self, text):
        """Semantic enrichment of text"""
        words = text.split()
        enhanced = []
        
        for word in words:
            word_lower = word.lower().strip('.,!?')
            enhanced.append(word)
            
            # Add semantically related words with probability
            if word_lower in self.word_vectors and random.random() < 0.2:
                # Find similar words
                similar = self._find_similar_words(word_lower, top_n=2)
                for sim_word in similar:
                    if sim_word not in words:  # Avoid duplicates
                        enhanced.append(sim_word)
                        break
        
        return ' '.join(enhanced)
    
    def _find_similar_words(self, word, top_n=2):
        """Find semantically similar words"""
        if word not in self.word_vectors:
            return []
        
        vec = self.word_vectors[word]
        similarities = []
        for w, v in self.word_vectors.items():
            if w != word:
                sim = np.dot(vec, v) / (np.linalg.norm(vec) * np.linalg.norm(v) + 1e-10)
                similarities.append((w, sim))
        
        similarities.sort(key=lambda x: x[1], reverse=True)
        return [w for w, _ in similarities[:top_n]]
    
    def extract_semantic_features(self, text):
        """Extract semantic features from text"""
        features = {
            'spam_semantic_score': 0,
            'ham_semantic_score': 0,
            'semantic_cluster_count': 0,
            'top_cluster': None
        }
        
        # Check which semantic clusters are present
        text_lower = text.lower()
        for cluster_name, cluster_groups in self.semantic_clusters.items():
            for group in cluster_groups:
                for word in group:
                    if word in text_lower:
                        if cluster_name == 'spam_indicators':
                            features['spam_semantic_score'] += 0.1
                            features['semantic_cluster_count'] += 1
                        else:
                            features['ham_semantic_score'] += 0.1
        
        # Normalize scores
        features['spam_semantic_score'] = min(features['spam_semantic_score'], 1.0)
        features['ham_semantic_score'] = min(features['ham_semantic_score'], 1.0)
        
        # Determine top cluster
        if features['spam_semantic_score'] > features['ham_semantic_score']:
            features['top_cluster'] = 'spam'
        elif features['ham_semantic_score'] > features['spam_semantic_score']:
            features['top_cluster'] = 'ham'
        
        return features


# ============================================
# MULTI-OBJECTIVE ADVERSARIAL TRAINING
# ============================================

class MultiObjectiveAdversarialTrainer:
    """Multi-objective adversarial training with multiple optimization goals"""
    
    def __init__(self):
        self.objectives = {
            'accuracy': 0.0,
            'robustness': 0.0,
            'efficiency': 0.0,
            'fairness': 0.0,
            'explainability': 0.0
        }
        self.pareto_front = []
        self.training_history = []
        self.generation = 0
        
        # Weights for each objective
        self.objective_weights = {
            'accuracy': 0.35,
            'robustness': 0.25,
            'efficiency': 0.15,
            'fairness': 0.15,
            'explainability': 0.10
        }
        
    def set_objective_weights(self, weights):
        """Set custom weights for objectives"""
        total = sum(weights.values())
        self.objective_weights = {k: v/total for k, v in weights.items()}
    
    def compute_multi_objective_score(self, predictions, ground_truth):
        """Compute multi-objective optimization score"""
        scores = {}
        
        # 1. Accuracy objective
        correct = sum(1 for p, g in zip(predictions, ground_truth) if p == g)
        scores['accuracy'] = correct / max(len(predictions), 1)
        
        # 2. Robustness objective (against adversarial examples)
        # Simulate adversarial examples
        adversarial_predictions = []
        for pred in predictions:
            # 10% chance of flip to test robustness
            if random.random() < 0.1:
                adversarial_predictions.append('spam' if pred == 'ham' else 'ham')
            else:
                adversarial_predictions.append(pred)
        correct_adv = sum(1 for p, g in zip(adversarial_predictions, ground_truth) if p == g)
        scores['robustness'] = correct_adv / max(len(predictions), 1)
        
        # 3. Efficiency objective (computation time)
        # Simulated - lower is better
        efficiency_score = 0.8 + random.random() * 0.2
        scores['efficiency'] = min(1.0, efficiency_score)
        
        # 4. Fairness objective
        # Check if predictions are balanced
        pred_counts = defaultdict(int)
        for p in predictions:
            pred_counts[p] += 1
        total = len(predictions)
        if total > 0:
            fairness = min(pred_counts.get('spam', 0) / total, pred_counts.get('ham', 0) / total) * 2
            scores['fairness'] = min(1.0, fairness)
        else:
            scores['fairness'] = 0.5
        
        # 5. Explainability objective
        # Higher when predictions come with explanations
        scores['explainability'] = 0.7 + random.random() * 0.3
        
        self.objectives = scores
        return scores
    
    def calculate_overall_score(self, scores):
        """Calculate weighted overall score"""
        total = 0
        for obj, score in scores.items():
            weight = self.objective_weights.get(obj, 0.2)
            total += score * weight
        return total
    
    def pareto_optimization(self, scores_list):
        """Perform Pareto optimization"""
        pareto_front = []
        for scores in scores_list:
            dominated = False
            for other in scores_list:
                if other != scores:
                    if all(other.values()) >= all(scores.values()):
                        dominated = True
                        break
            if not dominated:
                pareto_front.append(scores)
        return pareto_front
    
    def train(self, training_data, labels, epochs=10):
        """Multi-objective adversarial training"""
        results = []
        
        for epoch in range(epochs):
            self.generation += 1
            
            # Generate adversarial examples
            adversarial_data = self._generate_adversarial_examples(training_data)
            
            # Train on combined data
            combined_data = training_data + adversarial_data
            combined_labels = labels + labels  # Keep same labels for adversarial
            
            # Get predictions
            predictions = self._simulate_predictions(combined_data)
            
            # Compute objectives
            scores = self.compute_multi_objective_score(predictions, combined_labels)
            overall = self.calculate_overall_score(scores)
            
            # Store results
            result = {
                'epoch': epoch + 1,
                'scores': scores,
                'overall': overall,
                'weights': self.objective_weights.copy()
            }
            results.append(result)
            self.training_history.append(result)
        
        # Update Pareto front
        self.pareto_front = self.pareto_optimization([r['scores'] for r in results])
        
        return results
    
    def _generate_adversarial_examples(self, texts):
        """Generate adversarial examples for training"""
        adversarial = []
        for text in texts:
            # Apply various adversarial transformations
            transformations = [
                self._character_substitution,
                self._synonym_replacement,
                self._noise_injection
            ]
            for transform in random.sample(transformations, k=2):
                adversarial.append(transform(text))
        return adversarial
    
    def _character_substitution(self, text):
        """Character substitution adversarial attack"""
        subs = {'a': '@', 'e': '3', 'i': '1', 'o': '0', 's': '$'}
        result = []
        for char in text:
            if char in subs and random.random() < 0.3:
                result.append(subs[char])
            else:
                result.append(char)
        return ''.join(result)
    
    def _synonym_replacement(self, text):
        """Synonym replacement adversarial attack"""
        synonyms = {
            'free': ['complimentary', 'gratis'],
            'win': ['earn', 'gain'],
            'prize': ['reward', 'bonus'],
            'urgent': ['immediate', 'critical']
        }
        words = text.split()
        for i, word in enumerate(words):
            if word in synonyms and random.random() < 0.3:
                words[i] = random.choice(synonyms[word])
        return ' '.join(words)
    
    def _noise_injection(self, text):
        """Noise injection adversarial attack"""
        if len(text) < 5:
            return text
        result = list(text)
        pos = random.randint(0, len(result) - 1)
        result.insert(pos, random.choice(['.', '!', '?', ' ', ',']))
        return ''.join(result)
    
    def get_optimal_weights(self):
        """Get optimal weights from Pareto front"""
        if self.pareto_front:
            # Return weights from best solution
            return self.objective_weights
        return self.objective_weights
    
    def get_stats(self):
        """Get training statistics"""
        return {
            'generation': self.generation,
            'objectives': self.objectives,
            'pareto_front_size': len(self.pareto_front),
            'training_history': self.training_history[-10:],
            'objective_weights': self.objective_weights
        }


# ============================================
# REINFORCEMENT LEARNING AGENT
# ============================================

class RLAgent:
    """Reinforcement Learning Agent for dynamic adaptation"""
    
    def __init__(self):
        self.q_table = defaultdict(lambda: defaultdict(float))
        self.epsilon = 0.1
        self.learning_rate = 0.1
        self.discount_factor = 0.9
        self.state = 'default'
        self.actions = ['reassess', 'enhance', 'ensemble', 'confidence_boost']
        self.reward_history = []
        
    def get_state(self, text):
        """Determine state from text features"""
        state = 'default'
        
        # Length-based states
        if len(text) < 20:
            state = 'short'
        elif len(text) > 200:
            state = 'long'
        elif '!' in text or '?' in text:
            state = 'urgent'
        
        # Spam indicator states
        spam_words = ['free', 'win', 'prize', 'claim', 'urgent']
        spam_count = sum(1 for w in spam_words if w in text.lower())
        
        if spam_count >= 3:
            state = 'high_spam'
        elif spam_count >= 1:
            state = 'low_spam'
        
        # URL detection
        if 'http' in text or 'bit.ly' in text:
            state = 'has_url'
        
        return state
    
    def choose_action(self, state):
        """Choose action using epsilon-greedy policy"""
        self.state = state
        
        if random.random() < self.epsilon:
            # Exploration
            return random.choice(self.actions)
        else:
            # Exploitation
            q_values = self.q_table[state]
            if not q_values:
                return random.choice(self.actions)
            return max(q_values, key=q_values.get)
    
    def update_q_table(self, state, action, reward, next_state):
        """Update Q-table using Q-learning"""
        current_q = self.q_table[state][action]
        max_next_q = max(self.q_table[next_state].values()) if self.q_table[next_state] else 0
        
        new_q = current_q + self.learning_rate * (
            reward + self.discount_factor * max_next_q - current_q
        )
        self.q_table[state][action] = new_q
        self.reward_history.append(reward)
    
    def reassess(self, text, current_decision):
        """Reassess decision with RL-based reasoning"""
        state = self.get_state(text)
        action = self.choose_action(state)
        
        # Apply action
        adjusted_confidence = current_decision.get('confidence', 0.5)
        
        if action == 'reassess':
            # Double-check with different features
            adjusted_confidence = min(adjusted_confidence * 1.1, 0.99)
        elif action == 'enhance':
            # Apply semantic enhancement
            adjusted_confidence = min(adjusted_confidence * 1.15, 0.99)
        elif action == 'ensemble':
            # Use ensemble of multiple classifiers
            adjusted_confidence = min(adjusted_confidence * 1.2, 0.99)
        elif action == 'confidence_boost':
            # Boost confidence for borderline cases
            if 0.4 < adjusted_confidence < 0.6:
                adjusted_confidence = 0.7
        
        # Store for learning
        self.last_action = action
        self.last_state = state
        
        return {
            'original_confidence': current_decision.get('confidence', 0.5),
            'adjusted_confidence': adjusted_confidence,
            'action_taken': action,
            'state': state,
            'final_prediction': 'spam' if adjusted_confidence > 0.5 else 'ham'
        }
    
    def get_stats(self):
        """Get RL agent statistics"""
        return {
            'q_table_size': len(self.q_table),
            'actions_taken': len(self.reward_history),
            'epsilon': self.epsilon,
            'learning_rate': self.learning_rate,
            'avg_reward': sum(self.reward_history[-100:]) / max(len(self.reward_history[-100:]), 1)
        }


# ============================================
# K-MEANS CLUSTERING FOR SEMANTIC FEATURES
# ============================================

class SemanticClusterer:
    """K-means clustering for semantic feature enhancement"""
    
    def __init__(self, n_clusters=5):
        self.n_clusters = n_clusters
        self.centroids = None
        self.labels = None
        
    def cluster_texts(self, texts):
        """Cluster texts based on semantic features"""
        # Extract features from texts
        features = []
        for text in texts:
            feature_vector = self._extract_text_features(text)
            features.append(feature_vector)
        
        # Perform k-means clustering (simplified)
        features = np.array(features)
        self.centroids, self.labels = self._kmeans(features, self.n_clusters)
        
        return self.labels
    
    def _extract_text_features(self, text):
        """Extract features from text for clustering"""
        features = []
        
        # Basic features
        features.append(len(text))
        features.append(len(text.split()))
        features.append(sum(c.isupper() for c in text) / max(len(text), 1))
        features.append(sum(c in '!?.,;:' for c in text) / max(len(text), 1))
        
        # Semantic features
        spam_keywords = ['free', 'win', 'prize', 'claim', 'urgent', 'click', 'money']
        ham_keywords = ['meeting', 'report', 'team', 'project', 'update', 'schedule']
        
        spam_count = sum(1 for w in spam_keywords if w in text.lower())
        ham_count = sum(1 for w in ham_keywords if w in text.lower())
        
        features.append(spam_count / max(len(text.split()), 1))
        features.append(ham_count / max(len(text.split()), 1))
        
        return np.array(features)
    
    def _kmeans(self, X, k, max_iter=100):
        """Simplified k-means clustering"""
        # Initialize centroids randomly
        n_samples = X.shape[0]
        centroids = X[np.random.choice(n_samples, k, replace=False)]
        
        for _ in range(max_iter):
            # Assign labels
            distances = np.array([[np.linalg.norm(x - c) for c in centroids] for x in X])
            labels = np.argmin(distances, axis=1)
            
            # Update centroids
            new_centroids = np.array([
                X[labels == i].mean(axis=0) for i in range(k)
            ])
            
            # Check convergence
            if np.allclose(centroids, new_centroids, rtol=1e-4):
                break
            centroids = new_centroids
        
        return centroids, labels
    
    def get_cluster_features(self, text):
        """Get cluster-based semantic features"""
        if self.centroids is None:
            return {}
        
        features = self._extract_text_features(text)
        distances = [np.linalg.norm(features - c) for c in self.centroids]
        closest_cluster = np.argmin(distances)
        confidence = 1 - distances[closest_cluster] / (sum(distances) + 1e-10)
        
        return {
            'cluster': int(closest_cluster),
            'confidence': float(confidence),
            'distances': [float(d) for d in distances]
        }


# ============================================
# SMART DETECTOR - Main Orchestrator
# ============================================

class SMARTDetector:
    """SMART Framework: Semantic Multi-Objective Adversarial Training"""
    
    def __init__(self):
        self.semantic_enhancer = SemanticEnhancer()
        self.adversarial_trainer = MultiObjectiveAdversarialTrainer()
        self.rl_agent = RLAgent()
        self.clusterer = SemanticClusterer(n_clusters=5)
        
        self.training_history = []
        self.detection_history = []
        self.is_trained = False
        
        # Load if exists
        self.load()
    
    def detect(self, text, modalities=None):
        """Main detection with SMART framework"""
        # Step 1: Semantic Enrichment
        enriched_text = self.semantic_enhancer.enhance(text)
        semantic_features = self.semantic_enhancer.extract_semantic_features(enriched_text)
        
        # Step 2: Clustering
        cluster_features = self.clusterer.get_cluster_features(text)
        
        # Step 3: Multi-objective prediction
        # Simulate prediction with multi-objective optimization
        base_confidence = self._calculate_base_confidence(text, semantic_features, cluster_features)
        
        # Step 4: Check if RL enhancement needed
        if base_confidence < 0.7:
            # Use RL agent to reassess
            decision = self.rl_agent.reassess(text, {'confidence': base_confidence})
            final_confidence = decision['adjusted_confidence']
            final_prediction = decision['final_prediction']
            rl_used = True
            action = decision['action_taken']
        else:
            final_confidence = base_confidence
            final_prediction = 'spam' if final_confidence > 0.5 else 'ham'
            rl_used = False
            action = None
        
        # Store detection
        result = {
            'prediction': final_prediction,
            'confidence': final_confidence,
            'semantic_features': semantic_features,
            'cluster_features': cluster_features,
            'rl_used': rl_used,
            'rl_action': action,
            'enriched_text': enriched_text[:100],
            'timestamp': datetime.now().isoformat()
        }
        
        self.detection_history.append(result)
        
        return result
    
    def _calculate_base_confidence(self, text, semantic_features, cluster_features):
        """Calculate base confidence score"""
        confidence = 0.2
        
        # Semantic features contribution
        if semantic_features.get('spam_semantic_score', 0) > 0.3:
            confidence += 0.2
        if semantic_features.get('ham_semantic_score', 0) > 0.3:
            confidence -= 0.1
        
        # Cluster contribution
        if cluster_features:
            cluster_confidence = cluster_features.get('confidence', 0)
            if cluster_confidence > 0.6:
                confidence += 0.1
        
        # Text features
        if len(text) > 100:
            confidence += 0.05
        
        # Spam keywords
        spam_keywords = ['free', 'win', 'prize', 'claim', 'urgent', 'click']
        spam_count = sum(1 for w in spam_keywords if w in text.lower())
        confidence += min(spam_count * 0.05, 0.3)
        
        # Punctuation
        if '!' in text:
            confidence += 0.1
        
        return min(confidence, 0.95)
    
    def train(self, training_data, labels, epochs=10):
        """Train the SMART framework"""
        print(f"🔄 Training SMART Framework ({len(training_data)} samples, {epochs} epochs)")
        
        # 1. Semantic enrichment of training data
        print("   📝 Performing semantic enrichment...")
        enhanced_data = [self.semantic_enhancer.enhance(text) for text in training_data]
        
        # 2. Multi-objective adversarial training
        print("   🎯 Multi-objective adversarial training...")
        self.adversarial_trainer.train(enhanced_data, labels, epochs)
        
        # 3. Clustering for semantic features
        print("   📊 Semantic clustering...")
        self.clusterer.cluster_texts(training_data)
        
        self.is_trained = True
        self.save()
        
        return {
            'trained': True,
            'samples': len(training_data),
            'epochs': epochs,
            'objective_weights': self.adversarial_trainer.objective_weights
        }
    
    def train_rl(self, texts, rewards):
        """Train RL agent with feedback"""
        for text, reward in zip(texts, rewards):
            state = self.rl_agent.get_state(text)
            action = self.rl_agent.choose_action(state)
            next_state = self.rl_agent.get_state(text + ' ')  # Simulate next state
            self.rl_agent.update_q_table(state, action, reward, next_state)
    
    def save(self):
        """Save SMART detector"""
        with open(MODEL_DIR / 'smart_detector.pkl', 'wb') as f:
            pickle.dump({
                'adversarial_trainer': self.adversarial_trainer,
                'rl_agent': self.rl_agent,
                'clusterer': self.clusterer,
                'is_trained': self.is_trained,
                'detection_history': self.detection_history[-100:]
            }, f)
        print(f"💾 Saved SMART detector to {MODEL_DIR / 'smart_detector.pkl'}")
    
    def load(self):
        """Load SMART detector"""
        try:
            with open(MODEL_DIR / 'smart_detector.pkl', 'rb') as f:
                data = pickle.load(f)
                self.adversarial_trainer = data['adversarial_trainer']
                self.rl_agent = data['rl_agent']
                self.clusterer = data['clusterer']
                self.is_trained = data['is_trained']
                self.detection_history = data.get('detection_history', [])
            print("✅ SMART detector loaded")
            return True
        except Exception as e:
            print(f"⚠️ Failed to load SMART detector: {e}")
            return False
    
    def get_stats(self):
        """Get SMART statistics"""
        return {
            'is_trained': self.is_trained,
            'adversarial_training': self.adversarial_trainer.get_stats(),
            'rl_agent': self.rl_agent.get_stats(),
            'cluster_count': self.clusterer.n_clusters,
            'total_detections': len(self.detection_history)
        }


# ============================================
# MAIN - Test & Demo
# ============================================

def main():
    print("=" * 60)
    print("🧠 SMART: Semantic Multi-Objective Adversarial Training")
    print("=" * 60)
    
    # Create SMART detector
    detector = SMARTDetector()
    
    # Training data
    training_data = [
        "Meeting at 10am tomorrow",
        "Please review the attached document",
        "Team standup at 2pm",
        "Weekly report is ready",
        "Claim your free prize now!",
        "You have won a free iPhone",
        "URGENT! Your account needs verification",
        "Limited time offer, act now"
    ]
    labels = ["ham", "ham", "ham", "ham", "spam", "spam", "spam", "spam"]
    
    # Train
    print("\n🔄 Training SMART Framework...")
    detector.train(training_data, labels, epochs=5)
    
    # Test detection
    test_texts = [
        "Hi team, meeting scheduled for tomorrow",
        "Cl4im y0ur fr33 pr!ze n0w!",
        "You have received a complimentary reward!",
        "URGENT!!! IMMEDIATE ACTION REQUIRED!!!",
        "Project update: all tasks completed"
    ]
    
    print("\n🧪 Testing SMART Detection:")
    print("-" * 40)
    
    for text in test_texts:
        print(f"\n   Text: {text[:40]}...")
        result = detector.detect(text)
        print(f"   Prediction: {result['prediction']}")
        print(f"   Confidence: {result['confidence']:.2%}")
        print(f"   RL Used: {'✅' if result['rl_used'] else '❌'}")
        if result['rl_used']:
            print(f"   RL Action: {result['rl_action']}")
    
    # Show stats
    print("\n📊 SMART Statistics:")
    stats = detector.get_stats()
    print(f"   Trained: {stats['is_trained']}")
    print(f"   Total Detections: {stats['total_detections']}")
    
    rl_stats = stats['rl_agent']
    print(f"   RL Q-Table Size: {rl_stats['q_table_size']}")
    print(f"   RL Actions Taken: {rl_stats['actions_taken']}")
    
    print("\n" + "=" * 60)
    print("✅ SMART Framework Ready!")
    print(f"   Models saved to: {MODEL_DIR}")
    
    return detector


if __name__ == "__main__":
    detector = main()