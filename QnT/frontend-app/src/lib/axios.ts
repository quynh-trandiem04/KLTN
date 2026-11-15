// frontend-app/lib/axios.ts
import axios from 'axios';
import { getAuthHeader } from './auth';

// Tạo instance trỏ về Backend API (Port 4000)
// Sử dụng proxy /api qua next.config.ts để tránh lỗi Network Error trên client (CORS/localhost)
const api = axios.create({
  baseURL: '/api', 
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tự động gắn token vào mọi request
api.interceptors.request.use((config) => {
  // Only set if not already explicitly set by caller
  if (!config.headers.Authorization) {
    const authHeader = getAuthHeader();
    if (authHeader) {
      config.headers.Authorization = authHeader;
    }
  }
  return config;
});

export default api;