#!/usr/bin/env python3
"""
Adversarial Training for Spam Detection
Generates adversarial examples and retrains the model for robustness
"""

import pandas as pd
import numpy as np
import pickle
import random
import re
import os
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.ensemble import VotingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import warnings
warnings.filterwarnings('ignore')

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = os.getenv('DATASET_PATH', str(BASE_DIR / 'dataset.csv'))
MODEL_OUTPUT_PATH = os.getenv('MODEL_OUTPUT_PATH', str(BASE_DIR / 'adversarial_model.pkl'))
VECTORIZER_OUTPUT_PATH = os.getenv('VECTORIZER_OUTPUT_PATH', str(BASE_DIR / 'adversarial_vectorizer.pkl'))
LABEL_ENCODER_PATH = os.getenv('LABEL_ENCODER_PATH', str(BASE_DIR / 'label_encoder.pkl'))

# ============================================
# ADVERSARIAL AUGMENTOR
# ============================================

class AdversarialAugmentor:
    """Generate adversarial examples at word, character, and sentence levels"""
    
    def __init__(self):
        # Character substitutions
        self.char_subs = {
            'a': ['@', '4', 'á', 'â', 'à'],
            'e': ['3', 'é', 'è', 'ê'],
            'i': ['1', '!', 'í', 'ì'],
            'o': ['0', 'ó', 'ò', 'ö'],
            's': ['$', '5', 'z', 'ž'],
            't': ['7', '+'],
            'l': ['1', '|'],
            'b': ['8', '6'],
            'g': ['9', '6'],
            'c': ['(', '<', '{'],
            'r': ['2'],
            'u': ['v', 'ü'],
            'n': ['ñ']
        }
        
        # Synonyms for common spam words
        self.synonyms = {
            'free': ['complimentary', 'gratis', 'no cost', 'without charge', 'on the house'],
            'claim': ['win', 'get', 'receive', 'earn', 'collect', 'obtain'],
            'prize': ['reward', 'bonus', 'award', 'gift', 'compensation'],
            'urgent': ['immediate', 'critical', 'important', 'pressing', 'essential'],
            'click': ['tap', 'press', 'visit', 'go to', 'access'],
            'win': ['earn', 'gain', 'secure', 'achieve', 'attain'],
            'money': ['cash', 'funds', 'currency', 'capital', 'finances'],
            'limited': ['restricted', 'scant', 'minimal', 'finite', 'controlled'],
            'offer': ['proposal', 'deal', 'opportunity', 'proposition', 'bid'],
            'guaranteed': ['assured', 'certain', 'promised', 'secure', 'confirmed']
        }
        
        # Noise patterns
        self.noise_chars = ['.', '!', '?', ',', ';', ':', ' ']
<<<<<<< HEAD
=======
        
        # Spam trigger patterns
        self.spam_triggers = [
            'urgent', 'free', 'claim', 'prize', 'winner', 'congratulations',
            'limited time', 'act now', 'exclusive', 'guaranteed', 'money back',
            'cash', 'bonus', 'credit', 'loan', 'investment', 'profit'
        ]
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda

        
        # Spam trigger patterns
        self.spam_triggers = [
            'urgent', 'free', 'claim', 'prize', 'winner', 'congratulations',
            'limited time', 'act now', 'exclusive', 'guaranteed', 'money back',
            'cash', 'bonus', 'credit', 'loan', 'investment', 'profit'
        ]

    def character_substitution(self, text, intensity=0.3):
        """Replace characters with visually similar alternatives"""
        result = list(text)
        for i, char in enumerate(result):
            if char.lower() in self.char_subs and random.random() < intensity:
                result[i] = random.choice(self.char_subs[char.lower()])
        return ''.join(result)

    def synonym_replacement(self, text, intensity=0.4):
        """Replace words with synonyms"""
        words = text.split()
        result = []
        for word in words:
            word_lower = word.lower().strip('.,!?')
            if word_lower in self.synonyms and random.random() < intensity:
                new_word = random.choice(self.synonyms[word_lower])
