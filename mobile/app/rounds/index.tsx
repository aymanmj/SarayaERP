import React, { useEffect, useState, useCallback, memo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import api, { getUserInfo } from "../../services/api";
import { Ionicons } from "@expo/vector-icons";
import SkeletonLoader from "../../components/SkeletonLoader";
import { useToast } from "../../components/ToastContext";
import { useGetRounds } from "../../hooks/api/useRounds";
import { theme } from "../../constants/theme";

interface Encounter {
  id: number;
  patientId: number;
  status: string;
  patient: {
    fullName: string;
    mrn: string;
    nationalId?: string;
    dateOfBirth?: string;
    gender?: string;
  };
  admission?: {
    primaryDiagnosis?: string;
  };
  bedAssignments: {
    bed: { bedNumber: string; ward: { name: string } };
  }[];
  vitalSigns?: {
    bpSystolic: number;
    bpDiastolic: number;
    heartRate: number;
    temperature: number;
    createdAt: string;
  }[];
}

import ScannerModal from "../../components/ScannerModal";

import StorageService from "../../services/StorageService";

import { useTranslation } from "react-i18next";

export default function RoundsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showToast } = useToast();
  
  const { data, isLoading: loading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useGetRounds(10);
  const encounters = data?.pages.flat() || [];
  const hasMore = hasNextPage;

  const [scannerVisible, setScannerVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    checkConnectivity();
  }, []);

  const checkConnectivity = async () => {
     const online = await StorageService.isOnline();
     setIsOffline(!online);
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage && !isOffline) {
      fetchNextPage();
    }
  };

  const handleScan = (data: string) => {
    setScannerVisible(false);
    // Assuming data is MRN or similar identifier
    // In a real app, you might want to call an API to search by MRN if not in the list
    const foundEncounter = encounters.find(e => e.patient.mrn === data || e.patient.nationalId === data);
    
    if (foundEncounter) {
       router.push({
        pathname: "/rounds/[id]",
        params: {
          id: foundEncounter.id,
          name: foundEncounter.patient.fullName,
          mrn: foundEncounter.patient.mrn,
          gender: foundEncounter.patient.gender,
          dob: foundEncounter.patient.dateOfBirth,
          diagnosis: foundEncounter.admission?.primaryDiagnosis || "No Diagnosis",
          vitals: foundEncounter.vitalSigns?.[0] ? JSON.stringify(foundEncounter.vitalSigns?.[0]) : undefined,
        },
      });
    } else {
      showToast(`No active encounter found for ID: ${data}`, "warning");
    }
  };

