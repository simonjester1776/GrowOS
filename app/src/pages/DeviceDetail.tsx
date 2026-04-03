// Device Detail Page
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Power, 
  Settings, 
  Battery, 
  Signal,
  Clock,
  Thermometer,
  Droplets,
  Wind,
  Sun,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useDevice, useSensorData, useRelays } from '@/hooks/useApi';
import { useRealtimeSensor } from '@/hooks/useSocket';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';

function SensorChart({ 
  data, 
  dataKey, 
  color, 
  unit,
  title 
}: { 
  data: Array<{ bucket?: string; ts?: string; [key: string]: unknown }>;
  dataKey: string;
  color: string;
  unit: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[...data].reverse()}>
              <defs>
                <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey={data[0]?.bucket ? 'bucket' : 'ts'}
                tickFormatter={(value) => {
                  if (!value) return '';
                  const date = new Date(value);
                  return format(date, 'HH:mm');
                }}
                className="text-xs"
              />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))'
                }}
                formatter={(value: number) => [`${value.toFixed(1)} ${unit}`, title]}
                labelFormatter={(label) => format(new Date(label), 'MMM d, HH:mm')}
              />
              <Area 
                type="monotone" 
                dataKey={dataKey} 
                stroke={color} 
                fill={`url(#gradient-${dataKey})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { device, buddies, loading } = useDevice(deviceId);
  const { data: sensorData, latest } = useSensorData(deviceId, 24);
  const { relays: relayStates, toggleRelay } = useRelays(deviceId);
  const { latestData: realtimeData } = useRealtimeSensor(deviceId);

  const currentData = realtimeData || latest;

  const handleToggleRelay = async (index: number) => {
    try {
      await toggleRelay(index);
      toast.success('Relay toggled');
    } catch {
      toast.error('Failed to toggle relay');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Device not found</p>
        <Link to="/devices">
          <Button variant="link">Back to devices</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/devices" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="w-4 h-4" />
            Back to devices
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {device.name || device.device_id}
            </h1>
            <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          <p className="text-muted-foreground mt-1">{device.device_id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Device Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Battery className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Battery</p>
              <p className="font-medium">
                {device.battery_voltage ? `${(device.battery_voltage / 1000).toFixed(2)}V` : '--'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Signal className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Signal</p>
              <p className="font-medium">{device.rssi ? `${device.rssi}dBm` : '--'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Last Seen</p>
              <p className="font-medium">
                {device.last_seen 
                  ? format(new Date(device.last_seen), 'HH:mm')
                  : '--'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Firmware</p>
              <p className="font-medium">{device.firmware_version || '--'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="sensors" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sensors">Sensors</TabsTrigger>
          <TabsTrigger value="relays">Relays</TabsTrigger>
          <TabsTrigger value="buddies">Buddies ({buddies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sensors" className="space-y-4">
          {/* Current Values */}
          {currentData && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="w-4 h-4 text-orange-500" />
                    <span className="text-sm text-muted-foreground">Temp</span>
                  </div>
                  <p className="text-2xl font-bold">{currentData.temperature?.toFixed(1) || '--'}°C</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Humidity</span>
                  </div>
                  <p className="text-2xl font-bold">{currentData.humidity?.toFixed(1) || '--'}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wind className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-muted-foreground">CO₂</span>
                  </div>
                  <p className="text-2xl font-bold">{currentData.co2 || '--'}<span className="text-sm font-normal">ppm</span></p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sun className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Light</span>
                  </div>
                  <p className="text-2xl font-bold">{currentData.lux || '--'}<span className="text-sm font-normal">lux</span></p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">VPD</span>
                  </div>
                  <p className="text-2xl font-bold">{currentData.vpd?.toFixed(2) || '--'}<span className="text-sm font-normal">kPa</span></p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">VOC</span>
                  </div>
                  <p className="text-2xl font-bold">{currentData.voc_index || '--'}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Charts */}
          {sensorData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SensorChart
                data={sensorData}
                dataKey="avg_temperature"
                color="#f97316"
                unit="°C"
                title="Temperature"
              />
              <SensorChart
                data={sensorData}
                dataKey="avg_humidity"
                color="#3b82f6"
                unit="%"
                title="Humidity"
              />
              <SensorChart
                data={sensorData}
                dataKey="avg_co2"
                color="#6b7280"
                unit="ppm"
                title="CO₂"
              />
              <SensorChart
                data={sensorData}
                dataKey="avg_vpd"
                color="#a855f7"
                unit="kPa"
                title="VPD"
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="relays" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((index) => {
              const relay = relayStates.find(r => r.relay_index === index);
              return (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${relay?.is_on ? 'bg-green-500/10' : 'bg-gray-500/10'}`}>
                          <Power className={`w-5 h-5 ${relay?.is_on ? 'text-green-500' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{relay?.relay_name || `Relay ${index + 1}`}</p>
                          <p className="text-sm text-muted-foreground">
                            {relay?.is_on ? 'On' : 'Off'}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={relay?.is_on || false}
                        onCheckedChange={() => handleToggleRelay(index)}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="buddies" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {buddies.map((buddy) => (
              <Card key={buddy.device_id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-3 h-3 rounded-full ${buddy.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="font-medium">{buddy.name || buddy.device_id}</p>
                      <p className="text-xs text-muted-foreground">{buddy.device_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span>{buddy.battery_voltage ? `${(buddy.battery_voltage / 1000).toFixed(2)}V` : '--'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Signal className="w-4 h-4 text-muted-foreground" />
                      <span>{buddy.rssi ? `${buddy.rssi}dBm` : '--'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {buddies.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No Buddies linked to this Guardian</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Buddies will appear here when they connect
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
