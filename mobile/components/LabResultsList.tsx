
import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import api from '../services/api';

type LabOrder = {
  id: number;
  resultStatus: string;
  resultValue: string | null;
  resultUnit: string | null;
  resultDate: string | null;
  test: {
    name: string;
    code: string;
  };
  order: {
      status: string;
      createdAt: string;
  }
};

interface LabResultsListProps {
  encounterId: number;
  refreshTrigger?: number; // Prop to trigger refresh
}

export default function LabResultsList({ encounterId, refreshTrigger }: LabResultsListProps) {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!encounterId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLabOrders(encounterId);
      // Backend returns array directly based on controller
      setOrders(Array.isArray(data) ? data : []); 
    } catch (err) {
      setError('Failed to load lab results');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [encounterId, refreshTrigger]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#10b981'; // emerald-500
      case 'PENDING': return '#f59e0b'; // amber-500
      case 'IN_PROGRESS': return '#3b82f6'; // blue-500
      case 'CANCELLED': return '#ef4444'; // red-500
      default: return '#64748b'; // slate-500
    }
  };

  const getStatusLabel = (status: string) => {
      switch (status) {
        case 'COMPLETED': return 'مكتمل';
        case 'PENDING': return 'قيد الانتظار';
        case 'IN_PROGRESS': return 'جاري العمل';
        case 'CANCELLED': return 'ملغي';
        default: return status;
      }
  };

const LabResultItem = memo(({ item }: { item: LabOrder }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.testName}>{item.test.name}</Text>
        <View style={[styles.badge, { backgroundColor: getStatusColor(item.resultStatus) + '20' }]}>
            <Text style={[styles.badgeText, { color: getStatusColor(item.resultStatus) }]}>
                {getStatusLabel(item.resultStatus)}
            </Text>
        </View>
      </View>
      
      {item.resultStatus === 'COMPLETED' && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultLabel}>النتيجة:</Text>
          <Text style={styles.resultValue}>
            {item.resultValue || 'N/A'} {item.resultUnit || ''}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.date}>
             {new Date(item.order.createdAt).toLocaleDateString('ar-SA')} - {new Date(item.order.createdAt).toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'})}
        </Text>
      </View>
    </View>
));

  const renderItem = useCallback(({ item }: { item: LabOrder }) => (
    <LabResultItem item={item} />
  ), []);

  if (loading && orders.length === 0) {
    return <ActivityIndicator size="small" color="#0284c7" style={{ marginTop: 20 }} />;
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  if (orders.length === 0) {
    return (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد تحاليل مسجلة لهذا المريض</Text>
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
    paddingHorizontal: 2, // Add some horizontal padding if needed
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
    alignItems: 'center',
    marginBottom: 12,
  },
  testName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
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
  resultContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  resultLabel: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 8,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  date: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'left',
  },
  error: {
      color: '#ef4444',
      textAlign: 'center',
      marginTop: 20,
  },
  emptyContainer: {
      padding: 20,
      alignItems: 'center',
  },
  emptyText: {
      color: '#94a3b8',
      fontStyle: 'italic',
  }
});
