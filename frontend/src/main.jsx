import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './pages/App.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google'
import History from './components/History.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Register the service worker so the app is installable (PWA) and works offline.
// Only in production builds — the dev server should not be intercepted by a SW.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <GoogleOAuthProvider clientId={googleClientId}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/app" element={<App />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/history" element={<History/>}/>
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:id/:token" element={<ResetPassword />} />
            </Routes>
          </AuthProvider>
        </GoogleOAuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
)