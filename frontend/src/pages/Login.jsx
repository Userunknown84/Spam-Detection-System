import { useState } from 'react';
import api from '../utils/axiosInstance';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { GoogleLogin } from '@react-oauth/google';
import '../App.css';
import SpamLogo from "/src/assets/SpamLogo.png";
import { Eye, EyeOff } from "lucide-react";


const Login = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { activeTheme, isDark } = useTheme();
   const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(`${import.meta.env.VITE_API_URI}/api/auth`, form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      login(res.data.user);
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`${import.meta.env.VITE_API_URI}/api/auth/google`, {
        idToken: credentialResponse.credential,
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      login(res.data.user);
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.error || 'Google Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${isDark ? activeTheme.dark : activeTheme.light
      }`}>
  // Line 68 change: 
// Add a slightly distinct border color tint and change shadow-2xl to shadow-[0_20px_50px_rgba(0,0,0,0.3)]
className={`w-full max-w-md backdrop-blur-xl border border-white/20 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-8 sm:p-10 transition-all duration-300`}
        
         <h1 className="flex items-center justify-center gap-3 text-3xl font-extrabold mb-2">
         <img src={SpamLogo} alt="Spam Logo" className="w-24 h-16 object-contain mix-blend-multiply" />
        <span>Spam Detector</span>
        </h1>
        <p className="text-center opacity-70 mb-8 text-sm font-semibold">Sign in to your account</p>

        {error && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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
            
            <div className="flex justify-end mt-2">
              <Link to="/forgot-password" className="text-sm text-blue-600 dark:text-blue-450 hover:underline font-semibold">
                Forgot Password?
              </Link>
            </div>
          </div>



          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-95 shadow-md ${activeTheme.accent
              } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Signing in...' : 'Sign In'}
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
              width="100%"
            />
          </div>
        </div>

        <p className="text-center mt-6 text-sm opacity-70 font-medium">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 dark:text-blue-450 hover:underline font-semibold ml-1">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
