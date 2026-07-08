import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import './Chatbot.css';

const MAX_MESSAGES = 50;

const FAQ_QUESTIONS = [
  "What is phishing?",
  "How do I scan an email?",
  "What are malicious URLs?",
  "How do I identify SMS scams?",
  "Password security tips"
];

const Chatbot = () => {
  const { activeTheme, isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('security_assistant_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    // Cap at MAX_MESSAGES and save
    const cappedMessages = messages.slice(-MAX_MESSAGES);
    localStorage.setItem('security_assistant_history', JSON.stringify(cappedMessages));
  }, [messages]);

  const toggleChat = () => setIsOpen(!isOpen);

  const clearChat = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setMessages([]);
      localStorage.removeItem('security_assistant_history');
    }
  };

  const handleSend = async (messageText) => {
    if (!messageText.trim()) return;

    const userMsg = { role: "user", content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_API_URI || 'http://localhost:3000'}/api/chat`;
      const response = await axios.post(apiUrl, {
        message: messageText,
        history: newMessages.slice(0, -1) // Send context
      });

      const botMsg = { role: "assistant", content: response.data.reply };
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg = { role: "assistant", content: "Sorry, I am currently unable to reach the security network. Please make sure the Groq API Key is configured." };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chatbot-container">
      {isOpen && (
        <div className={`chatbot-window backdrop-blur-xl transition-all duration-300 ${isDark ? activeTheme.cardDark : activeTheme.card}`}>
          <div className={`chatbot-header ${activeTheme.accent}`}>
            <h3 className="font-bold text-white">Security Assistant</h3>
            <div className="chatbot-header-actions">
              <button className="clear-btn text-white hover:text-gray-200" onClick={clearChat} title="Clear Chat">🗑️</button>
              <button className="close-btn text-white hover:text-gray-200" onClick={toggleChat} title="Close">✖</button>
            </div>
          </div>
          
          <div className={`chatbot-messages ${isDark ? 'bg-black/10' : 'bg-white/40'}`}>
            {messages.length === 0 && (
              <div className={`chatbot-welcome ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <p>Hello! I am your Security Assistant. Ask me anything about cybersecurity, spam, or how to use this platform.</p>
                <div className="chatbot-faqs">
                  {FAQ_QUESTIONS.map((q, idx) => (
                    <button key={idx} className={`faq-btn transition-all duration-200 rounded-lg p-2 text-sm text-left ${isDark ? activeTheme.btnSecondaryDark : activeTheme.btnSecondary}`} onClick={() => handleSend(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {messages.map((msg, idx) => {
              if (!msg) return null;
              
              // Simple markdown parser for bold text and preserving newlines
              const formatMessage = (text) => {
                if (!text) return "";
                const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                return <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: formatted }} />;
              };

              return (
                <div key={idx} className={`message-bubble shadow-sm ${msg.role === 'user' ? `user-message ${activeTheme.accent}` : `bot-message ${isDark ? activeTheme.inputDark : activeTheme.input}`}`}>
                  {msg.role === 'assistant' ? formatMessage(msg.content) : msg.content}
                </div>
              );
            })}
            
            {isLoading && (
              <div className={`message-bubble bot-message typing-indicator shadow-sm ${isDark ? activeTheme.inputDark : activeTheme.input}`}>
                Security Assistant is typing...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={`chatbot-input border-t ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-white/50'}`}>
            <input 
              type="text" 
              className={`flex-1 p-2 rounded-xl outline-none transition-all ${isDark ? activeTheme.inputDark : activeTheme.input}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
              placeholder="Ask a security question..."
              disabled={isLoading}
            />
            <button 
              className={`ml-2 px-3 py-1 font-bold rounded-xl transition-all ${!input.trim() || isLoading ? 'opacity-50 cursor-not-allowed text-gray-500' : activeTheme.accent}`} 
              onClick={() => handleSend(input)} 
              disabled={isLoading || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button className={`chatbot-trigger shadow-lg hover:scale-105 transition-all duration-300 ${activeTheme.accent}`} onClick={toggleChat}>
          🛡️ Chat
        </button>
      )}
    </div>
  );
};

export default Chatbot;