const EncounterCard = memo(({ item, onPress }: { item: Encounter, onPress: () => void }) => {
    const currentBed = item.bedAssignments?.[0]?.bed;
    const location = currentBed
      ? `${currentBed.ward.name} - ${currentBed.bedNumber}`
      : "No Bed Assigned";

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
             <Text style={styles.avatarText}>{item.patient.fullName.charAt(0)}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.patientName} numberOfLines={1}>{item.patient.fullName}</Text>
            <Text style={styles.mrn}>MRN: {item.patient.mrn}</Text>
          </View>
          <View style={[styles.statusBadge, item.status === 'OPEN' ? styles.statusOpen : styles.statusClosed]}>
             <Text style={[styles.statusText, item.status === 'OPEN' ? styles.statusTextOpen : styles.statusTextClosed]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsContainer}>
           <View style={styles.detailRow}>
              <Ionicons name="bed-outline" size={16} color="#64748b" />
              <Text style={styles.detailText}>{location}</Text>
           </View>
           <View style={styles.detailRow}>
              <Ionicons name="medkit-outline" size={16} color="#64748b" />
              <Text style={styles.detailText} numberOfLines={1}>
                {item.admission?.primaryDiagnosis || "No Diagnosis Recorded"}
              </Text>
           </View>
        </View>

        <View style={styles.cardFooter}>
           <Text style={styles.actionText}>Tap to start round</Text>
           <Ionicons name="chevron-forward" size={16} color="#0284c7" />
        </View>
      </TouchableOpacity>
    );
});

  const renderItem = useCallback(({ item }: { item: Encounter }) => {
    const latestVitals = item.vitalSigns?.[0];
    return (
        <EncounterCard 
            item={item} 
            onPress={() =>
              router.push({
                pathname: "/rounds/[id]",
                params: {
                  id: item.id,
                  name: item.patient.fullName,
                  mrn: item.patient.mrn,
                  gender: item.patient.gender,
                  dob: item.patient.dateOfBirth,
                  diagnosis: item.admission?.primaryDiagnosis || "No Diagnosis",
                  vitals: latestVitals ? JSON.stringify(latestVitals) : undefined,
                },
              })
            } 
        />
    )
  }, [router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
            <View style={styles.headerTopRow}>
                 <View>
                     <Text style={styles.headerTitle}>{t('rounds.title')}</Text>
                     <Text style={styles.headerSubtitle}>{t('rounds.subtitle')}</Text>
                 </View>
            </View>
        </View>
        <View style={styles.listContent}>
            {[1, 2, 3].map((key) => (
                <View key={key} style={styles.card}>
                    <View style={styles.cardHeader}>
                        <SkeletonLoader width={48} height={48} borderRadius={24} style={{ marginRight: 12 }} />
                        <View style={{ flex: 1 }}>
                            <SkeletonLoader width="60%" height={20} style={{ marginBottom: 6 }} />
                            <SkeletonLoader width="40%" height={14} />
                        </View>
                        <SkeletonLoader width={60} height={24} borderRadius={12} />
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.detailsContainer}>
                        <SkeletonLoader width="80%" height={16} style={{ marginBottom: 8 }} />
                        <SkeletonLoader width="90%" height={16} />
                    </View>
                </View>
            ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {isOffline && (
        <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>You are currently offline. Viewing cached data.</Text>
        </View>
      )}
      <View style={styles.header}>
         <View style={styles.headerTopRow}>
             <View>
                 <Text style={styles.headerTitle}>{t('rounds.title')}</Text>
                 <Text style={styles.headerSubtitle}>{t('rounds.subtitle')}</Text>
             </View>
             <View style={{flexDirection: 'row', gap: 12}}>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/profile")}>
                     <Ionicons name="person-circle-outline" size={32} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.scanButton, { backgroundColor: '#10b981' }]} 
                    onPress={() => router.push('/pharmacy')}
                >
                     <Ionicons name="medkit" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanButton} onPress={() => setScannerVisible(true)}>
                     <Ionicons name="qr-code-outline" size={24} color="#0284c7" />
                </TouchableOpacity>
             </View>
         </View>
      </View>
      <FlatList
        data={encounters}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={loading && encounters.length === 0}
        onRefresh={refetch}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isFetchingNextPage && !isOffline ? <ActivityIndicator style={{marginTop: 10}} /> : null}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              {t('rounds.noPatients')}
            </Text>
          </View>
        }
      />
      
      <ScannerModal 
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleScan}
        title="Scan Patient Wristband"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.primary,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 10,
    ...theme.shadows.medium,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.surface,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.primaryLight,
    marginTop: 4,
    fontWeight: "500",
  },
  scanButton: {
    backgroundColor: theme.colors.surface,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.small,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.sizes.md,
    padding: theme.sizes.md,
    marginBottom: theme.sizes.md,
    ...theme.shadows.medium,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.colors.primaryDark,
  },
  headerText: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 2,
  },
  mrn: {
    fontSize: 12,
    color: theme.colors.textLight,
    fontFamily: "monospace", 
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusOpen: {
    backgroundColor: "#dcfce7",
  },
  statusClosed: {
    backgroundColor: theme.colors.border,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusTextOpen: {
    color: theme.colors.success,
  },
  statusTextClosed: {
    color: theme.colors.textLight,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: 12,
  },
  detailsContainer: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.textLight,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  actionText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 16,
    color: theme.colors.textMuted,
    fontSize: 16,
  },
  offlineBanner: {
    backgroundColor: theme.colors.error,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: theme.colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
});
