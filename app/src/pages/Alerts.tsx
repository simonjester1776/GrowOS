import { useState } from 'react';
import { 
  Bell, 
  Check, 
  AlertTriangle, 
  Filter,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAlertHistory, useDevices } from '@/hooks/useApi';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';

export default function Alerts() {
  const { alerts, loading, acknowledgeAlert, resolveAlert } = useAlertHistory(100);
  const { devices } = useDevices();
  const [filter, setFilter] = useState<'all' | 'unacknowledged'>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'unacknowledged' && alert.acknowledged_at) return false;
    if (deviceFilter !== 'all' && alert.device_id !== deviceFilter) return false;
    return true;
  });

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged_at).length;

  const handleAcknowledge = async (alertId: number) => {
    try {
      await acknowledgeAlert(alertId);
      toast.success('Alert acknowledged');
    } catch {
      toast.error('Failed to acknowledge alert');
    }
  };

  const handleResolve = async (alertId: number) => {
    try {
      await resolveAlert(alertId);
      toast.success('Alert resolved');
    } catch {
      toast.error('Failed to resolve alert');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default:
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case 'temperature':
        return '°C';
      case 'humidity':
        return '%';
      case 'co2':
        return 'ppm';
      case 'vpd':
        return 'kPa';
      default:
        return '';
    }
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
          <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage system alerts
          </p>
        </div>
        {unacknowledgedCount > 0 && (
          <Badge variant="destructive" className="text-sm">
            {unacknowledgedCount} unacknowledged
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unacknowledged')}>
          <TabsList>
            <TabsTrigger value="all">All Alerts</TabsTrigger>
            <TabsTrigger value="unacknowledged">
              Unacknowledged
              {unacknowledgedCount > 0 && (
                <span className="ml-2 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                  {unacknowledgedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              {devices.map(device => (
                <SelectItem key={device.device_id} value={device.device_id}>
                  {device.name || device.device_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">No alerts</h3>
              <p className="text-muted-foreground">
                {filter === 'unacknowledged' 
                  ? 'All alerts have been acknowledged'
                  : 'No alerts have been triggered yet'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredAlerts.map((alert) => (
            <Card 
              key={alert.id} 
              className={alert.acknowledged_at ? 'opacity-60' : ''}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{alert.message || `${alert.metric} alert`}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {alert.severity}
                        </Badge>
                        {alert.rule_name && (
                          <Badge variant="secondary" className="text-xs">
                            {alert.rule_name}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>{alert.device_name || alert.device_id}</span>
                        <span>•</span>
                        <span className="capitalize">{alert.metric}</span>
                        <span>•</span>
                        <span>
                          Value: <strong>{alert.value}{getMetricIcon(alert.metric)}</strong>
                          {alert.threshold_value && (
                            <> (threshold: {alert.threshold_value}{getMetricIcon(alert.metric)})</>
                          )}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{format(new Date(alert.created_at), 'MMM d, yyyy HH:mm')}</span>
                        <span>({formatDistanceToNow(new Date(alert.created_at))} ago)</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!alert.acknowledged_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAcknowledge(alert.id)}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Ack
                      </Button>
                    )}
                    {!alert.resolved_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResolve(alert.id)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>

                {(alert.acknowledged_at || alert.resolved_at) && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
                    {alert.acknowledged_at && (
                      <span>
                        Acknowledged {formatDistanceToNow(new Date(alert.acknowledged_at))} ago
                      </span>
                    )}
                    {alert.resolved_at && (
                      <span>
                        Resolved {formatDistanceToNow(new Date(alert.resolved_at))} ago
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
