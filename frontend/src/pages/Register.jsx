import { useState } from 'react';
import api from '../utils/axiosInstance';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff } from "lucide-react";
import '../App.css';

const Register = () => {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { activeTheme, isDark } = useTheme();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      // await api.post(`${import.meta.env.VITE_API_URI}/api/auth/register`, form);
      // setSuccess('Account created! Redirecting to login...');
      // setTimeout(() => navigate('/'), 1500);
      const res = await api.post(
        `${import.meta.env.VITE_API_URI}/api/auth/register`,
        form
      );

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      login(res.data.user);

      setSuccess("Account created successfully! Redirecting...");

      setTimeout(() => navigate("/app"), 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post(`${import.meta.env.VITE_API_URI}/api/auth/google`, {
        idToken: credentialResponse.credential,
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      login(res.data.user);
      setSuccess('Successfully logged in with Google!');
      setTimeout(() => navigate('/app'), 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Google Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${isDark ? activeTheme.dark : activeTheme.light
      }`}>
      <div className={`w-full max-w-md backdrop-blur-xl border rounded-3xl shadow-2xl p-8 sm:p-10 transition-all duration-500 ${isDark ? activeTheme.cardDark : activeTheme.card
        }`}>
        <h2 className="text-3xl font-extrabold text-center mb-2">📩 Spam Detector</h2>
        <p className="text-center opacity-70 mb-8 text-sm font-semibold">Create your account</p>

        {error && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/15 border border-green-500/30 text-green-500 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2 opacity-80">Username</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="johndoe"
              className={`w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 transition-all ${isDark ? activeTheme.inputDark : activeTheme.input
                }`}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2 opacity-80">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className={`w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 transition-all ${isDark ? activeTheme.inputDark : activeTheme.input
                }`}
            />
          </div>



          <div>
            <label className="block text-sm font-semibold mb-2 opacity-80">
              Password
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Min. 6 characters"
                className={`w-full px-4 py-3 pr-12 border rounded-xl outline-none focus:ring-2 transition-all ${isDark ? activeTheme.inputDark : activeTheme.input
                  }`}
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center text-gray-500 focus:outline-none"
              >
                {showPassword ? (
                  <EyeOff size={20} strokeWidth={2} />
                ) : (
                  <Eye size={20} strokeWidth={2} />
                )}
              </button>
            </div>
          </div>


          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-95 shadow-md ${activeTheme.accent
              } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="flex flex-col items-center mt-6">
          <div className="flex items-center w-full my-4">
            <div className="border-b border-gray-300 dark:border-gray-700 flex-grow"></div>
            <span className="px-3 text-xs opacity-65 font-semibold uppercase">Or continue with</span>
            <div className="border-b border-gray-300 dark:border-gray-700 flex-grow"></div>
          </div>

          <div className="w-full flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google Sign-in failed. Please try again.')}
              theme={isDark ? "dark" : "outline"}
              shape="rectangular"
              width={350}
            />
          </div>
        </div>

        <p className="text-center mt-6 text-sm opacity-70 font-medium">
          Already have an account?{' '}
          <Link to="/" className="text-blue-600 dark:text-blue-450 hover:underline font-semibold ml-1">
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;