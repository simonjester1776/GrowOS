export interface User {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface Device {
  id: number;
  device_id: string;
  device_type: 'guardian' | 'buddy';
  name?: string;
  location?: string;
  firmware_version?: string;
  last_seen?: string;
  is_online: boolean;
  battery_voltage?: number;
  rssi?: number;
  snr?: number;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  buddy_count?: number;
}

export interface SensorReading {
  [key: string]: unknown;
  id?: number;
  device_id: string;
  ts: string;
  co2?: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  lux?: number;
  voc_index?: number;
  vpd?: number;
  moisture?: number;
  soil_temp?: number;
  ec?: number;
  ph?: number;
  pm25?: number;
  pm10?: number;
  battery_voltage?: number;
}

export interface AlertRule {
  id: number;
  device_id: string;
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'between';
  threshold_value?: number;
  threshold_min?: number;
  threshold_max?: number;
  duration_minutes: number;
  is_active: boolean;
  notify_push: boolean;
  notify_email: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertHistory {
  id: number;
  rule_id?: number;
  device_id: string;
  device_name?: string;
  rule_name?: string;
  metric: string;
  value: number;
  threshold_value?: number;
  message?: string;
  severity: 'warning' | 'critical' | 'info';
  acknowledged_at?: string;
  acknowledged_by?: number;
  resolved_at?: string;
  created_at: string;
}

export interface RelayState {
  id: number;
  device_id: string;
  relay_index: number;
  relay_name?: string;
  is_on: boolean;
  auto_mode: boolean;
  schedule?: Array<{
    time: string;
    action: 'on' | 'off';
    days: number[];
  }>;
  last_toggled_at?: string;
}

export interface DashboardSummary {
  total_devices: number;
  guardians: number;
  buddies: number;
  online_devices: number;
  unacknowledgedAlerts: number;
}

export interface DashboardOverview {
  summary: DashboardSummary;
  latestReadings: SensorReading[];
  needsAttention: Device[];
}

export interface VPDZoneData {
  hour: string;
  avg_vpd: number;
  avg_temp: number;
  avg_humidity: number;
  readings: number;
}

export interface VPDAnalysis {
  hours: number;
  hourlyData: VPDZoneData[];
  zoneDistribution: {
    too_low: number;
    seedling_range: number;
    veg_range: number;
    flower_range: number;
    too_high: number;
    total: number;
  };
}
