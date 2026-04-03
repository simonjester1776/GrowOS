import { useState, useEffect, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import type { 
  Device, SensorReading, AlertRule, AlertHistory, 
  RelayState, DashboardOverview, VPDAnalysis 
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth hooks
export function useLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', response.data.token);
      return response.data;
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ error: string }>;
      setError(axiosError.response?.data?.error || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { login, loading, error };
}

export function useRegister() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/auth/register', { 
        email, 
        password, 
        firstName, 
        lastName 
      });
      localStorage.setItem('token', response.data.token);
      return response.data;
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ error: string }>;
      setError(axiosError.response?.data?.error || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { register, loading, error };
}

export function useVerifyToken() {
  const [user, setUser] = useState<{ id: number; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verify = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/auth/verify');
        setUser(response.data.user);
      } catch {
        localStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, []);

  return { user, loading };
}

// Device hooks
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/devices');
      setDevices(response.data.devices);
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ error: string }>;
      setError(axiosError.response?.data?.error || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const registerDevice = async (deviceId: string, deviceType: 'guardian' | 'buddy', name?: string) => {
    const response = await api.post('/devices/register', { deviceId, deviceType, name });
    await fetchDevices();
    return response.data;
  };

  const updateDevice = async (deviceId: string, updates: Partial<Device>) => {
    const response = await api.patch(`/devices/${deviceId}`, updates);
    await fetchDevices();
    return response.data;
  };

  const deleteDevice = async (deviceId: string) => {
    await api.delete(`/devices/${deviceId}`);
    await fetchDevices();
  };

  const sendCommand = async (deviceId: string, command: string, payload?: Record<string, unknown>) => {
    const response = await api.post(`/devices/${deviceId}/command`, { command, payload });
    return response.data;
  };

  return { 
    devices, 
    loading, 
    error, 
    refresh: fetchDevices,
    registerDevice,
    updateDevice,
    deleteDevice,
    sendCommand
  };
}

export function useDevice(deviceId: string | undefined) {
  const [device, setDevice] = useState<Device | null>(null);
  const [buddies, setBuddies] = useState<Device[]>([]);
  const [relays, setRelays] = useState<RelayState[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDevice = useCallback(async () => {
    if (!deviceId) return;
    try {
      setLoading(true);
      const response = await api.get(`/devices/${deviceId}`);
      setDevice(response.data.device);
      setBuddies(response.data.buddies);
      setRelays(response.data.relays);
    } catch (err) {
      console.error('Failed to fetch device:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchDevice();
  }, [fetchDevice]);

  return { device, buddies, relays, loading, refresh: fetchDevice };
}

// Sensor hooks
export function useSensorData(deviceId: string | undefined, hours: number = 24) {
  const [data, setData] = useState<SensorReading[]>([]);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!deviceId) return;
    try {
      setLoading(true);
      const [historyRes, latestRes] = await Promise.all([
        api.get(`/sensors/${deviceId}/history?hours=${hours}&interval=15m`),
        api.get(`/sensors/${deviceId}/latest`)
      ]);
      setData(historyRes.data.data || []);
      setLatest(latestRes.data.data);
    } catch (err) {
      console.error('Failed to fetch sensor data:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId, hours]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, latest, loading, refresh: fetchData };
}

// Alert hooks
export function useAlertRules(deviceId: string | undefined) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    if (!deviceId) return;
    try {
      setLoading(true);
      const response = await api.get(`/alerts/rules/${deviceId}`);
      setRules(response.data.rules);
    } catch (err) {
      console.error('Failed to fetch alert rules:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = async (rule: Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>) => {
    const response = await api.post('/alerts/rules', rule);
    await fetchRules();
    return response.data;
  };

  const updateRule = async (ruleId: number, updates: Partial<AlertRule>) => {
    const response = await api.patch(`/alerts/rules/${ruleId}`, updates);
    await fetchRules();
    return response.data;
  };

  const deleteRule = async (ruleId: number) => {
    await api.delete(`/alerts/rules/${ruleId}`);
    await fetchRules();
  };

  return { rules, loading, refresh: fetchRules, createRule, updateRule, deleteRule };
}

export function useAlertHistory(limit: number = 50) {
  const [alerts, setAlerts] = useState<AlertHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/alerts/history?limit=${limit}`);
      setAlerts(response.data.alerts);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const acknowledgeAlert = async (alertId: number) => {
    await api.post(`/alerts/history/${alertId}/acknowledge`);
    await fetchAlerts();
  };

  const resolveAlert = async (alertId: number) => {
    await api.post(`/alerts/history/${alertId}/resolve`);
    await fetchAlerts();
  };

  return { alerts, loading, refresh: fetchAlerts, acknowledgeAlert, resolveAlert };
}

// Relay hooks
export function useRelays(deviceId: string | undefined) {
  const [relays, setRelays] = useState<RelayState[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRelays = useCallback(async () => {
    if (!deviceId) return;
    try {
      setLoading(true);
      const response = await api.get(`/relays/${deviceId}`);
      setRelays(response.data.relays);
    } catch (err) {
      console.error('Failed to fetch relays:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchRelays();
  }, [fetchRelays]);

  const toggleRelay = async (relayIndex: number) => {
    await api.post(`/relays/${deviceId}/${relayIndex}/toggle`);
    await fetchRelays();
  };

  const setRelayState = async (relayIndex: number, state: boolean) => {
    await api.post(`/relays/${deviceId}/${relayIndex}/set`, { state });
    await fetchRelays();
  };

  const updateRelayConfig = async (relayIndex: number, config: Partial<RelayState>) => {
    await api.patch(`/relays/${deviceId}/${relayIndex}/config`, config);
    await fetchRelays();
  };

  return { relays, loading, refresh: fetchRelays, toggleRelay, setRelayState, updateRelayConfig };
}

// Dashboard hooks
export function useDashboardOverview() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboard/overview');
      setOverview(response.data);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return { overview, loading, refresh: fetchOverview };
}

export function useVPDAnalysis(hours: number = 24) {
  const [analysis, setAnalysis] = useState<VPDAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/dashboard/vpd-analysis?hours=${hours}`);
      setAnalysis(response.data);
    } catch (err) {
      console.error('Failed to fetch VPD analysis:', err);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return { analysis, loading, refresh: fetchAnalysis };
}

export { api };