<<<<<<< Updated upstream

                # Preserve punctuation

=======
<<<<<<< HEAD
=======
                # Preserve punctuation
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
                punct = word[-1] if word[-1] in '.,!?' else ''
                result.append(new_word + punct)
            else:
                result.append(word)
        return ' '.join(result)

    def noise_injection(self, text, intensity=0.2):
        """Insert random noise characters"""
        if len(text) < 10:
            return text
        result = list(text)
        num_noise = max(1, int(len(text) * intensity))
        for _ in range(num_noise):
            pos = random.randint(0, len(result) - 1)
            char = random.choice(self.noise_chars)
            result.insert(pos, char)
        return ''.join(result)

<<<<<<< HEAD
    def generate_variants(self, text, num_variants=5):
        """Generate multiple adversarial variants"""
        variants = []
        for _ in range(num_variants):
            variant = text
<<<<<<< Updated upstream

=======
=======
>>>>>>> Stashed changes
    def sentence_rephrasing(self, text):
        """Simple sentence rephrasing (rule-based)"""
        # This is a simple version - can be enhanced with LLM
        patterns = [
            (r'claim your (.*?) now', r'you can get your \1 today'),
            (r'you have won', r'congratulations, you are the winner of'),
            (r'click here', r'visit this link'),
            (r'free (.*?)', r'complimentary \1'),
            (r'urgent', r'important'),
        ]
        result = text
        for pattern, replacement in patterns:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        return result

    def generate_variants(self, text, num_variants=5):
        """Generate multiple adversarial variants"""
        variants = []
        
        for _ in range(num_variants):
            variant = text
            # Apply random transformations
<<<<<<< Updated upstream
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
            transformations = random.sample([
                ('char', 0.2 + random.random() * 0.3),
                ('synonym', 0.2 + random.random() * 0.3),
                ('noise', 0.1 + random.random() * 0.2),
            ], k=random.randint(1, 3))
            
            for transform_type, intensity in transformations:
                if transform_type == 'char':
                    variant = self.character_substitution(variant, intensity)
                elif transform_type == 'synonym':
                    variant = self.synonym_replacement(variant, intensity)
                elif transform_type == 'noise':
                    variant = self.noise_injection(variant, intensity)
            
<<<<<<< Updated upstream

=======
<<<<<<< HEAD
=======
>>>>>>> Stashed changes
            # Sometimes rephrase
            if random.random() < 0.3:
                variant = self.sentence_rephrasing(variant)
            
<<<<<<< Updated upstream

=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
            variants.append(variant)
        
        return variants


# ============================================
# DATA LOADING & PROCESSING
# ============================================

def load_datasets():
<<<<<<< HEAD
    """Load dataset"""
    if not os.path.exists(DATASET_PATH):
        print(f"❌ Dataset not found at {DATASET_PATH}")
        print("   Creating sample dataset for testing...")
        return create_sample_dataset()
    
    df = pd.read_csv(DATASET_PATH)
    if 'text' in df.columns and 'label' in df.columns:
        print(f"✅ Loaded {len(df)} samples from {DATASET_PATH}")
        return df
    
    print("❌ Invalid dataset format. Need 'text' and 'label' columns.")
    return create_sample_dataset()


def create_sample_dataset():
    """Create sample dataset for testing"""
    samples = [
        ("Claim your free prize now!", "spam"),
        ("You have won a free iPhone", "spam"),
        ("Meeting at 10am tomorrow", "ham"),
        ("Team standup at 2pm", "ham"),
        ("Urgent! Your account needs verification", "spam"),
        ("Congratulations! You're a winner", "spam"),
        ("Please review the attached document", "ham"),
        ("Weekly report is ready", "ham"),
        ("Free money waiting for you", "spam"),
        ("Limited time offer, act now", "spam"),
    ]
    df = pd.DataFrame(samples, columns=['text', 'label'])
    print(f"✅ Created sample dataset with {len(df)} samples")
