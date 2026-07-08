import axios from 'axios';

const api = axios.create({ 
  baseURL: import.meta.env.VITE_API_URI || 'http://localhost:3000' 
});

export const pythonApi = axios.create({ 
  baseURL: import.meta.env.VITE_PYTHON_URI || 'http://127.0.0.1:5000',
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