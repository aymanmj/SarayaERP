import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import StorageService from '../../services/StorageService'; // Explicit import to use isOnline directly if needed

import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import SkeletonLoader from '../../components/SkeletonLoader';

export default function PharmacyDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'worklist' | 'stock'>('worklist');
  const [loading, setLoading] = useState(false);
  const [worklist, setWorklist] = useState<any[]>([]);
  const [stockList, setStockList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setPage(1);
    loadData(1);
  }, [activeTab]);

  const loadData = async (pageNum = 1) => {
    if (pageNum === 1) setLoading(true);
    try {
      if (activeTab === 'worklist') {
        const limit = 10;
        const data = await api.getPharmacyWorklist(pageNum, limit);
        if (pageNum === 1) {
          setWorklist(data || []);
        } else {
          setWorklist(prev => [...prev, ...(data || [])]);
        }
        if ((data || []).length < limit) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      } else {
        const data = await api.getDrugStock(searchQuery);
        setStockList(data || []);
      }
    } catch (error) {
      console.error("Failed to load pharmacy data", error);
    } finally {
      if (pageNum === 1) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadData(1);
  };

  const handleLoadMore = () => {
    if (activeTab === 'worklist' && !loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadData(nextPage);
    }
  };

  const handleSearch = () => {
     if (activeTab === 'stock') {
         loadData();
     }
  };

const WorklistCard = memo(({ item, onPress }: { item: any, onPress: () => void }) => (
    <TouchableOpacity 
        style={styles.card}
        onPress={onPress}
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
));

const StockCard = memo(({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {/* Fix: Stock item IS the product, not nested in drugItem */}
        <Text style={styles.drugName}>{item.name}</Text>
        <Text style={styles.stockLevel}>{item.stockOnHand || 0} {item.form || 'Units'}</Text>
      </View>
      <Text style={styles.detailText}>Generic: {item.genericName || 'N/A'}</Text>
      <Text style={styles.detailText}>Price: {item.unitPrice?.toFixed(2)}</Text>
    </View>
));

  const renderWorklistItem = useCallback(({ item }: { item: any }) => (
    <WorklistCard item={item} onPress={() => router.push(`/pharmacy/dispense/${item.id}`)} />
  ), [router]);

  const renderStockItem = useCallback(({ item }: { item: any }) => (
    <StockCard item={item} />
  ), []);

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
          <View style={styles.list}>
              {[1, 2, 3].map((key) => (
                  <View key={key} style={styles.card}>
                      <View style={styles.cardHeader}>
                          <SkeletonLoader width="60%" height={20} />
                          <SkeletonLoader width={60} height={20} borderRadius={10} />
                      </View>
                      <SkeletonLoader width="40%" height={16} style={{ marginBottom: 4 }} />
                      <SkeletonLoader width="30%" height={16} style={{ marginBottom: 4 }} />
                      <SkeletonLoader width="20%" height={16} style={{ marginTop: 8 }} />
                  </View>
              ))}
          </View>
      ) : (
          <FlatList
            data={activeTab === 'worklist' ? worklist : stockList}
            renderItem={activeTab === 'worklist' ? renderWorklistItem : renderStockItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={activeTab === 'worklist' && hasMore && !loading ? <ActivityIndicator style={{marginTop: 10}} /> : null}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
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
