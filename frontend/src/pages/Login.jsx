import { useState } from "react";
import { useEffect } from 'react';
import { useNavigate, Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { Eye, EyeOff } from "lucide-react";

import api from "../utils/axiosInstance";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import SpamLogo from "../assets/SpamLogo.png";

import "../App.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const { login } = useAuth();
  const { activeTheme, isDark } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      const res = await api.post(
        "/api/v1/auth/login",
        {
          email,
          password,
        },
      );

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      login(res.data.user);

      setSuccess("Login successful! Redirecting...");

      setTimeout(() => navigate("/app"), 1000);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await api.post(
        "/api/v1/auth/google",
        {
          idToken: credentialResponse.credential,
        },
      );

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      login(res.data.user);

      setSuccess("Successfully logged in with Google!");

      setTimeout(() => navigate("/app"), 1000);
    } catch (err) {
      setError(err.response?.data?.error || "Google Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 transition-all duration-500 ${isDark ? activeTheme.dark : activeTheme.light}`}>
      <div className={`w-full max-w-md backdrop-blur-xl border border-white/20 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-8 sm:p-10 transition-all duration-300 ${isDark ? activeTheme.cardDark : activeTheme.card}`}>
        <h1 className="flex items-center justify-center gap-3 text-3xl font-extrabold mb-2">
         <img src={SpamLogo} alt="Spam Logo" className="w-24 h-16 object-contain" />
         <span>Spam Detection System</span>
        </h1>
        <p className="text-center opacity-70 mb-8 text-sm font-semibold">Sign in to your account</p>

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
            <label className="block text-sm font-semibold mb-2 opacity-80">
              Email
            </label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 transition-all ${
                isDark ? activeTheme.inputDark : activeTheme.input
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-3 pr-12 border rounded-xl outline-none focus:ring-2 transition-all ${
                  isDark ? activeTheme.inputDark : activeTheme.input
                }`}
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
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
            className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-95 shadow-md ${
              activeTheme.accent
            } ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <p className="text-center text-sm">
            <Link
              to="/forgot-password"
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              Forgot password?
            </Link>
          </p>
        </form>

        <div className="flex flex-col items-center mt-6">
          <div className="flex items-center w-full my-4">
            <div className="border-b border-gray-300 dark:border-gray-700 flex-grow"></div>
            <span className="px-3 text-xs opacity-65 font-semibold uppercase">
              Or continue with
            </span>
            <div className="border-b border-gray-300 dark:border-gray-700 flex-grow"></div>
          </div>

          <div className="w-full flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() =>
                setError("Google Sign-in failed. Please try again.")
              }
              theme={isDark ? "dark" : "outline"}
              shape="rectangular"
             width={350}
            />
          </div>
        </div>

        <p className="text-center mt-6 text-sm opacity-70 font-medium">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
