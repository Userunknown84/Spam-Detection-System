import { useState } from 'react';
import api from '../utils/axiosInstance';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import '../App.css';
import SpamLogo from "/src/assets/SpamLogo.png";

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { activeTheme, isDark } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      setMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      setMessage(res.data.message || 'If an account with that email exists, a reset link has been sent.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send password reset request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${isDark ? activeTheme.dark : activeTheme.light}`}>
      <div className={`w-full max-w-md backdrop-blur-xl border rounded-3xl shadow-2xl p-8 sm:p-10 transition-all duration-500 ${isDark ? activeTheme.cardDark : activeTheme.card}`}>
        <h2 className="flex items-center justify-center gap-3 text-3xl font-extrabold mb-2">
          <img src={SpamLogo} alt="Spam Logo" className="w-24 h-16 object-contain"></img> Spam Detector
        </h2>
        <p className="text-center opacity-70 mb-8 text-sm font-semibold">Reset your password</p>

        {error && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}
        
        {message && (
          <div className="bg-green-500/15 border border-green-500/30 text-green-500 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2 opacity-80">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 transition-all ${isDark ? activeTheme.inputDark : activeTheme.input}`}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-95 shadow-md ${activeTheme.accent} ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Sending Link...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm opacity-70 font-medium">
          Remembered your password?{' '}
          <Link to="/" className="text-blue-600 dark:text-blue-450 hover:underline font-semibold ml-1">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
