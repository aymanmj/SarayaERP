
import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import api from '../services/api';
import { theme } from '../constants/theme';
import { useGetLabOrders } from '../hooks/api/useLabResults';

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
  const { data: orders = [], isLoading: loading, error, refetch, isFetching } = useGetLabOrders(encounterId);
  const refreshing = isFetching && !loading;

  const fetchOrders = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchOrders();
    }
  }, [refreshTrigger, fetchOrders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return theme.colors.success;
      case 'PENDING': return theme.colors.warning;
      case 'IN_PROGRESS': return theme.colors.info;
      case 'CANCELLED': return theme.colors.error;
      default: return theme.colors.textLight;
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
    return <Text style={styles.error}>{error.message}</Text>;
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
      refreshing={refreshing}
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.sizes.md,
    padding: theme.sizes.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
    ...theme.shadows.small,
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
    color: theme.colors.text,
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
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultLabel: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginRight: 8,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.darkBackground,
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 8,
  },
  date: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'left',
  },
  error: {
      color: theme.colors.error,
      textAlign: 'center',
      marginTop: 20,
  },
  emptyContainer: {
      padding: 20,
      alignItems: 'center',
  },
  emptyText: {
      color: theme.colors.textMuted,
      fontStyle: 'italic',
  }
});
