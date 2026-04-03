import { useEffect } from 'react';
import { 
  Cpu, 
  AlertTriangle, 
  Droplets, 
  Thermometer, 
  Wind,
  Activity,
  Zap,
  Battery
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDashboardOverview, useDevices } from '@/hooks/useApi';
import { useSocket } from '@/hooks/useSocket';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

function MetricCard({ 
  title, 
  value, 
  unit, 
  icon: Icon, 
  trend,
  status 
}: { 
  title: string; 
  value: string | number; 
  unit?: string;
  icon: React.ElementType;
  trend?: string;
  status?: 'good' | 'warning' | 'critical';
}) {
  const statusColors = {
    good: 'text-green-500',
    warning: 'text-yellow-500',
    critical: 'text-red-500'
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg bg-primary/10`}>
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${status ? statusColors[status] : ''}`}>
                  {value}
                </span>
                {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
              </div>
            </div>
          </div>
          {trend && (
            <Badge variant="outline" className="text-xs">
              {trend}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { overview, loading, refresh } = useDashboardOverview();
  const { devices, refresh: refreshDevices } = useDevices();
  const { on, isConnected } = useSocket();

  // Listen for real-time updates
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = on('sensor_update', () => {
      refresh();
      refreshDevices();
    });

    return () => {
      unsubscribe();
    };
  }, [isConnected, on, refresh, refreshDevices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const latestReading = overview?.latestReadings?.[0];
  const guardians = devices?.filter(d => d.device_type === 'guardian') || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your grow environment in real-time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-muted-foreground">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <Cpu className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Devices</p>
                  <p className="text-2xl font-bold">{overview?.summary?.total_devices || 0}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Online</p>
                <p className="text-lg font-semibold text-green-500">
                  {overview?.summary?.online_devices || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-yellow-500/10">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Alerts</p>
                  <p className="text-2xl font-bold">{overview?.summary?.unacknowledgedAlerts || 0}</p>
                </div>
              </div>
              <Link to="/alerts" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-500/10">
                  <Zap className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Guardians</p>
                  <p className="text-2xl font-bold">{overview?.summary?.guardians || 0}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Buddies</p>
                <p className="text-lg font-semibold">{overview?.summary?.buddies || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-purple-500/10">
                  <Droplets className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg VPD</p>
                  <p className="text-2xl font-bold">
                    {latestReading?.vpd?.toFixed(2) || '--'}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">kPa</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Environmental Metrics */}
      {latestReading && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Current Environment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Temperature"
              value={latestReading.temperature?.toFixed(1) || '--'}
              unit="°C"
              icon={Thermometer}
              status={latestReading.temperature && latestReading.temperature > 30 ? 'warning' : 'good'}
            />
            <MetricCard
              title="Humidity"
              value={latestReading.humidity?.toFixed(1) || '--'}
              unit="%"
              icon={Droplets}
              status={latestReading.humidity && (latestReading.humidity < 40 || latestReading.humidity > 70) ? 'warning' : 'good'}
            />
            <MetricCard
              title="CO₂"
              value={latestReading.co2 || '--'}
              unit="ppm"
              icon={Wind}
              status={latestReading.co2 && latestReading.co2 > 1500 ? 'warning' : 'good'}
            />
            <MetricCard
              title="Light"
              value={latestReading.lux || '--'}
              unit="lux"
              icon={Zap}
            />
          </div>
        </div>
      )}

      {/* Device Status */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Device Status</h2>
          <Link to="/devices" className="text-sm text-primary hover:underline">
            Manage devices
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {guardians.map((device) => (
            <Link key={device.device_id} to={`/devices/${device.device_id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="font-medium">{device.name || device.device_id}</p>
                        <p className="text-xs text-muted-foreground">{device.location || 'No location'}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {device.buddy_count || 0} buddies
                    </Badge>
                  </div>
                  
                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span>{device.battery_voltage ? `${(device.battery_voltage / 1000).toFixed(2)}V` : '--'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="w-4 h-4 text-muted-foreground" />
                      <span>{device.rssi ? `${device.rssi}dBm` : '--'}</span>
                    </div>
                  </div>
                  
                  {device.last_seen && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last seen {formatDistanceToNow(new Date(device.last_seen))} ago
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
          
          {guardians.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Cpu className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No devices connected</p>
                <Link to="/devices" className="text-primary hover:underline text-sm">
                  Add your first device
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Needs Attention */}
      {overview?.needsAttention && overview.needsAttention.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-yellow-600">Needs Attention</h2>
          <div className="space-y-2">
            {overview.needsAttention.map((device) => (
              <Card key={device.device_id} className="border-yellow-500/50">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <div>
                      <p className="font-medium">{device.name || device.device_id}</p>
                      <p className="text-sm text-muted-foreground">
                        {!device.is_online 
                          ? 'Device is offline' 
                          : device.battery_voltage && device.battery_voltage < 3.3 
                            ? 'Low battery'
                            : 'Needs attention'}
                      </p>
                    </div>
                  </div>
                  <Link to={`/devices/${device.device_id}`}>
                    <Badge variant="outline">View</Badge>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
