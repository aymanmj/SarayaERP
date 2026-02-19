import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

type RadiologyOrder = {
  id: number;
  status: string; // PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  scheduledAt: string | null;
  reportedAt: string | null;
  reportText: string | null;
  pacsUrl: string | null;
  study: {
    id: number;
    code: string;
    name: string;
    modality: string | null;
    bodyPart: string | null;
  };
  order: {
    id: number;
    status: string;
    notes: string | null;
    createdAt: string;
  };
};

interface RadiologyListProps {
  encounterId: number;
}

export default function RadiologyList({ encounterId }: RadiologyListProps) {
  const [orders, setOrders] = useState<RadiologyOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!encounterId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRadiologyOrders(encounterId);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load radiology orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [encounterId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#10b981'; // emerald-500
      case 'IN_PROGRESS': return '#3b82f6'; // blue-500
      case 'PENDING': return '#f59e0b'; // amber-500
      case 'CANCELLED': return '#ef4444'; // red-500
      default: return '#64748b'; // slate-500
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'Completed';
      case 'IN_PROGRESS': return 'In Progress';
      case 'PENDING': return 'Pending';
      case 'CANCELLED': return 'Cancelled';
      default: return status;
    }
  };

  const openPacs = (url: string) => {
    if (!url) return;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert("Error", "Cannot open PACS URL: " + url);
      }
    });
  };

  const renderItem = ({ item }: { item: RadiologyOrder }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.studyInfo}>
           <Text style={styles.studyName}>{item.study.name}</Text>
           <Text style={styles.modality}>{item.study.modality} - {item.study.bodyPart}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
            </Text>
        </View>
      </View>
      
      {item.status === 'COMPLETED' && item.reportText && (
        <View style={styles.reportContainer}>
          <Text style={styles.reportLabel}>Radiologist Report:</Text>
          <Text style={styles.reportText}>{item.reportText}</Text>
        </View>
      )}

      {item.pacsUrl && (
        <TouchableOpacity 
            style={styles.pacsButton}
            onPress={() => openPacs(item.pacsUrl!)}
        >
            <Ionicons name="images" size={18} color="#0284c7" />
            <Text style={styles.pacsButtonText}>View Images (PACS)</Text>
        </TouchableOpacity>
      )}

      {item.order.notes && (
          <View style={styles.notesContainer}>
              <Text style={styles.noteLabel}>Ordering Notes:</Text>
              <Text style={styles.noteValue}>{item.order.notes}</Text>
          </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.date}>
             Ordered: {new Date(item.order.createdAt).toLocaleDateString()} - {new Date(item.order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </Text>
        {item.reportedAt && (
             <Text style={styles.date}>
                 Reported: {new Date(item.reportedAt).toLocaleDateString()} - {new Date(item.reportedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </Text>
        )}
      </View>
    </View>
  );

  if (loading && orders.length === 0) {
    return <ActivityIndicator size="small" color="#0284c7" style={{ marginTop: 20 }} />;
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  if (orders.length === 0) {
    return (
        <View style={styles.emptyContainer}>
            <Ionicons name="scan-circle-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>No radiology orders found.</Text>
        </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderItem}
      contentContainerStyle={styles.container}
      refreshing={loading}
      onRefresh={fetchOrders}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    paddingBottom: 20
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  studyInfo: {
      flex: 1,
      marginRight: 8,
  },
  studyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 2,
  },
  modality: {
      fontSize: 12,
      color: '#64748b',
      fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reportContainer: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginTop: 8,
  },
  reportLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  reportText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  pacsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      borderRadius: 8,
      backgroundColor: '#e0f2fe',
      marginTop: 12,
      borderWidth: 1,
      borderColor: '#bae6fd',
  },
  pacsButtonText: {
      color: '#0284c7',
      fontWeight: '600',
      marginLeft: 8,
  },
  notesContainer: {
      marginTop: 8,
      flexDirection: 'row',
  },
  noteLabel: {
      fontSize: 12,
      color: '#94a3b8',
      marginRight: 4,
  },
  noteValue: {
      fontSize: 12,
      color: '#64748b',
      fontStyle: 'italic',
      flex: 1,
  },
  footer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  date: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
  },
  error: {
      color: '#ef4444',
      textAlign: 'center',
      marginTop: 20,
  },
  emptyContainer: {
      padding: 40,
      alignItems: 'center',
  },
  emptyText: {
      marginTop: 12,
      color: '#94a3b8',
      fontSize: 16,
  }
});
