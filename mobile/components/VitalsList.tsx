import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGetVitals } from '../hooks/api/useVitals';
import AddVitalModal from './AddVitalModal';
import { theme } from '../constants/theme';

interface VitalSign {
  id: number;
  temperature?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  respRate?: number;
  o2Sat?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  note?: string;
  createdAt: string;
  createdBy: {
    id: number;
    fullName: string;
  };
}

interface VitalsListProps {
  encounterId: number;
}

const VitalItemCard = memo(({ item }: { item: VitalSign }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>
          {new Date(item.createdAt).toLocaleString('ar-LY')}
        </Text>
        <Text style={styles.author}>{item.createdBy?.fullName}</Text>
      </View>
      
      <View style={styles.grid}>
        {item.bpSystolic && item.bpDiastolic && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>ضغط الدم</Text>
            <Text style={styles.value}>{item.bpSystolic}/{item.bpDiastolic}</Text>
          </View>
        )}
        {item.pulse && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>النبض</Text>
            <Text style={styles.value}>{item.pulse} bpm</Text>
          </View>
        )}
        {item.temperature && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>الحرارة</Text>
            <Text style={styles.value}>{item.temperature} °C</Text>
          </View>
        )}
        {item.o2Sat && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>O2 Sat</Text>
            <Text style={styles.value}>{item.o2Sat} %</Text>
          </View>
        )}
        {item.respRate && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>التنفس</Text>
            <Text style={styles.value}>{item.respRate} /min</Text>
          </View>
        )}
        {item.weight && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>الوزن</Text>
            <Text style={styles.value}>{item.weight} kg</Text>
          </View>
        )}
      </View>

      {item.note && (
        <View style={styles.noteContainer}>
          <Text style={styles.noteLabel}>ملاحظات:</Text>
          <Text style={styles.noteText}>{item.note}</Text>
        </View>
      )}
    </View>
));

const VitalsList: React.FC<VitalsListProps> = ({ encounterId }) => {
  const [modalVisible, setModalVisible] = useState(false);
  
  const { data: vitals = [], isLoading: loading, refetch, isFetching } = useGetVitals(encounterId);
  const refreshing = isFetching && !loading;

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const renderItem = useCallback(({ item }: { item: VitalSign }) => (
    <VitalItemCard item={item} />
  ), []);

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.addButton} 
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.addButtonText}>تسجيل علامات حيوية</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#0284c7" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={vitals}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>لا توجد علامات حيوية مسجلة</Text>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      <AddVitalModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        encounterId={encounterId}
        onSuccess={() => refetch()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    ...theme.shadows.small,
  },
  addButtonText: {
    color: theme.colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    ...theme.shadows.small,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: 8,
  },
  date: {
    color: theme.colors.textLight,
    fontSize: 12,
  },
  author: {
    fontWeight: 'bold',
    color: theme.colors.text,
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  gridItem: {
    width: '48%',
    backgroundColor: theme.colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    marginLeft: '1%',
    marginRight: '1%',
    alignItems: 'center',
  },
  label: {
    color: theme.colors.textLight,
    fontSize: 12,
    marginBottom: 4,
  },
  value: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  noteContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  noteLabel: {
    fontSize: 12,
    color: theme.colors.textLight,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'right',
  },
  noteText: {
    color: theme.colors.text,
    fontSize: 14,
    textAlign: 'right',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: theme.colors.textMuted,
    fontSize: 16,
  },
});

export default VitalsList;
