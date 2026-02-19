import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import StorageService from '../../services/StorageService'; // Explicit import to use isOnline directly if needed

import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';

export default function PharmacyDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'worklist' | 'stock'>('worklist');
  const [loading, setLoading] = useState(false);
  const [worklist, setWorklist] = useState<any[]>([]);
  const [stockList, setStockList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'worklist') {
        const data = await api.getPharmacyWorklist();
        setWorklist(data || []);
      } else {
        const data = await api.getDrugStock(searchQuery);
        setStockList(data || []);
      }
    } catch (error) {
      console.error("Failed to load pharmacy data", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSearch = () => {
     if (activeTab === 'stock') {
         loadData();
     }
  };

  const renderWorklistItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
        style={styles.card}
        onPress={() => router.push(`/pharmacy/dispense/${item.id}`)}
    >
      <View style={styles.cardHeader}>
        {/* Fix: patient is at root, not inside encounter */}
        <Text style={styles.patientName}>{item.patient?.fullName || 'Unknown Patient'}</Text>
        <Text style={[styles.statusBadge, { backgroundColor: item.status === 'PENDING' ? '#f59e0b' : '#10b981' }]}>
            {item.status}
        </Text>
      </View>
      <Text style={styles.detailText}>Dr. {item.doctor?.fullName}</Text>
      <Text style={styles.detailText}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={styles.itemsCount}>{item.items?.length || 0} Items</Text>
    </TouchableOpacity>
  );

  const renderStockItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {/* Fix: Stock item IS the product, not nested in drugItem */}
        <Text style={styles.drugName}>{item.name}</Text>
        <Text style={styles.stockLevel}>{item.stockOnHand || 0} {item.form || 'Units'}</Text>
      </View>
      <Text style={styles.detailText}>Generic: {item.genericName || 'N/A'}</Text>
      <Text style={styles.detailText}>Price: {item.unitPrice?.toFixed(2)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
           <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('pharmacy.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/pharmacy/scan')} style={styles.scanButton}>
            <Ionicons name="scan" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity 
            style={[styles.tab, activeTab === 'worklist' && styles.activeTab]}
            onPress={() => setActiveTab('worklist')}
        >
            <Text style={[styles.tabText, activeTab === 'worklist' && styles.activeTabText]}>{t('pharmacy.worklist')}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
            style={[styles.tab, activeTab === 'stock' && styles.activeTab]}
            onPress={() => setActiveTab('stock')}
        >
            <Text style={[styles.tabText, activeTab === 'stock' && styles.activeTabText]}>{t('pharmacy.stock')}</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar (Stock only) */}
      {activeTab === 'stock' && (
          <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#64748b" />
              <TextInput 
                 style={[styles.searchInput, {textAlign: I18nManager.isRTL ? 'right' : 'left'}]}
                 placeholder={t('common.search')}
                 value={searchQuery}
                 onChangeText={setSearchQuery}
                 onSubmitEditing={handleSearch}
              />
          </View>
      )}

      {/* Content */}
      {loading && !refreshing ? (
          <ActivityIndicator size="large" color="#0284c7" style={{ marginTop: 20 }} />
      ) : (
          <FlatList
            data={activeTab === 'worklist' ? worklist : stockList}
            renderItem={activeTab === 'worklist' ? renderWorklistItem : renderStockItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
                <Text style={styles.emptyText}>{t('common.noData') || 'No items found.'}</Text>
            }
          />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
      backgroundColor: '#0284c7',
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  backButton: { },
  scanButton: { },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  tab: { flex: 1, padding: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#0284c7' },
  tabText: { color: '#64748b', fontWeight: '600' },
  activeTabText: { color: '#0284c7' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, paddingHorizontal: 12, borderRadius: 8, elevation: 1 },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 16 },
  list: { padding: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  patientName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  drugName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, color: '#fff', fontSize: 10, fontWeight: 'bold', overflow: 'hidden' },
  detailText: { color: '#64748b', marginBottom: 4 },
  itemsCount: { alignSelf: 'flex-start', backgroundColor: '#e0f2fe', color: '#0369a1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, marginTop: 8 },
  stockLevel: { fontSize: 18, fontWeight: 'bold', color: '#0284c7' },
  emptyText: { textAlign: 'center', marginTop: 32, color: '#94a3b8' },
});
