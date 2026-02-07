// src/hooks/useNursingWebSocket.ts
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface NursingUpdate {
  type: string;
  data: any;
  timestamp: string;
}

interface PatientAlert {
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  encounterId: number;
  patientName: string;
  message: string;
  timestamp: string;
}

interface MedicationUpdate {
  type: 'administered' | 'scheduled' | 'overdue';
  encounterId: number;
  medication: string;
  administeredBy?: string;
  status: string;
  timestamp: string;
}

interface VitalsUpdate {
  type: 'vitals_updated';
  encounterId: number;
  vitals: any;
  nurseName: string;
  timestamp: string;
}

export function useNursingWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState<PatientAlert[]>([]);
  const [medicationUpdates, setMedicationUpdates] = useState<MedicationUpdate[]>([]);
  const [vitalsUpdates, setVitalsUpdates] = useState<VitalsUpdate[]>([]);
  const [connectedNurses, setConnectedNurses] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // The system uses cookies for authentication, not localStorage tokens
    // We'll connect without token verification for now
    // In production, the backend should verify cookies
    
    console.log('🔌 Connecting to WebSocket with cookie-based authentication...');
    
    // Initialize socket connection - use same URL as backend API
    // In development: localhost:3000
    // In production: same as VITE_API_URL (e.g., http://server:3000)
    let wsUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    // Remove /api suffix if present (WebSocket connects to root)
    wsUrl = wsUrl.replace(/\/api\/?$/, '');
    console.log('🔌 Connecting to WebSocket at:', wsUrl);
    
    const socket = io(`${wsUrl}/nursing`, {
      // No token needed - using cookies
      transports: ['websocket', 'polling'], // Add polling as fallback
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true, // Important for cookies
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Connected to nursing WebSocket');
      setIsConnected(true);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      console.error('Error details:', error.message);
      setIsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from nursing WebSocket:', reason);
      setIsConnected(false);
    });

    // Initial data
    socket.on('initial_data', (data) => {
      console.log('Received initial data:', data);
      // Handle initial data
    });

    // Real-time updates
    socket.on('patient_alert', (alert: PatientAlert) => {
      console.log('Patient alert:', alert);
      setAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep last 50 alerts
      
      // Show browser notification if permission granted
      if (Notification.permission === 'granted') {
        new Notification(`Patient Alert: ${alert.patientName}`, {
          body: alert.message,
          icon: '/alert-icon.png',
        });
      }
    });

    socket.on('medication_update', (update: MedicationUpdate) => {
      console.log('Medication update:', update);
      setMedicationUpdates(prev => [update, ...prev].slice(0, 50));
    });

    socket.on('vitals_update', (update: VitalsUpdate) => {
      console.log('Vitals update:', update);
      setVitalsUpdates(prev => [update, ...prev].slice(0, 50));
    });

    socket.on('critical_vitals_alert', (alert) => {
      console.log('Critical vitals alert:', alert);
      setAlerts(prev => [{
        type: 'CRITICAL' as const,
        encounterId: alert.encounterId,
        patientName: alert.patientName,
        message: `Critical values detected: ${alert.criticalValues.join(', ')}`,
        timestamp: alert.timestamp,
      }, ...prev].slice(0, 50));
    });

    socket.on('medication_reminder', (reminder) => {
      console.log('Medication reminder:', reminder);
      setMedicationUpdates(prev => [{
        type: 'scheduled' as const,
        encounterId: reminder.encounterId,
        medication: 'Multiple medications',
        status: 'PENDING',
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 50));
    });

    socket.on('nurse_connected', (data) => {
      console.log('Nurse connected:', data);
      setConnectedNurses(prev => [...prev, data.nurseName]);
    });

    socket.on('nurse_disconnected', (data) => {
      console.log('Nurse disconnected:', data);
      setConnectedNurses(prev => prev.filter(name => name !== data.nurseName));
    });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      socket.disconnect();
    };
  }, []);

  // Methods to interact with WebSocket
  const joinWard = (wardId: number) => {
    socketRef.current?.emit('join_ward', { wardId });
  };

  const reportMedicationAdministered = (data: {
    encounterId: number;
    medicationName: string;
    administeredBy: string;
    status: string;
  }) => {
    socketRef.current?.emit('medication_administered', data);
  };

  const reportVitalsUpdated = (data: {
    encounterId: number;
    vitals: any;
    nurseName: string;
  }) => {
    socketRef.current?.emit('vitals_updated', data);
  };

  const createPatientAlert = (data: {
    encounterId: number;
    alertType: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
    patientName: string;
  }) => {
    socketRef.current?.emit('patient_alert', data);
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  const clearMedicationUpdates = () => {
    setMedicationUpdates([]);
  };

  const clearVitalsUpdates = () => {
    setVitalsUpdates([]);
  };

  return {
    isConnected,
    alerts,
    medicationUpdates,
    vitalsUpdates,
    connectedNurses,
    joinWard,
    reportMedicationAdministered,
    reportVitalsUpdated,
    createPatientAlert,
    clearAlerts,
    clearMedicationUpdates,
    clearVitalsUpdates,
  };
}
