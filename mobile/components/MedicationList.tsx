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
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
            <Ionicons name="medkit" size={20} color="#0284c7" />
        </View>
        <View style={styles.headerText}>
           <Text style={styles.drugName}>{item.product?.name || item.drugItem?.name || "Unknown Drug"}</Text>
           <Text style={styles.genericName}>{item.product?.genericName || item.drugItem?.genericName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.detailsGrid}>
        <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Dose</Text>
            <Text style={styles.detailValue}>{item.dose}</Text>
        </View>
        <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Freq</Text>
            <Text style={styles.detailValue}>{item.frequency}</Text>
        </View>
        <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Route</Text>
            <Text style={styles.detailValue}>{item.route}</Text>
        </View>
      </View>
      
      {item.notes && <Text style={styles.notes}>📝 {item.notes}</Text>}
      
      <View style={styles.footer}>
        <View style={styles.doctorInfo}>
            <Ionicons name="person-circle-outline" size={16} color="#64748b" />
            <Text style={styles.doctorName}>Dr. {item.doctor?.fullName}</Text>
        </View>
        <TouchableOpacity 
          style={styles.administerBtn}
          onPress={() => setSelectedMed(item)}
        >
          <Text style={styles.btnText}>Administer</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderHistoryItem = ({ item }: { item: any }) => (
    <View style={styles.historyItem}>
      <View style={styles.timelineLeft}>
         <View style={[styles.timelineDot, item.status === 'GIVEN' ? {backgroundColor: '#22c55e'} : item.status === 'NOT_GIVEN' ? {backgroundColor: '#ef4444'} : {backgroundColor: '#f59e0b'}]} />
         <View style={styles.timelineLine} />
      </View>
      <View style={styles.historyContent}>
          <View style={styles.historyHeader}>
             <Text style={styles.timestamp}>{new Date(item.administeredAt).toLocaleString()}</Text>
             <View style={[styles.statusBadge, 
                item.status === 'GIVEN' ? styles.bgGreen : 
                item.status === 'NOT_GIVEN' ? styles.bgRed : styles.bgYellow
             ]}>
                <Text style={[styles.statusText,
                    item.status === 'GIVEN' ? styles.textGreen : 
                    item.status === 'NOT_GIVEN' ? styles.textRed : styles.textYellow
                ]}>{item.status.replace('_', ' ')}</Text>
             </View>
          </View>
          <Text style={styles.performer}>By: {item.performer?.fullName}</Text>
          {item.notes && <Text style={styles.historyNotes}>"{item.notes}"</Text>}
      </View>
    </View>
  );

  if (loading) return <ActivityIndicator style={{marginTop: 50}} size="large" color="#0284c7" />;

  return (
    <View style={styles.container}>
      {/* Sub-tabs with refined look */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabsBackground}>
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
      </View>

      <FlatList
        data={activeTab === 'active' ? getActiveItems() : data.administrations}
        renderItem={activeTab === 'active' ? renderActiveItem : renderHistoryItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284c7']} />}
        ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="ban-outline" size={40} color="#cbd5e1" />
                <Text style={styles.emptyText}>No records found</Text>
            </View>
        }
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
  
  // Tabs
  tabsContainer: { paddingHorizontal: 16, paddingVertical: 12 },
  tabsBackground: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  tabText: { fontWeight: '600', color: '#64748b', fontSize: 13 },
  activeTabText: { color: '#0f172a' },

  listContent: { paddingHorizontal: 16, paddingBottom: 20 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e0f2fe', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerText: { flex: 1 },
  drugName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  genericName: { fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 2 },
  
  divider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 12 },
  
  detailsGrid: { flexDirection: 'row', marginBottom: 12 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#334155' },

  notes: { fontSize: 13, color: '#475569', backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 12, overflow: 'hidden' },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  doctorInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doctorName: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  
  administerBtn: { backgroundColor: '#0284c7', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 12 },

  // History timeline
  historyItem: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { width: 24, alignItems: 'center', marginRight: 8 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#e2e8f0', marginTop: 4 },
  historyContent: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' },
  timestamp: { fontSize: 13, fontWeight: '600', color: '#334155' },
  
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  bgGreen: { backgroundColor: '#dcfce7' },
  bgRed: { backgroundColor: '#fee2e2' },
  bgYellow: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 10, fontWeight: '700' },
  textGreen: { color: '#15803d' },
  textRed: { color: '#b91c1c' },
  textYellow: { color: '#b45309' },

  performer: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  historyNotes: { fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 4 },

  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { marginTop: 8, color: '#94a3b8', fontSize: 14 }
});
