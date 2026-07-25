<<<<<<< Updated upstream
const Groq = require("groq-sdk");

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
];
=======
// controllers/chatController.js
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "placeholder_key"
});
>>>>>>> Stashed changes

const SYSTEM_PROMPT = `You are the Spam Detection System Security Assistant. Your purpose is purely educational.

Guidelines:
1. Explain how to use this application and describe its features and functionalities.
2. Provide prevention tips and best security practices.
3. Explain concepts like email scams, SMS scams, phishing, and malicious URLs.
4. If a query is unrelated to cybersecurity awareness, spam detection, phishing, malicious URLs, email security, SMS scams, or application usage, politely explain that the assistant is limited to security education topics.
5. Never claim certainty about whether a URL, email, SMS, or message is safe. Instead, explain indicators and recommend verification steps.`;

<<<<<<< Updated upstream
// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate message
 */
function validateMessage(message) {
  const trimmed = message?.trim() || '';
  
  if (!trimmed) {
    return { valid: false, error: "Message cannot be empty or only whitespace." };
  }

  if (trimmed.length > 1000) {
    return { valid: false, error: "Message exceeds maximum length of 1000 characters." };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate and sanitize history
 */
function sanitizeHistory(history) {
  const ALLOWED_HISTORY_ROLES = new Set(["user", "assistant"]);
  const MAX_HISTORY_ITEMS = 10;
  const MAX_HISTORY_CONTENT_LENGTH = 2000;
  const sanitized = [];

  if (!Array.isArray(history)) return sanitized;

  const recentHistory = history.slice(-MAX_HISTORY_ITEMS);

  for (const msg of recentHistory) {
    if (!msg || typeof msg !== "object") continue;

    const { role, content } = msg;

    if (!ALLOWED_HISTORY_ROLES.has(role)) continue;
    if (typeof content !== "string") continue;

    const trimmedContent = content.trim();
    if (!trimmedContent) continue;

    sanitized.push({
      role,
      content: trimmedContent.slice(0, MAX_HISTORY_CONTENT_LENGTH),
    });
  }

  return sanitized;
}

/**
 * Get model list from environment or use defaults
 */
function getModelList() {
  try {
    // Check for GROQ_MODELS (JSON array)
    const envModels = process.env.GROQ_MODELS;
    if (envModels) {
      const parsed = JSON.parse(envModels);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[ChatController] Loaded ${parsed.length} models from GROQ_MODELS`);
        return parsed;
      }
    }
  } catch (error) {
    console.warn('[ChatController] Invalid GROQ_MODELS env, using defaults:', error.message);
  }

  // Check for single model (backward compatibility)
  if (process.env.GROQ_MODEL) {
    console.log(`[ChatController] Using single model from GROQ_MODEL: ${process.env.GROQ_MODEL}`);
    return [process.env.GROQ_MODEL];
  }

  console.log(`[ChatController] Using ${DEFAULT_MODELS.length} default models`);
  return DEFAULT_MODELS;
}

/**
 * Create Groq client with error handling
 */
function createGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    console.warn('[ChatController] GROQ_API_KEY is not set or is placeholder');
    return null;
  }

  try {
    return new Groq({
      apiKey: apiKey
    });
  } catch (error) {
    console.error('[ChatController] Failed to create Groq client:', error);
    return null;
  }
}

// ============================================
// MAIN HANDLER
// ============================================

=======
>>>>>>> Stashed changes
exports.chatHandler = async (req, res) => {
  try {
    const { message, history } = req.body;

<<<<<<< Updated upstream
    // Validate message
    const messageValidation = validateMessage(message);
    if (!messageValidation.valid) {
      return res.status(400).json({ error: messageValidation.error });
    }
    const trimmedMessage = messageValidation.value;

    // Build messages array
=======
    const trimmedMessage = message?.trim() || '';

    if (!trimmedMessage) {
      return res.status(400).json({ error: "Message cannot be empty or only whitespace." });
    }

    if (trimmedMessage.length > 1000) {
      return res.status(400).json({ error: "Message exceeds maximum length of 1000 characters." });
    }
>>>>>>> Stashed changes
    const messages = [
      { role: "system", content: SYSTEM_PROMPT }
    ];

<<<<<<< Updated upstream
    const sanitizedHistory = sanitizeHistory(history);
    messages.push(...sanitizedHistory);
    messages.push({ role: "user", content: trimmedMessage });

    // Get model list
    const models = getModelList();
    let lastError = null;

    // Try each model with fallback
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      
      try {
        console.log(`[ChatController] Attempting with model: ${model} (${i + 1}/${models.length})`);
        
        const groq = createGroqClient();
        if (!groq) {
          throw new Error('Groq client creation failed - check GROQ_API_KEY');
        }

        const chatCompletion = await groq.chat.completions.create({
          messages: messages,
          model: model,
          temperature: 0.5,
          max_tokens: 1024,
          top_p: 1,
          stop: null,
          stream: false,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "I am currently unable to process your request.";

        // Return success with model info
        return res.json({
          reply,
          modelUsed: model,
          fallbackAttempted: i > 0,
          fallbackCount: i
        });

      } catch (error) {
        console.warn(`[ChatController] Model ${model} failed:`, error.message);
        lastError = error;

        // Continue to next model
        if (i < models.length - 1) {
          console.log(`[ChatController] Falling back to next model...`);
          continue;
        }
      }
    }

    // All models failed
    console.error('[ChatController] All models failed:', lastError);
    
    // Check if this is an API key issue
    if (lastError?.status === 401) {
      return res.status(401).json({
        error: "API key is invalid or missing. Please check your GROQ_API_KEY.",
        details: "Get your API key from: https://console.groq.com"
      });
    }

    if (lastError?.status === 429) {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again later."
      });
    }

    // Check if it's a network error
    if (lastError?.code === 'ECONNREFUSED' || lastError?.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: "Unable to connect to AI service. Please check your internet connection."
      });
    }

    // Generic fallback response
    return res.status(500).json({
      error: "All AI models are currently unavailable. Please try again later.",
      details: process.env.NODE_ENV === 'development' ? lastError?.message : undefined
    });

  } catch (error) {
    console.error("[ChatController] Chat error:", error);
    res.status(500).json({
      error: "Failed to communicate with Security Assistant.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

exports.healthCheck = async (req, res) => {
  try {
    const models = getModelList();
    const results = [];

    const groq = createGroqClient();
    if (!groq) {
      return res.json({
        status: 'unhealthy',
        error: 'Groq client creation failed - check GROQ_API_KEY',
        models: models,
        available: 0,
        total: models.length
      });
    }

    for (const model of models) {
      try {
        // Quick test with minimal tokens
        const test = await groq.chat.completions.create({
          messages: [{ role: 'user', content: 'Hello' }],
          model: model,
          max_tokens: 5,
        });

        results.push({ 
          model, 
          status: 'available',
          response: test.choices[0]?.message?.content?.substring(0, 50) || 'OK'
        });
      } catch (error) {
        results.push({ 
          model, 
          status: 'failed', 
          error: error.message 
        });
      }
    }

    const available = results.filter(r => r.status === 'available').length;
    const total = results.length;

    return res.json({
      status: available > 0 ? 'healthy' : 'unhealthy',
      availableModels: available,
      totalModels: total,
      apiKeyConfigured: !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here',
      results
    });

  } catch (error) {
    console.error('[ChatController] Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
};

// ============================================
// LIST MODELS ENDPOINT
// ============================================

exports.listModels = (req, res) => {
  try {
    const models = getModelList();
    const apiKeyConfigured = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here';
    
    res.json({
      models: models,
      default: models[0] || null,
      count: models.length,
      source: process.env.GROQ_MODELS ? 'environment (GROQ_MODELS)' : 
              process.env.GROQ_MODEL ? 'environment (GROQ_MODEL)' : 'defaults',
      apiKeyConfigured: apiKeyConfigured
    });
  } catch (error) {
    console.error('[ChatController] List models failed:', error);
    res.status(500).json({
      error: 'Failed to list models',
      details: error.message
    });
=======
    const ALLOWED_HISTORY_ROLES = new Set(["user", "assistant"]);
    const MAX_HISTORY_ITEMS = 10;
    const MAX_HISTORY_CONTENT_LENGTH = 2000;

    if (Array.isArray(history)) {
      const recentHistory = history.slice(-MAX_HISTORY_ITEMS);

      for (const msg of recentHistory) {
        if (!msg || typeof msg !== "object") continue;

        const { role, content } = msg;

        if (!ALLOWED_HISTORY_ROLES.has(role)) continue;
        if (typeof content !== "string") continue;

        const trimmedContent = content.trim();
        if (!trimmedContent) continue;

        messages.push({
          role,
          content: trimmedContent.slice(0, MAX_HISTORY_CONTENT_LENGTH),
        });
      }
    }

    messages.push({ role: "user", content: trimmedMessage });

    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.5,
      max_tokens: 1024,
      top_p: 1,
      stop: null,
      stream: false,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "I am currently unable to process your request.";

    res.json({ reply });
  } catch (error) {
    console.error("Groq API error:", error);
    res.status(500).json({ error: "Failed to communicate with Security Assistant." });
>>>>>>> Stashed changes
  }
};