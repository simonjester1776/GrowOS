import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { useVerifyToken } from '@/hooks/useApi';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Devices from '@/pages/Devices';
import DeviceDetail from '@/pages/DeviceDetail';
import Alerts from '@/pages/Alerts';
import Analytics from '@/pages/Analytics';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import { Loader2 } from 'lucide-react';

function App() {
  const { user, loading } = useVerifyToken();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={user ? <Navigate to="/" /> : <Login />} 
        />
        <Route 
          path="/register" 
          element={user ? <Navigate to="/" /> : <Register />} 
        />
        <Route
          path="/"
          element={user ? <Layout /> : <Navigate to="/login" />}
        >
          <Route index element={<Dashboard />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:deviceId" element={<DeviceDetail />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </BrowserRouter>
  );
}

export default App;
