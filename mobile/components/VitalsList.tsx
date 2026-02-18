import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
// @ts-ignore - Temporary fix for resolution issue if persistent, but likely just a touch needed
import AddVitalModal from './AddVitalModal';

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

const VitalsList: React.FC<VitalsListProps> = ({ encounterId }) => {
  const [vitals, setVitals] = useState<VitalSign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchVitals = async () => {
    try {
      const data = await api.getVitals(encounterId);
      setVitals(data);
    } catch (error) {
      console.error('Failed to fetch vitals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVitals();
  }, [encounterId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVitals();
  };

  const renderItem = ({ item }: { item: VitalSign }) => (
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
  );

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
        onSuccess={fetchVitals}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  addButton: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    elevation: 2,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  date: {
    color: '#64748b',
    fontSize: 12,
  },
  author: {
    fontWeight: 'bold',
    color: '#0f172a',
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    marginLeft: '1%',
    marginRight: '1%',
    alignItems: 'center',
  },
  label: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 4,
  },
  value: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noteContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  noteLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'right',
  },
  noteText: {
    color: '#334155',
    fontSize: 14,
    textAlign: 'right',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#94a3b8',
    fontSize: 16,
  },
});

export default VitalsList;
