import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import StorageService from '../../services/StorageService'; 

import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import SkeletonLoader from '../../components/SkeletonLoader';
import { usePharmacyWorklist } from '../../hooks/api/usePharmacyWorklist';
import { theme } from '../../constants/theme';
import { PharmacyWorklistItem, StockItem } from '../../types';
import { useToast } from '../../components/ToastContext';
import ScannerModal from '../../components/ScannerModal';

export default function PharmacyDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'worklist' | 'stock'>('worklist');
  const [stockList, setStockList] = useState<StockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  // Worklist uses Infinite Query
  const { 
    data: worklistData, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: loadingWorklist, 
    refetch,
    isRefetching
  } = usePharmacyWorklist();

  // Flatten infinite query pages
  const worklist = worklistData?.pages.flat() || [];

  useEffect(() => {
    if (activeTab === 'stock') {
      loadStock();
    }
  }, [activeTab]);

  const handleScan = async (data: string) => {
    setScannerVisible(false);
    if (activeTab === 'worklist') {
      const found = worklist.find(item => 
        item.patient?.mrn === data || 
        item.patient?.nationalId === data || 
        item.id.toString() === data
      );
      if (found) {
        router.push(`/pharmacy/dispense/${found.id}`);
      } else {
        showToast(t('rounds.noPatients') || "No matching patient or prescription found", "warning");
      }
    } else {
      setSearchQuery(data);
      setLoadingStock(true);
      try {
        const stockData = await api.getDrugStock(data);
        setStockList((stockData || []) as StockItem[]);
        showToast("تم تحديث البحث برمز الباركود", "success");
      } catch (error) {
        showToast("فشل البحث عن صنف الدواء", "error");
      } finally {
        setLoadingStock(false);
      }
    }
  };

  const loadStock = async () => {
    setLoadingStock(true);
    try {
      const data = await api.getDrugStock(searchQuery);
      setStockList((data || []) as StockItem[]);
    } catch (error) {
      console.error("Failed to load stock data", error);
    } finally {
      setLoadingStock(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'worklist') {
      await refetch();
      setRefreshing(false);
    } else {
      loadStock();
    }
  };

  const handleLoadMore = () => {
    if (activeTab === 'worklist' && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleSearch = () => {
     if (activeTab === 'stock') {
         loadStock();
     }
  };

const WorklistCard = memo(({ item, onPress }: { item: PharmacyWorklistItem, onPress: () => void }) => (
    <TouchableOpacity 
        style={styles.card}
        onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.patientName}>{item.patient?.fullName || 'Unknown Patient'}</Text>
        <Text style={[styles.statusBadge, { backgroundColor: item.status === 'PENDING' ? theme.colors.warning : theme.colors.success }]}>
            {item.status}
        </Text>
      </View>
      <Text style={styles.detailText}>Dr. {item.doctor?.fullName || 'N/A'}</Text>
      <Text style={styles.detailText}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={styles.itemsCount}>{item.items?.length || 0} Items</Text>
    </TouchableOpacity>
));

const StockCard = memo(({ item }: { item: StockItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.drugName}>{item.name}</Text>
        <Text style={styles.stockLevel}>{item.stockOnHand || 0} {item.form || 'Units'}</Text>
      </View>
      <Text style={styles.detailText}>Generic: {item.genericName || 'N/A'}</Text>
      <Text style={styles.detailText}>Price: {item.unitPrice?.toFixed(2)}</Text>
    </View>
));

  const renderWorklistItem = useCallback(({ item }: { item: PharmacyWorklistItem }) => (
    <WorklistCard item={item} onPress={() => router.push(`/pharmacy/dispense/${item.id}`)} />
  ), [router]);

  const renderStockItem = useCallback(({ item }: { item: StockItem }) => (
    <StockCard item={item} />
  ), []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primaryDark} />
      {/* Header */}
      <LinearGradient
        colors={[theme.colors.primaryDark, theme.colors.primary]}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
           <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('pharmacy.title')}</Text>
        <TouchableOpacity onPress={() => setScannerVisible(true)} style={styles.scanButton}>
            <Ionicons name="scan" size={24} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

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
              <Ionicons name="search" size={20} color={theme.colors.textLight} />
              <TextInput 
                 style={[styles.searchInput, {textAlign: I18nManager.isRTL ? 'right' : 'left'}]}
                 placeholder={t('common.search') || 'Search'}
                 value={searchQuery}
                 onChangeText={setSearchQuery}
                 onSubmitEditing={handleSearch}
              />
          </View>
      )}

      {/* Content */}
      {(activeTab === 'worklist' ? loadingWorklist : loadingStock) && !refreshing && !isRefetching ? (
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
      ) : activeTab === 'worklist' ? (
          <FlatList
            data={worklist}
            renderItem={renderWorklistItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{marginTop: 10}} /> : null}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            ListEmptyComponent={
                <Text style={styles.emptyText}>{t('common.noData') || 'No items found.'}</Text>
            }
          />
      ) : (
          <FlatList
            data={stockList}
            renderItem={renderStockItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            ListEmptyComponent={
                <Text style={styles.emptyText}>{t('common.noData') || 'No items found.'}</Text>
            }
          />
      )}
      <ScannerModal 
        visible={scannerVisible} 
        onClose={() => setScannerVisible(false)} 
        onScan={handleScan}
        title={activeTab === 'worklist' ? "امسح ملف المريض أو الوصفة" : "امسح باركود الدواء"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
      paddingTop: 50,
      paddingBottom: 20,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      ...theme.shadows.medium,
  },
  headerTitle: { color: theme.colors.surface, fontSize: 20, fontWeight: 'bold' },
  backButton: { },
  scanButton: { },
  tabs: { flexDirection: 'row', backgroundColor: theme.colors.surface, elevation: 2 },
  tab: { flex: 1, padding: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: theme.colors.primary },
  tabText: { color: theme.colors.textLight, fontWeight: '600' },
  activeTabText: { color: theme.colors.primary },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, margin: 16, paddingHorizontal: 12, borderRadius: 8, elevation: 1 },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 16, color: theme.colors.text },
  list: { padding: 16 },
  card: { backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.small },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  patientName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  drugName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, color: theme.colors.surface, fontSize: 10, fontWeight: 'bold', overflow: 'hidden' },
  detailText: { color: theme.colors.textLight, marginBottom: 4 },
  itemsCount: { alignSelf: 'flex-start', backgroundColor: '#e0f2fe', color: theme.colors.primaryDark, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, marginTop: 8 },
  stockLevel: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  emptyText: { textAlign: 'center', marginTop: 32, color: theme.colors.textMuted },
});