<<<<<<< Updated upstream

=======
=======
>>>>>>> Stashed changes
    """Load and combine email + SMS datasets"""
    data = []
    
    # Try to load main dataset
    if os.path.exists(DATASET_PATH):
        df = pd.read_csv(DATASET_PATH)
        if 'text' in df.columns and 'label' in df.columns:
            data.extend(df[['text', 'label']].values.tolist())
            print(f"✅ Loaded {len(df)} samples from {DATASET_PATH}")
    
    # Try to load SMS dataset
    sms_path = BASE_DIR / 'sms_spam.csv'
    if os.path.exists(sms_path):
        sms_df = pd.read_csv(sms_path)
        # Try different column formats
        text_col = next((col for col in sms_df.columns if col.lower() in ['text', 'message', 'sms']), None)
        label_col = next((col for col in sms_df.columns if col.lower() in ['label', 'spam', 'type', 'class']), None)
        if text_col and label_col:
            data.extend(sms_df[[text_col, label_col]].values.tolist())
            print(f"✅ Loaded {len(sms_df)} samples from {sms_path}")
    
    # Try to load email dataset
    email_path = BASE_DIR / 'email_spam.csv'
    if os.path.exists(email_path):
        email_df = pd.read_csv(email_path)
        text_col = next((col for col in email_df.columns if col.lower() in ['text', 'message', 'email', 'body']), None)
        label_col = next((col for col in email_df.columns if col.lower() in ['label', 'spam', 'type', 'class']), None)
        if text_col and label_col:
            data.extend(email_df[[text_col, label_col]].values.tolist())
            print(f"✅ Loaded {len(email_df)} samples from {email_path}")
    
    if not data:
        print("❌ No datasets found. Please place dataset.csv in backend/")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(data, columns=['text', 'label'])
    
    # Clean data
    df = df.dropna()
    df = df[df['text'].str.len() > 3]
    
    # Normalize labels
    label_map = {
        'spam': 'spam',
        'ham': 'ham',
        'legitimate': 'ham',
        'safe': 'ham',
        'phishing': 'spam',
        'malicious': 'spam',
        'offensive': 'spam',
        '1': 'spam',
        '0': 'ham',
        'true': 'spam',
        'false': 'ham'
    }
    
    df['label'] = df['label'].str.lower().map(label_map).fillna('ham')
    
    print(f"\n📊 Dataset Summary:")
    print(f"   Total samples: {len(df)}")
    print(f"   Spam: {len(df[df['label']=='spam'])}")
    print(f"   Ham: {len(df[df['label']=='ham'])}")
    
<<<<<<< Updated upstream

=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    return df


# ============================================
# ADVERSARIAL TRAINING
# ============================================

def train_adversarial_model(df):
    """Train model with adversarial examples"""
    
    print("\n🔄 Generating adversarial examples...")
<<<<<<< Updated upstream

=======
<<<<<<< HEAD
=======
    
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    augmentor = AdversarialAugmentor()
    
    # Separate spam and ham
    spam_df = df[df['label'] == 'spam']
    ham_df = df[df['label'] == 'ham']
    
    # Generate adversarial variants for spam
    augmented_texts = []
    augmented_labels = []
    
    num_variants = int(os.getenv('ADVERSARIAL_VARIANTS_PER_SAMPLE', 3))
    
    for _, row in spam_df.iterrows():
        variants = augmentor.generate_variants(row['text'], num_variants=num_variants)
        for variant in variants:
            augmented_texts.append(variant)
            augmented_labels.append('spam')
    
    print(f"   Generated {len(augmented_texts)} adversarial variants")
    
    # Combine original + augmented
    all_texts = df['text'].tolist() + augmented_texts
    all_labels = df['label'].tolist() + augmented_labels
    
    print(f"   Total training samples: {len(all_texts)}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        all_texts, all_labels, test_size=0.2, random_state=42, stratify=all_labels
    )
    
    # Vectorize
    print("\n🔄 Vectorizing...")
    vectorizer = TfidfVectorizer(
        max_features=30000,
        ngram_range=(1, 3),
        stop_words='english',
        sublinear_tf=True
    )
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)
    
    # Train ensemble
    print("\n🔄 Training ensemble model...")
    
    models = [
        ('svm', LinearSVC(class_weight='balanced', max_iter=2000, random_state=42)),
        ('nb', MultinomialNB()),
        ('lr', LogisticRegression(class_weight='balanced', max_iter=1000, random_state=42))
    ]
    
