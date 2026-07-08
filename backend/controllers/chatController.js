// controllers/chatController.js
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "placeholder_key"
});

const SYSTEM_PROMPT = `You are the Spam Detection System Security Assistant. Your purpose is purely educational.

Guidelines:
1. Explain how to use this application and describe its features and functionalities.
2. Provide prevention tips and best security practices.
3. Explain concepts like email scams, SMS scams, phishing, and malicious URLs.
4. If a query is unrelated to cybersecurity awareness, spam detection, phishing, malicious URLs, email security, SMS scams, or application usage, politely explain that the assistant is limited to security education topics.
5. Never claim certainty about whether a URL, email, SMS, or message is safe. Instead, explain indicators and recommend verification steps.`;

exports.chatHandler = async (req, res) => {
  try {
    const { message, history } = req.body;

    const trimmedMessage = message?.trim() || '';

    if (!trimmedMessage) {
      return res.status(400).json({ error: "Message cannot be empty or only whitespace." });
    }

    if (trimmedMessage.length > 1000) {
      return res.status(400).json({ error: "Message exceeds maximum length of 1000 characters." });
    }
    const messages = [
      { role: "system", content: SYSTEM_PROMPT }
    ];

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
  }
};