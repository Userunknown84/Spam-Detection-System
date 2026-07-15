"""
Spam Detection Pipeline - 5-Step Architecture

Step 1: Raw Input (Raw Email Text)
Step 2: Text Vectorization (TF-IDF with max_features=2000)
Step 3: Parallel Processing (Linear SVM + Metadata Extraction)
Step 4: Feature Fusion (Combines Spam Score + Metadata)
Step 5: Final Classification (XGBoost for Spam/Ham)
"""

import re
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger("spam_detection_logger")


# ── Step 3: Metadata Extraction ───────────────────────────────────────────────
class MetadataExtractor:
    """Extract metadata features from email text."""
    
    @staticmethod
    def extract_metadata(text: str) -> Dict[str, float]:
        """
        Extract metadata features:
        - Length: total character count
        - Link counts: number of URLs detected
        - Exclamations: number of exclamation marks
        """
        metadata = {}
        
        # Feature 1: Text length
        metadata["text_length"] = float(len(text))
        
        # Feature 2: Link counts (URLs)
        url_pattern = r'https?://[^\s]+'
        links = re.findall(url_pattern, text)
        metadata["link_count"] = float(len(links))
        
        # Feature 3: Exclamation marks
        metadata["exclamation_count"] = float(text.count('!'))
        
        # Additional useful features
        metadata["word_count"] = float(len(text.split()))
        metadata["uppercase_ratio"] = float(sum(1 for c in text if c.isupper()) / max(len(text), 1))
        metadata["special_char_count"] = float(sum(1 for c in text if not c.isalnum() and not c.isspace()))
        
        return metadata


# ── Step 3: Parallel Classifier (Linear SVM) ─────────────────────────────────
class ParallelClassifier:
    """Wrapper for Linear SVM classifier to generate spam scores."""
    
    def __init__(self, model, vectorizer):
        """
        Initialize with pre-trained Linear SVM model and TF-IDF vectorizer.
        
        Args:
            model: Pre-trained LinearSVC model
            vectorizer: Pre-trained TF-IDF vectorizer
        """
        self.model = model
        self.vectorizer = vectorizer
    
    def get_spam_score(self, text: str) -> float:
        """
        Generate spam score using Linear SVM decision function.
        
        Returns:
            float: Spam score (higher = more likely spam)
        """
        try:
            vectorized_text = self.vectorizer.transform([text])
            scores = self.model.decision_function(vectorized_text)[0]
            spam_score = float(np.max(scores))
            return spam_score
        except Exception as e:
            logger.error(f"Error in parallel classifier: {e}")
            return 0.0


