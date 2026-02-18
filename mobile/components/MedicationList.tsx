import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import AdministerMedModal from './AdministerMedModal';

interface MedicationListProps {
  encounterId: number;
}

export default function MedicationList({ encounterId }: MedicationListProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [data, setData] = useState<any>({ prescriptions: [], administrations: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMed, setSelectedMed] = useState<any>(null);

  const fetchMAR = async () => {
    try {
      const res = await api.getPatientMAR(encounterId);
      setData(res);
    } catch (error) {
      console.error("Failed to fetch MAR", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMAR();
  }, [encounterId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMAR();
  };

  // Helper to flatten active prescription items
  const getActiveItems = () => {
    if (!data.prescriptions) return [];
    return data.prescriptions.flatMap((p: any) => 
      p.items.map((item: any) => ({ ...item, prescriptionId: p.id, doctor: p.doctor }))
    );
  };

  const renderActiveItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => setSelectedMed(item)}
    >
      <View style={styles.cardHeader}>
        <View style={{flex: 1}}>
           <Text style={styles.drugName}>{item.product?.name || item.drugItem?.name || "Unknown Drug"}</Text>
           <Text style={styles.genericName}>{item.product?.genericName || item.drugItem?.genericName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </View>
      
      <View style={styles.detailsRow}>
        <Text style={styles.detailText}>💊 {item.dose}</Text>
        <Text style={styles.detailText}>🔄 {item.frequency}</Text>
        <Text style={styles.detailText}>🛣️ {item.route}</Text>
      </View>
      
      {item.notes && <Text style={styles.notes}>📝 {item.notes}</Text>}
      
      <View style={styles.footer}>
        <Text style={styles.doctor}>Dr. {item.doctor?.fullName}</Text>
        <TouchableOpacity 
          style={styles.administerBtn}
          onPress={() => setSelectedMed(item)}
        >
          <Text style={styles.btnText}>Give</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderHistoryItem = ({ item }: { item: any }) => (
    <View style={[styles.card, styles.historyCard]}>
      <View style={styles.historyHeader}>
         <Text style={styles.timestamp}>{new Date(item.administeredAt).toLocaleString()}</Text>
         <Text style={[styles.statusBadge, 
            item.status === 'GIVEN' ? styles.statusGiven : 
            item.status === 'NOT_GIVEN' ? styles.statusNotGiven : styles.statusHeld
         ]}>
            {item.status}
         </Text>
      </View>
      <Text style={styles.performer}>By: {item.performer?.fullName}</Text>
      {item.notes && <Text style={styles.historyNotes}>Note: {item.notes}</Text>}
    </View>
  );

  if (loading) return <ActivityIndicator style={{marginTop: 50}} size="large" color="#0284c7" />;

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'active' && styles.activeTab]} 
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>Active Meds</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.activeTab]} 
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>History</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === 'active' ? getActiveItems() : data.administrations}
        renderItem={activeTab === 'active' ? renderActiveItem : renderHistoryItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No records found</Text>}
      />

      <AdministerMedModal
        visible={!!selectedMed}
        medication={selectedMed}
        encounterId={encounterId}
        onClose={() => setSelectedMed(null)}
        onSuccess={onRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 20, marginHorizontal: 5 },
  activeTab: { backgroundColor: '#e0f2fe' },
  tabText: { fontWeight: '600', color: '#64748b' },
  activeTabText: { color: '#0284c7' },
  listContent: { padding: 15 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  drugName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  genericName: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  detailsRow: { flexDirection: 'row', gap: 15, marginBottom: 10 },
  detailText: { fontSize: 13, color: '#444' },
  notes: { fontSize: 13, color: '#666', marginBottom: 10, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  doctor: { fontSize: 12, color: '#888' },
  administerBtn: { backgroundColor: '#0284c7', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  
  // History Styles
  historyCard: { borderLeftWidth: 4, borderLeftColor: '#cbd5e1' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  timestamp: { fontWeight: 'bold', color: '#333' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: 'bold', overflow: 'hidden' },
  statusGiven: { backgroundColor: '#dcfce7', color: '#166534' },
  statusNotGiven: { backgroundColor: '#fee2e2', color: '#991b1b' },
  statusHeld: { backgroundColor: '#fef3c7', color: '#92400e' },
  performer: { fontSize: 12, color: '#666' },
  historyNotes: { fontSize: 12, color: '#888', marginTop: 5, fontStyle: 'italic' }
});
