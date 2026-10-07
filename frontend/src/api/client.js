import axios from 'axios'
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
export const api = axios.create({ baseURL: API_BASE, timeout: 30000 })
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('spp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
