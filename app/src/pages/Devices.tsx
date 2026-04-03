import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Cpu, 
  Search, 
  MoreHorizontal,
  Signal,
  Battery,
  MapPin,
  Trash2,
  Edit
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDevices } from '@/hooks/useApi';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export default function Devices() {
  const { devices, loading, registerDevice, deleteDevice } = useDevices();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newDevice, setNewDevice] = useState({
    deviceId: '',
    deviceType: 'guardian' as 'guardian' | 'buddy',
    name: ''
  });

  const filteredDevices = devices.filter(device => 
    device.device_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    device.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    device.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const guardians = filteredDevices.filter(d => d.device_type === 'guardian');
  const buddies = filteredDevices.filter(d => d.device_type === 'buddy');

  const handleAddDevice = async () => {
    try {
      await registerDevice(newDevice.deviceId, newDevice.deviceType, newDevice.name);
      setIsAddDialogOpen(false);
      setNewDevice({ deviceId: '', deviceType: 'guardian', name: '' });
      toast.success('Device registered successfully');
    } catch {
      toast.error('Failed to register device');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device?')) return;
    try {
      await deleteDevice(deviceId);
      toast.success('Device deleted');
    } catch {
      toast.error('Failed to delete device');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Guardians and Buddies
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Device</DialogTitle>
              <DialogDescription>
                Add a new Guardian hub or Buddy probe to your system.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="deviceId">Device ID</Label>
                <Input
                  id="deviceId"
                  placeholder="e.g., GRD-001 or BUD-001"
                  value={newDevice.deviceId}
                  onChange={(e) => setNewDevice({ ...newDevice, deviceId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deviceType">Device Type</Label>
                <Select
                  value={newDevice.deviceType}
                  onValueChange={(v) => setNewDevice({ ...newDevice, deviceType: v as 'guardian' | 'buddy' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="guardian">Guardian (Hub)</SelectItem>
                    <SelectItem value="buddy">Buddy (Probe)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  placeholder="e.g., Main Grow Room"
                  value={newDevice.name}
                  onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddDevice}>Register Device</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search devices..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Guardians Section */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5" />
          Guardians ({guardians.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {guardians.map((device) => (
            <Card key={device.device_id} className="group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <Link 
                    to={`/devices/${device.device_id}`}
                    className="flex-1"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="font-medium">{device.name || device.device_id}</p>
                        <p className="text-xs text-muted-foreground">{device.device_id}</p>
                      </div>
                    </div>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/devices/${device.device_id}`}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => handleDeleteDevice(device.device_id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 space-y-2">
                  {device.location && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {device.location}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span>{device.battery_voltage ? `${(device.battery_voltage / 1000).toFixed(2)}V` : '--'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Signal className="w-4 h-4 text-muted-foreground" />
                      <span>{device.rssi ? `${device.rssi}dBm` : '--'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Badge variant="outline" className="text-xs">
                      {device.buddy_count || 0} buddies
                    </Badge>
                    {device.last_seen && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(device.last_seen))} ago
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {guardians.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Cpu className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No Guardians registered</p>
                <Button 
                  variant="link" 
                  onClick={() => setIsAddDialogOpen(true)}
                  className="text-sm"
                >
                  Add your first Guardian
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Buddies Section */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Signal className="w-5 h-5" />
          Buddies ({buddies.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buddies.map((device) => (
            <Card key={device.device_id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="font-medium">{device.name || device.device_id}</p>
                      <p className="text-xs text-muted-foreground">{device.device_id}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => handleDeleteDevice(device.device_id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Battery className="w-4 h-4 text-muted-foreground" />
                    <span>{device.battery_voltage ? `${(device.battery_voltage / 1000).toFixed(2)}V` : '--'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Signal className="w-4 h-4 text-muted-foreground" />
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
          ))}
          
          {buddies.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Signal className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No Buddies registered</p>
                <p className="text-sm text-muted-foreground">
                  Buddies are automatically linked when they connect to a Guardian
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
