import { useState } from 'react';
import api from '../utils/axiosInstance';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import '../App.css';
import SpamLogo from "/src/assets/SpamLogo.png";
import { Eye, EyeOff } from "lucide-react";

const ResetPassword = () => {
  const { id, token } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { activeTheme, isDark } = useTheme();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.password || !form.confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const res = await api.post(`/api/auth/reset-password/${id}/${token}`, { password: form.password });
      setMessage(res.data.message || 'Password successfully reset.');
      
      // Auto redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/');
      }, 3000);
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${isDark ? activeTheme.dark : activeTheme.light}`}>
      <div className={`w-full max-w-md backdrop-blur-xl border rounded-3xl shadow-2xl p-8 sm:p-10 transition-all duration-500 ${isDark ? activeTheme.cardDark : activeTheme.card}`}>
        <h2 className="flex items-center justify-center gap-3 text-3xl font-extrabold mb-2">
        <h1 className="text-3xl font-extrabold mb-2">Spam Detector</h1>
        </h2>
        <p className="text-center opacity-70 mb-8 text-sm font-semibold">Choose a new password</p>

        {error && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}
        
        {message && (
          <div className="bg-green-500/15 border border-green-500/30 text-green-500 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {message} <br/> Redirecting to login...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2 opacity-80">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Min. 6 characters"
                className={`w-full px-4 py-3 pr-12 border rounded-xl outline-none focus:ring-2 transition-all ${isDark ? activeTheme.inputDark : activeTheme.input}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center text-gray-500 focus:outline-none"
              >
                {showPassword ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 opacity-80">Confirm New Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm password"
                className={`w-full px-4 py-3 pr-12 border rounded-xl outline-none focus:ring-2 transition-all ${isDark ? activeTheme.inputDark : activeTheme.input}`}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !!message}
            className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-95 shadow-md ${activeTheme.accent} ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm opacity-70 font-medium">
          <Link to="/" className="text-blue-600 dark:text-blue-450 hover:underline font-semibold ml-1">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