# ── Step 4: Feature Fusion ────────────────────────────────────────────────────
class FeatureFusion:
    """Fuse spam score with metadata features."""
    
    @staticmethod
    def fuse_features(
        spam_score: float,
        metadata: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Combine spam score with metadata features.
        
        Args:
            spam_score: Score from parallel classifier (SVM)
            metadata: Dictionary of metadata features
            
        Returns:
            Dictionary with fused features for XGBoost
        """
        fused_features = {
            "spam_score": spam_score,
            **metadata  # Spread metadata features
        }
        
        # Additional engineered features
        fused_features["text_length_normalized"] = min(fused_features["text_length"] / 10000, 1.0)
        fused_features["link_score"] = min(fused_features["link_count"] / 5, 1.0)
        fused_features["exclamation_score"] = min(fused_features["exclamation_count"] / 10, 1.0)
        
        return fused_features


# ── Main Pipeline ────────────────────────────────────────────────────────────
class SpamDetectionPipeline:
    """
    Complete 5-step spam detection pipeline.
    """
    
    def __init__(self, svm_model, tfidf_vectorizer, xgboost_model=None, label_encoder=None):
        """
        Initialize pipeline with trained models.
        
        Args:
            svm_model: Pre-trained Linear SVM model
            tfidf_vectorizer: Pre-trained TF-IDF vectorizer (max_features=2000)
            xgboost_model: Pre-trained XGBoost model (optional, falls back to SVM)
            label_encoder: Label encoder for output labels
        """
        # Step 2: Initialize vectorizer
        self.vectorizer = tfidf_vectorizer
        
        # Step 3: Initialize parallel components
        self.parallel_classifier = ParallelClassifier(svm_model, tfidf_vectorizer)
        self.metadata_extractor = MetadataExtractor()
        
        # Step 4: Initialize feature fusion
        self.feature_fusion = FeatureFusion()
        
        # Step 5: Initialize final classifier
        self.xgboost_model = xgboost_model
        self.svm_model = svm_model
        self.label_encoder = label_encoder
    
    def process(self, raw_text: str) -> Dict:
        """
        Execute the complete 5-step pipeline.
        
        Step 1: Raw Input - Accept raw email text
        Step 2: Text Vectorization - Apply TF-IDF
        Step 3: Parallel Processing - SVM classifier + Metadata extraction
        Step 4: Feature Fusion - Combine spam score + metadata
        Step 5: Final Classification - XGBoost prediction (or SVM fallback)
        
        Args:
            raw_text: Raw email text input
            
        Returns:
            Dictionary with prediction, confidence, and intermediate scores
        """
        try:
            # ────── STEP 1: Raw Input ──────────────────────────────────────
            logger.info("Step 1: Processing raw input text")
            if not raw_text or not isinstance(raw_text, str):
                raise ValueError("Invalid input: text must be a non-empty string")
            
            # ────── STEP 2: Text Vectorization ────────────────────────────
            logger.info("Step 2: Vectorizing text with TF-IDF (max_features=2000)")
            vectorized_text = self.vectorizer.transform([raw_text])
            
            # ────── STEP 3: Parallel Processing ──────────────────────────
            logger.info("Step 3: Running parallel processing (SVM + Metadata)")
            
            # Run SVM classifier and metadata extraction in parallel
            with ThreadPoolExecutor(max_workers=2) as executor:
                svm_future = executor.submit(
                    self.parallel_classifier.get_spam_score,
                    raw_text
                )
                metadata_future = executor.submit(
                    self.metadata_extractor.extract_metadata,
                    raw_text
                )
                
                spam_score = svm_future.result()
                metadata = metadata_future.result()
            
            logger.info(f"  Spam Score (SVM): {spam_score:.4f}")
            logger.info(f"  Metadata: {metadata}")
            
            # ────── STEP 4: Feature Fusion ─────────────────────────────────
            logger.info("Step 4: Fusing features (Spam Score + Metadata)")
            fused_features = self.feature_fusion.fuse_features(spam_score, metadata)
            logger.info(f"  Fused features: {fused_features}")
            
            # ────── STEP 5: Final Classification ───────────────────────────
            logger.info("Step 5: Final classification with XGBoost/SVM")
            
            if self.xgboost_model is not None:
                # Use XGBoost if available
                try:
                    # Convert fused features to feature vector in correct order
                    feature_keys = sorted(fused_features.keys())
                    feature_vector = np.array([[fused_features[k] for k in feature_keys]])
                    
                    raw_prediction = self.xgboost_model.predict(feature_vector)[0]
                    label = self.label_encoder.inverse_transform([raw_prediction])[0] if self.label_encoder else raw_prediction
                    confidence = float(np.max(self.xgboost_model.predict_proba(feature_vector)[0]))
                    
                    logger.info(f"  XGBoost Prediction: {label} (confidence: {confidence:.4f})")
                except Exception as e:
                    logger.warning(f"XGBoost prediction failed, falling back to SVM: {e}")
                    # Fallback to SVM
                    raw_prediction = self.svm_model.predict(vectorized_text)[0]
                    label = self.label_encoder.inverse_transform([raw_prediction])[0] if self.label_encoder else raw_prediction
                    confidence = float(np.max(self.svm_model.decision_function(vectorized_text)[0]))
            else:
                # Use SVM as fallback
                raw_prediction = self.svm_model.predict(vectorized_text)[0]
                label = self.label_encoder.inverse_transform([raw_prediction])[0] if self.label_encoder else raw_prediction
                scores = self.svm_model.decision_function(vectorized_text)[0]
                confidence = float(np.max(scores))
                logger.info(f"  SVM Prediction (fallback): {label} (confidence: {confidence:.4f})")
            
            # Return complete pipeline output
            result = {
                "prediction": label,
                "confidence": round(confidence, 4),
                "spam_score": round(spam_score, 4),
                "metadata": {k: round(v, 4) if isinstance(v, float) else v for k, v in metadata.items()},
                "fused_features": {k: round(v, 4) if isinstance(v, float) else v for k, v in fused_features.items()},
            }
            
            logger.info(f"Pipeline complete: {result['prediction']} (confidence: {result['confidence']})")
            return result
            
        except Exception as e:
            logger.error(f"Pipeline processing error: {e}")
            raise
