import time
import pytest
import requests
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient

class PredictionAPIPerformanceTest(TestCase):
    """Performance tests for predicition API"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)

        def test_prediction_response_time(self):
         """Test that prediction API responds within 200ms."""
        payload = {
            'text': 'Congratulations! You won a prize!',
            'type': 'sms'
        }
        
        start_time = time.time()
        response = self.client.post('/api/predict/', payload, format='json')
        elapsed_time = (time.time() - start_time) * 1000  # Convert to ms
        
        # Check response is successful
        self.assertEqual(response.status_code, 200)
        
        # Check response time is under 200ms
        self.assertLess(elapsed_time, 200, 
            f"Response took {elapsed_time:.2f}ms, expected < 200ms")
        
        print(f"✅ Prediction API response time: {elapsed_time:.2f}ms")
    
    def test_batch_prediction_response_time(self):
        """Test that batch prediction API responds within 500ms."""
        payload = {
            'texts': [
                'Congratulations! You won a prize!',
                'Meeting tomorrow at 10am',
                'Claim your reward now!',
                'Hi, how are you?',
                'You have been selected!'
            ]
        }
        
        start_time = time.time()
        response = self.client.post('/api/predict-batch/', payload, format='json')
        elapsed_time = (time.time() - start_time) * 1000
        
        self.assertEqual(response.status_code, 200)
        self.assertLess(elapsed_time, 500,
            f"Batch response took {elapsed_time:.2f}ms, expected < 500ms")
        
        print(f"✅ Batch API response time: {elapsed_time:.2f}ms")
    
    def test_prediction_with_large_text(self):
        """Test response time for large text (up to 5000 chars)."""
        long_text = "spam " * 1000  # ~6000 chars
        payload = {
            'text': long_text,
            'type': 'sms'
        }
        
        start_time = time.time()
        response = self.client.post('/api/predict/', payload, format='json')
        elapsed_time = (time.time() - start_time) * 1000
        
        self.assertEqual(response.status_code, 200)
        self.assertLess(elapsed_time, 500,
            f"Large text response took {elapsed_time:.2f}ms, expected < 500ms")
        
        print(f"✅ Large text response time: {elapsed_time:.2f}ms")