<<<<<<< Updated upstream

=======
<<<<<<< HEAD
=======
    # Train each model
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    trained_models = {}
    for name, model in models:
        print(f"   Training {name}...")
        model.fit(X_train_vec, y_train)
        trained_models[name] = model
    
    # Ensemble voting
    ensemble = VotingClassifier(
        estimators=[(name, model) for name, model in trained_models.items()],
        voting='soft'
    )
    ensemble.fit(X_train_vec, y_train)
    
    # Evaluate
    print("\n📊 Evaluation Results:")
    y_pred = ensemble.predict(X_test_vec)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"   Accuracy: {accuracy:.4f}")
    print("\n   Classification Report:")
    print(classification_report(y_test, y_pred))
    
    return ensemble, vectorizer


# ============================================
# MAIN
# ============================================

def main():
    print("=" * 60)
<<<<<<< HEAD
    print("🛡️ Adversarial Training for Spam Detection")
<<<<<<< Updated upstream

    print("🚀 Adversarial Training for Spam Detection")
=======
=======
    print("🚀 Adversarial Training for Spam Detection")
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    print("=" * 60)
    
    # Load datasets
    df = load_datasets()
    if df is None:
<<<<<<< HEAD
        print("\n❌ No dataset available")
<<<<<<< Updated upstream

        print("\n❌ Please ensure dataset.csv exists in backend/")
=======
=======
        print("\n❌ Please ensure dataset.csv exists in backend/")
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
        return
    
    # Train model
    model, vectorizer = train_adversarial_model(df)
    
    # Save model
    print(f"\n💾 Saving model to {MODEL_OUTPUT_PATH}")
    pickle.dump(model, open(MODEL_OUTPUT_PATH, 'wb'))
    
    print(f"💾 Saving vectorizer to {VECTORIZER_OUTPUT_PATH}")
    pickle.dump(vectorizer, open(VECTORIZER_OUTPUT_PATH, 'wb'))
    
<<<<<<< Updated upstream

    # Save label encoder (for compatibility)

=======
<<<<<<< HEAD
    # Save label encoder
=======
    # Save label encoder (for compatibility)
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    from sklearn.preprocessing import LabelEncoder
    le = LabelEncoder()
    le.fit(['ham', 'spam'])
    pickle.dump(le, open(LABEL_ENCODER_PATH, 'wb'))
    
<<<<<<< HEAD
    print("\n✅ Adversarial training complete!")
<<<<<<< Updated upstream
    print("\n✅ Training complete!")

=======
=======
    print("\n✅ Training complete!")
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda
>>>>>>> Stashed changes
    print(f"   Model saved: {MODEL_OUTPUT_PATH}")
    print(f"   Vectorizer saved: {VECTORIZER_OUTPUT_PATH}")
    print("\n📝 To use the robust model, update your .env:")
    print(f"   MODEL_PATH={MODEL_OUTPUT_PATH}")
    print(f"   VECTORIZER_PATH={VECTORIZER_OUTPUT_PATH}")
<<<<<<< HEAD
    print(f"   CONFIDENCE_THRESHOLD=0.6")
    print(f"   FLAG_LOW_CONFIDENCE=true")
=======
>>>>>>> 42c19e1f454b08381ffc8132bf9ae9f6a57dabda



if __name__ == "__main__":
    main()