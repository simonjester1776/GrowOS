import { useState } from 'react';
import { 
  TrendingUp, 
  Droplets,
  Thermometer,
  Wind
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useVPDAnalysis } from '@/hooks/useApi';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { format } from 'date-fns';

const VPD_ZONES = [
  { name: 'Too Low (<0.4)', key: 'too_low', color: '#3b82f6', range: '<0.4' },
  { name: 'Seedling (0.4-0.8)', key: 'seedling_range', color: '#22c55e', range: '0.4-0.8' },
  { name: 'Veg (0.8-1.2)', key: 'veg_range', color: '#84cc16', range: '0.8-1.2' },
  { name: 'Flower (1.2-1.6)', key: 'flower_range', color: '#f97316', range: '1.2-1.6' },
  { name: 'Too High (>1.6)', key: 'too_high', color: '#ef4444', range: '>1.6' },
];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState(24);
  const { analysis, loading } = useVPDAnalysis(timeRange);

  const vpdData = analysis?.zoneDistribution 
    ? VPD_ZONES.map(zone => ({
        name: zone.name,
        value: analysis.zoneDistribution[zone.key as keyof typeof analysis.zoneDistribution] || 0,
        color: zone.color,
        range: zone.range
      })).filter(d => d.value > 0)
    : [];

  const hourlyData = analysis?.hourlyData?.map(d => ({
    ...d,
    hour: format(new Date(d.hour), 'HH:mm')
  })) || [];

  const totalReadings = analysis?.zoneDistribution?.total || 0;

  const getOptimalPercentage = () => {
    if (!analysis?.zoneDistribution) return 0;
    const optimal = analysis.zoneDistribution.seedling_range + 
                   analysis.zoneDistribution.veg_range + 
                   analysis.zoneDistribution.flower_range;
    return totalReadings > 0 ? Math.round((optimal / totalReadings) * 100) : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Deep insights into your grow environment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={timeRange === 24 ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeRange(24)}
          >
            24h
          </Button>
          <Button 
            variant={timeRange === 72 ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeRange(72)}
          >
            3d
          </Button>
          <Button 
            variant={timeRange === 168 ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeRange(168)}
          >
            7d
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Optimal VPD Time</span>
            </div>
            <p className="text-2xl font-bold">{getOptimalPercentage()}%</p>
            <p className="text-xs text-muted-foreground">In ideal range</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Avg Humidity</span>
            </div>
            <p className="text-2xl font-bold">
              {hourlyData.length > 0 
                ? (hourlyData.reduce((acc, d) => acc + (d.avg_humidity || 0), 0) / hourlyData.length).toFixed(1)
                : '--'}%
            </p>
            <p className="text-xs text-muted-foreground">Last {timeRange}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Thermometer className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Avg Temperature</span>
            </div>
            <p className="text-2xl font-bold">
              {hourlyData.length > 0 
                ? (hourlyData.reduce((acc, d) => acc + (d.avg_temp || 0), 0) / hourlyData.length).toFixed(1)
                : '--'}°C
            </p>
            <p className="text-xs text-muted-foreground">Last {timeRange}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wind className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Avg VPD</span>
            </div>
            <p className="text-2xl font-bold">
              {hourlyData.length > 0 
                ? (hourlyData.reduce((acc, d) => acc + (d.avg_vpd || 0), 0) / hourlyData.length).toFixed(2)
                : '--'}kPa
            </p>
            <p className="text-xs text-muted-foreground">Last {timeRange}h</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="vpd" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vpd">VPD Analysis</TabsTrigger>
          <TabsTrigger value="trends">Environmental Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="vpd" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* VPD Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>VPD Zone Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {vpdData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={vpdData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {vpdData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [
                            `${value} readings (${((value / totalReadings) * 100).toFixed(1)}%)`,
                            'Count'
                          ]}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No VPD data available
                    </div>
                  )}
                </div>
                
                {/* Zone Legend */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {VPD_ZONES.map(zone => {
                    const count = analysis?.zoneDistribution?.[zone.key as keyof typeof analysis.zoneDistribution] || 0;
                    const percentage = totalReadings > 0 ? ((count / totalReadings) * 100).toFixed(1) : '0';
                    return (
                      <div key={zone.key} className="flex items-center gap-2 text-sm">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: zone.color }}
                        />
                        <span className="text-muted-foreground">{zone.range}</span>
                        <span className="font-medium">{percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* VPD Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>VPD Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {hourlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...hourlyData].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="hour" 
                          className="text-xs"
                          interval={Math.floor(hourlyData.length / 6)}
                        />
                        <YAxis 
                          className="text-xs"
                          domain={[0, 2]}
                        />
                        <Tooltip 
                          formatter={(value: number) => [`${value.toFixed(2)} kPa`, 'VPD']}
                        />
                        <Bar 
                          dataKey="avg_vpd" 
                          fill="#a855f7"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No hourly data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* VPD Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>VPD Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-500/10 rounded-lg">
                  <h4 className="font-medium text-blue-700 mb-2">Seedling Phase</h4>
                  <p className="text-sm text-muted-foreground">Target VPD: 0.4 - 0.8 kPa</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Higher humidity helps young plants establish roots
                  </p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg">
                  <h4 className="font-medium text-green-700 mb-2">Vegetative Phase</h4>
                  <p className="text-sm text-muted-foreground">Target VPD: 0.8 - 1.2 kPa</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Moderate VPD promotes healthy leaf growth
                  </p>
                </div>
                <div className="p-4 bg-orange-500/10 rounded-lg">
                  <h4 className="font-medium text-orange-700 mb-2">Flowering Phase</h4>
                  <p className="text-sm text-muted-foreground">Target VPD: 1.2 - 1.6 kPa</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Higher VPD increases resin production
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Temperature Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Temperature Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {hourlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...hourlyData].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="hour" 
                          className="text-xs"
                          interval={Math.floor(hourlyData.length / 6)}
                        />
                        <YAxis className="text-xs" />
                        <Tooltip formatter={(value: number) => [`${value.toFixed(1)}°C`, 'Temp']} />
                        <Bar dataKey="avg_temp" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No temperature data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Humidity Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Humidity Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {hourlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...hourlyData].reverse()}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="hour" 
                          className="text-xs"
                          interval={Math.floor(hourlyData.length / 6)}
                        />
                        <YAxis className="text-xs" domain={[0, 100]} />
                        <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, 'Humidity']} />
                        <Bar dataKey="avg_humidity" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No humidity data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
