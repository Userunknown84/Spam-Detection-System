function getFallbackPrediction(text, type) {
  const lowerText = (text || "").toLowerCase();
  
  const spamKeywords = [
    "urgent", "winner", "lottery", "free money", "click here",
    "claim your prize", "account suspended", "verify your account",
    "act now", "limited time offer", "congratulations", "gift card",
    "password reset", "security alert", "bank account", "transfer"
  ];
  
  let spamScore = 0;
  
  // Keyword matching
  for (const keyword of spamKeywords) {
    if (lowerText.includes(keyword)) {
      spamScore += 0.3;
    }
  }
  
  // Suspicious URL detection (basic)
  const hasUrl = /(https?:\/\/[^\s]+)/.test(lowerText);
  if (hasUrl) {
    spamScore += 0.2;
    if (lowerText.includes("login") || lowerText.includes("verify") || lowerText.includes("secure")) {
      spamScore += 0.3;
    }
  }
  
  // Simple regex rules
  const dollarCount = (text.match(/\$/g) || []).length;
  if (dollarCount > 2) spamScore += 0.2;
  
  const isSpam = spamScore >= 0.5;
  const prediction = isSpam ? "spam" : "ham";
  
  const confidence = Math.min(0.5 + spamScore, 0.95);
  
  return {
    input: text,
    prediction: prediction,
    result: prediction,
    confidence: confidence,
    fallback: true,
    fallback_reason: "ML service unavailable, used heuristic fallback engine"
  };
}

module.exports = { getFallbackPrediction };
