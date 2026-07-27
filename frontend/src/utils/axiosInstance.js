import axios from 'axios';

// Resolves an API base URL from a Vite env var, falling back to a sensible
// localhost default for zero-config local development. Warns once so
// contributors notice when they're relying on the fallback instead of
// having actually configured VITE_API_URI/VITE_PYTHON_URI (issue #824) -
// the fallback isn't wrong for local dev, it's just silent otherwise.
function resolveApiUrl(envVarName, envValue, fallback) {
  if (envValue) return envValue;
  console.warn(
    `[config] ${envVarName} is not set - falling back to ${fallback}. ` +
    `This works for local development but will not reach a real backend ` +
    `once deployed. Set ${envVarName} in your .env file (see .env.example).`
  );
  return fallback;
}

export const API_BASE_URL = resolveApiUrl(
  'VITE_API_URI',
  import.meta.env.VITE_API_URI,
  'http://localhost:3000'
);

export const PYTHON_API_BASE_URL = resolveApiUrl(
  'VITE_PYTHON_URI',
  import.meta.env.VITE_PYTHON_URI,
  'http://127.0.0.1:5000'
);

const api = axios.create({
  baseURL: API_BASE_URL
});

export const pythonApi = axios.create({
  baseURL: PYTHON_API_BASE_URL,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default api;
