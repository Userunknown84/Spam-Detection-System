#!/usr/bin/env python3
"""
Text Salting Attack Defense System
Detects hidden text in emails using CSS techniques to evade AI security
"""

import re
import json
import base64
from pathlib import Path
from datetime import datetime
import hashlib
from bs4 import BeautifulSoup
import cv2
import numpy as np
from PIL import Image
import pytesseract
from html2image import Html2Image
import tempfile
import os

# ============================================
# CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / 'output'
OUTPUT_DIR.mkdir(exist_ok=True)

# ============================================
# HTML PARSER & HIDDEN CONTENT EXTRACTOR
# ============================================

class HTMLHiddenContentExtractor:
    """Extracts hidden text from HTML using various techniques"""
    
    def __init__(self):
        # CSS properties that hide text
        self.hidden_css_properties = [
            ('clip', r'clip:\s*(rect\(0,0,0,0\)|rect\(0\s+0\s+0\s+0\))'),
            ('clip-path', r'clip-path:\s*inset\(100%\)'),
            ('text-indent', r'text-indent:\s*-\d+px'),
            ('font-size', r'font-size:\s*0'),
            ('font-size', r'font-size:\s*0\.\d+px'),
            ('position', r'position:\s*absolute'),
            ('left', r'left:\s*-\d+px'),
            ('top', r'top:\s*-\d+px'),
            ('opacity', r'opacity:\s*0'),
            ('visibility', r'visibility:\s*hidden'),
            ('display', r'display:\s*none'),
            ('color', r'color:\s*#\w{6}\s*;\s*background-color:\s*#\w{6}'),
            ('height', r'height:\s*0'),
            ('width', r'width:\s*0'),
            ('max-height', r'max-height:\s*0'),
            ('overflow', r'overflow:\s*hidden'),
            ('white-space', r'white-space:\s*nowrap'),
        ]
        
        self.compiled_patterns = []
        for prop, pattern in self.hidden_css_properties:
            self.compiled_patterns.append({
                'property': prop,
                'pattern': re.compile(pattern, re.IGNORECASE)
            })
        
        # Suspicious inline style patterns
        self.suspicious_style_patterns = [
            r'style="[^"]*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)"',
            r'style="[^"]*(?:font-size\s*:\s*0|font-size\s*:\s*0\.[0-9]+px)"',
            r'style="[^"]*(?:text-indent\s*:\s*-\d+px|clip\s*:\s*rect\(0,0,0,0\))"',
            r'style="[^"]*(?:position\s*:\s*absolute\s*;?\s*(?:left|top)\s*:\s*-\d+px)"',
            r'class="[^"]*(?:hidden|invisible|sr-only|visually-hidden)"',
        ]
        self.suspicious_styles = [re.compile(p, re.I) for p in self.suspicious_style_patterns]
    
    def extract_hidden_text(self, html):
        """Extract text that is hidden in the HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        
        hidden_text = []
        hidden_elements = []
        
        # Find all elements with suspicious attributes
        for element in soup.find_all():
            is_hidden = False
            reason = []
            
            # Check style attribute
            style = element.get('style', '')
            if style:
                for item in self.compiled_patterns:
                    if item['pattern'].search(style):
                        is_hidden = True
                        reason.append(item['property'])
            
            # Check class attribute
            classes = element.get('class', [])
            hidden_classes = ['hidden', 'invisible', 'sr-only', 'visually-hidden', 'd-none']
            for cls in classes:
                if cls in hidden_classes:
                    is_hidden = True
                    reason.append(f'class:{cls}')
            
            # Check for hidden attributes
            if element.get('aria-hidden') == 'true':
                is_hidden = True
                reason.append('aria-hidden')
            
            if element.get('hidden') is not None:
                is_hidden = True
                reason.append('hidden')
            
            # Check for display:none in style
            if style and 'display:none' in style.replace(' ', '').lower():
                is_hidden = True
                reason.append('display:none')
            
            # Check if element has no visible content but has text
            if is_hidden and element.text and element.text.strip():
                text = element.text.strip()
                hidden_text.append({
                    'text': text,
                    'element': element.name,
                    'reason': reason,
                    'html': str(element)[:200]
                })
                hidden_elements.append(element)
        
        # Also check for text nodes inside hidden parents
        for hidden in hidden_elements:
            # Remove hidden elements from soup to get visible text
            hidden.decompose()
        
        # Get visible text after removing hidden elements
        visible_text = soup.get_text(separator=' ', strip=True)
        
        return {
            'hidden_texts': hidden_text,
            'total_hidden_chars': sum(len(h['text']) for h in hidden_text),
            'visible_text': visible_text,
            'hidden_elements_count': len(hidden_elements)
        }
    
    def check_suspicious_styles(self, html):
        """Check for suspicious style patterns"""
        matches = []
        for pattern in self.suspicious_styles:
            found = pattern.findall(html)
            if found:
                matches.extend(found)
        return matches


# ============================================
# EMAIL RENDERER FOR VISUAL ANALYSIS
# ============================================

class EmailRenderer:
    """Renders HTML emails as images for visual analysis"""
    
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp()
        self.width = 800
        self.height = 600
    
    def render(self, html):
        """Render HTML to image"""
        try:
            from html2image import Html2Image
            hti = Html2Image(output_path=self.temp_dir)
            
            html_file = os.path.join(self.temp_dir, 'email.html')
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(html)
            
            png_file = os.path.join(self.temp_dir, 'email.png')
            hti.screenshot(html_file=html_file, save_as='email.png', 
                          size=(self.width, self.height))
            
            img = Image.open(png_file)
            
            # Cleanup
            os.remove(html_file)
            os.remove(png_file)
            
            return img
            
        except Exception as e:
            print(f"⚠️ HTML rendering failed: {e}")
            # Fallback: Create image with text
            return self._render_text_fallback(html)
    
    def _render_text_fallback(self, html):
        """Fallback renderer for simple text"""
        from PIL import Image, ImageDraw, ImageFont
        
        # Extract visible text
        soup = BeautifulSoup(html, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        
        img = Image.new('RGB', (self.width, self.height), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 14)
        except:
            font = ImageFont.load_default()
        
        y = 10
        for line in text.split('\n')[:30]:
            if y > self.height - 20:
                break
            draw.text((10, y), line[:100], fill='black', font=font)
            y += 20
        
        return img


# ============================================
# OCR EXTRACTOR
# ============================================

class OCRTextExtractor:
    """Extracts text from rendered images using OCR"""
    
    def __init__(self):
        self.config = '--psm 6 --oem 3'
    
    def extract(self, image):
        """Extract text from image"""
        try:
            # Convert PIL to OpenCV
            if isinstance(image, Image.Image):
                img = np.array(image)
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            else:
                img = image
            
            # Preprocess
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # OCR
            text = pytesseract.image_to_string(thresh, config=self.config)
            
            return text.strip()
        except Exception as e:
            print(f"⚠️ OCR failed: {e}")
            return ""


# ============================================
# TEXT SALTING DETECTOR
# ============================================

class TextSaltingDetector:
    """Detects text salting attacks in emails"""
    
    def __init__(self):
        self.html_parser = HTMLHiddenContentExtractor()
        self.renderer = EmailRenderer()
        self.ocr = OCRTextExtractor()
        self.threshold_ratio = 2.0  # Hidden text > 2x visible text = suspicious
        self.min_visible_text = 50   # Minimum visible text to consider
    
    def detect(self, html):
        """Detect text salting attacks"""
        results = {
            'is_suspicious': False,
            'confidence': 0.0,
            'hidden_content': {},
            'visible_content': {},
            'analysis': {},
            'recommendations': []
        }
        
        # Step 1: Parse HTML for hidden content
        hidden_analysis = self.html_parser.extract_hidden_text(html)
        
        # Step 2: Render email as image
        try:
            rendered_image = self.renderer.render(html)
        except Exception as e:
            results['error'] = f"Render failed: {e}"
            return results
        
        # Step 3: Extract visible text via OCR
        visible_text = self.ocr.extract(rendered_image)
        
        # Step 4: Calculate hidden vs visible ratio
        hidden_chars = hidden_analysis['total_hidden_chars']
        visible_chars = len(visible_text)
        
        results['hidden_content'] = {
            'texts': hidden_analysis['hidden_texts'][:10],  # Limit for response
            'total_chars': hidden_chars,
            'elements_count': hidden_analysis['hidden_elements_count']
        }
        
        results['visible_content'] = {
            'text': visible_text[:500],  # Limit for response
            'chars': visible_chars
        }
        
        # Step 5: Analyze salting
        if visible_chars < self.min_visible_text and hidden_chars > 100:
            results['is_suspicious'] = True
            results['confidence'] = 0.9
            results['analysis']['reason'] = 'Very little visible text with large hidden content'
            results['recommendations'].append('Email appears to be mostly hidden text - potential salting attack')
        
        elif hidden_chars > visible_chars * self.threshold_ratio:
            results['is_suspicious'] = True
            results['confidence'] = min(0.95, hidden_chars / (visible_chars + 1))
            results['analysis']['reason'] = f'Hidden text ({hidden_chars} chars) exceeds visible text ({visible_chars} chars) by {hidden_chars/visible_chars:.1f}x'
            results['recommendations'].append('Significant text salting detected - hidden content used to dilute spam signals')
        
        elif hidden_chars > 0 and hidden_chars < visible_chars * 0.5:
            # Some hidden content but not enough to be salting
            results['confidence'] = 0.2
            results['analysis']['reason'] = 'Minor hidden content detected'
        
        # Step 6: Check for suspicious patterns
        suspicious_styles = self.html_parser.check_suspicious_styles(html)
        if suspicious_styles:
            results['analysis']['suspicious_styles'] = suspicious_styles[:5]
            if not results['is_suspicious']:
                results['confidence'] = max(results['confidence'], 0.4)
        
        # Step 7: Check for text salting patterns
        salting_patterns = self._detect_salting_patterns(html, visible_text)
        if salting_patterns:
            results['analysis']['salting_patterns'] = salting_patterns
            results['is_suspicious'] = True
            results['confidence'] = max(results['confidence'], 0.85)
            results['recommendations'].append(f'Text salting pattern detected: {", ".join(salting_patterns[:3])}')
        
        # Step 8: Generate summary
        results['summary'] = self._generate_summary(results)
        
        return results
    
    def _detect_salting_patterns(self, html, visible_text):
        """Detect specific text salting patterns"""
        patterns = []
        
        # Check for huge text blocks that would be invisible
        large_blocks = re.findall(r'<[^>]*>[^<]{100,}</[^>]*>', html, re.I)
        if len(large_blocks) > 5:
            patterns.append('multiple_large_text_blocks')
        
        # Check for seemingly random text
        hidden_analysis = self.html_parser.extract_hidden_text(html)
        for hidden in hidden_analysis['hidden_texts']:
            text = hidden['text']
            # Check for random-looking text (low entropy)
            if len(text) > 100:
                entropy = self._calculate_entropy(text)
                if entropy > 4.5:  # High entropy = random-looking
                    patterns.append('high_entropy_hidden_text')
                    break
        
        # Check for repeated benign phrases
        visible_words = set(visible_text.lower().split())
        hidden_text = ' '.join([h['text'] for h in hidden_analysis['hidden_texts']])
        hidden_words = set(hidden_text.lower().split())
        
        # Find words that appear in hidden but not visible
        unique_hidden = hidden_words - visible_words
        if len(unique_hidden) > 50:
            patterns.append('unique_benign_words_in_hidden')
        
        return patterns
    
    def _calculate_entropy(self, text):
        """Calculate Shannon entropy of text"""
        if not text:
            return 0
        text = text.lower()
        freq = {}
        for char in text:
            if char.isalpha():
                freq[char] = freq.get(char, 0) + 1
        
        entropy = 0
        total = sum(freq.values())
        for count in freq.values():
            p = count / total
            entropy -= p * (p ** 0.5)  # Simplified entropy
        
        return entropy
    
    def _generate_summary(self, results):
        """Generate human-readable summary"""
        if results['is_suspicious']:
            return f"⚠️ Text salting detected! {results['analysis'].get('reason', 'Hidden content exceeds visible content')}"
        elif results['confidence'] > 0.3:
            return f"⚠️ Suspicious patterns detected. Confidence: {results['confidence']:.0%}"
        else:
            return "✅ No text salting detected"


# ============================================
# MAIN - Test & Demo
# ============================================

def main():
    print("=" * 60)
    print("🛡️ Text Salting Attack Defense System")
    print("=" * 60)
    
    detector = TextSaltingDetector()
    
    # Test emails
    test_emails = [
        # Normal email
        """
        <html>
        <body>
            <h2>Meeting Reminder</h2>
            <p>Team meeting at 10am tomorrow in Conference Room A.</p>
            <p>Please bring your laptops.</p>
        </body>
        </html>
        """,
        
        # Email with text salting (hidden text)
        """
        <html>
        <body>
            <div style="display:none; font-size:0; color:transparent;">
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
                Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
                Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris 
                nisi ut aliquip ex ea commodo consequat.</p>
                <p>Duis aute irure dolor in reprehenderit in voluptate velit esse 
                cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat 
                cupidatat non proident, sunt in culpa qui officia deserunt mollit 
                anim id est laborum.</p>
            </div>
            <h1>🎉 CONGRATULATIONS!</h1>
            <p style="font-size: 24px; color: #ff6600;">
                You have WON a FREE iPhone 15 Pro!
            </p>
            <p>Click <a href="http://fake-prize.com">HERE</a> to claim.</p>
        </body>
        </html>
        """,
        
        # Email with clip-path salting
        """
        <html>
        <body>
            <div style="clip-path: inset(100%); height: 0; overflow: hidden;">
                <h1>This text is completely hidden from view</h1>
                <p>But AI will process it and think the email is about something else.</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
            </div>
            <h2>URGENT! Your account needs verification</h2>
            <p>Please click the link below to verify your account.</p>
            <a href="http://fake-bank.com/verify">Verify Now</a>
        </body>
        </html>
        """,
        
        # Email with text-indent salting
        """
        <html>
        <body>
            <p style="text-indent: -9999px; position: absolute; left: -9999px;">
                This is a legitimate newsletter about software development.
                We discuss best practices and industry trends.
            </p>
            <h1>FREE MONEY! CLICK HERE!</h1>
            <p>You have been selected for an exclusive offer.</p>
        </body>
        </html>
        """
    ]
    
    print("\n🧪 Testing Detection:")
    print("-" * 40)
    
    for i, html in enumerate(test_emails, 1):
        print(f"\n{i}. Test Email {i}:")
        result = detector.detect(html)
        
        print(f"   Is Suspicious: {'✅ YES' if result['is_suspicious'] else '❌ NO'}")
        print(f"   Confidence: {result['confidence']:.1%}")
        print(f"   Summary: {result['summary']}")
        
        if result['is_suspicious']:
            print(f"   Analysis: {result['analysis'].get('reason', 'N/A')}")
            if result.get('recommendations'):
                print(f"   Recommendation: {result['recommendations'][0]}")
        
        # Show hidden content stats
        hidden = result.get('hidden_content', {})
        visible = result.get('visible_content', {})
        if hidden.get('total_chars', 0) > 0:
            print(f"   Hidden Text: {hidden.get('total_chars', 0)} chars in {hidden.get('elements_count', 0)} elements")
            print(f"   Visible Text: {visible.get('chars', 0)} chars")
    
    print("\n" + "=" * 60)
    print("✅ Text Salting Defense System Ready!")
    print(f"   Output directory: {OUTPUT_DIR}")
    
    return detector


if __name__ == "__main__":
    detector = main()