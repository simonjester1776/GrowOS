import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { SensorReading } from '@/types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socket.on('error', (error: Error) => {
      console.error('Socket error:', error);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const subscribeToDevice = useCallback((deviceId: string) => {
    socketRef.current?.emit('subscribe_device', deviceId);
  }, []);

  const unsubscribeFromDevice = useCallback((deviceId: string) => {
    socketRef.current?.emit('unsubscribe_device', deviceId);
  }, []);

  const on = useCallback((
    event: string,
    callback: (data: unknown) => void
  ) => {
    socketRef.current?.on(event, callback);
    return () => {
      socketRef.current?.off(event, callback);
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    subscribeToDevice,
    unsubscribeFromDevice,
    on,
  };
}

export function useRealtimeSensor(deviceId: string | undefined) {
  const [latestData, setLatestData] = useState<SensorReading | null>(null);
  const { subscribeToDevice, unsubscribeFromDevice, on, isConnected } = useSocket();

  useEffect(() => {
    if (!deviceId || !isConnected) return;

    subscribeToDevice(deviceId);

    const unsubscribe = on('sensor_update', (data) => {
      const sensorData = data as SensorReading & { deviceId: string };
      if (sensorData.deviceId === deviceId) {
        setLatestData(sensorData);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeFromDevice(deviceId);
    };
  }, [deviceId, isConnected, subscribeToDevice, unsubscribeFromDevice, on]);

  return { latestData, isConnected };
}
