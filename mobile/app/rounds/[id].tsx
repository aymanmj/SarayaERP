import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, FlatList, StatusBar } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import api from '../../services/api';
import { useToast } from '../../components/ToastContext';
import LabResultsList from "../../components/LabResultsList";
import VitalsList from "../../components/VitalsList";
import MedicationList from "../../components/MedicationList";
import RadiologyList from "../../components/RadiologyList";
import { Ionicons } from '@expo/vector-icons';
import { useGetClinicalNotes } from '../../hooks/api/useClinicalNotes';
import { useQueryClient } from '@tanstack/react-query';
import { theme } from '../../constants/theme';
import StorageService from "../../services/StorageService";
import { ClinicalNote, VitalSign } from '../../types';

export default function PatientDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    diagnosis?: string;
    gender?: string;
    dob?: string;
    vitals?: string;
  }>();
  const { showToast } = useToast();
  const { id, name, diagnosis, gender, dob, vitals } = params;

  const [modalVisible, setModalVisible] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'notes' | 'vitals' | 'meds' | 'labs' | 'radiology'>('notes');
  const [isOffline, setIsOffline] = useState(false);

  const queryClient = useQueryClient();
  const { data: notes = [], isLoading: loading, refetch: fetchNotes } = useGetClinicalNotes(Number(id));

  useEffect(() => {
    checkConnectivity();
  }, [id]);

  const checkConnectivity = async () => {
    const online = await StorageService.isOnline();
    setIsOffline(!online);
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      showToast("Note content cannot be empty", "warning");
      return;
    }
    const numericId = Number(id);
    if (!id || isNaN(numericId)) {
      showToast("Invalid Encounter ID", "error");
      return;
    }
    
    const tempNoteId = 'temp-' + Date.now();
    setSubmitting(true);
    try {
        // Optimistic Update
        const tempNote: ClinicalNote = {
            id: tempNoteId,
            content: newNote,
            createdAt: new Date().toISOString(),
            type: 'DOCTOR_ROUND',
            createdBy: { fullName: "You (Pending...)" },
        };
        
        queryClient.setQueryData<ClinicalNote[]>(['clinicalNotes', numericId], (oldData) => {
            if (!Array.isArray(oldData)) return [tempNote];
            return [tempNote, ...oldData];
        });

        const result = await api.createClinicalNote(numericId, newNote, 'DOCTOR_ROUND');
        
        setModalVisible(false);
        setNewNote('');
        
        if (result?.offline) {
             showToast("Note saved locally and will sync when online.", "info");
        } else {
             showToast("Note added successfully", "success");
        }
        
        // Background refresh to confirm server state
        setTimeout(() => {
             queryClient.invalidateQueries({ queryKey: ['clinicalNotes', numericId] });
        }, 500);

    } catch (error) {
        console.error("Failed to save note:", error);
        showToast("Failed to save note", "error");
        // Revert optimistic update if it fails
        queryClient.setQueryData<ClinicalNote[]>(['clinicalNotes', numericId], (oldData) => {
            return oldData?.filter((note) => note.id !== tempNoteId) || [];
        });
    } finally {
        setSubmitting(false);
    }
  };

  const parseVitals = (vitalsStr: string | undefined): Partial<VitalSign> | null => {
    if (!vitalsStr) return null;
    try {
      return JSON.parse(vitalsStr);
    } catch (e) {
      return null;
    }
  };

  const parsedVitals = parseVitals(vitals);
  
  const pulse = parsedVitals?.pulse ?? (parsedVitals as any)?.heartRate;
  const patientDetails = {
      bp: parsedVitals?.bpSystolic && parsedVitals?.bpDiastolic ? `${parsedVitals.bpSystolic}/${parsedVitals.bpDiastolic}` : '--/--',
      hr: pulse !== undefined ? `${pulse}` : '--',
      temp: parsedVitals?.temperature ? `${parsedVitals.temperature}°C` : '--',
      o2Sat: parsedVitals?.o2Sat !== undefined ? `${parsedVitals.o2Sat}%` : '--'
  };

  const checkCriticalVitals = (v: Partial<VitalSign> | null) => {
    if (!v) return null;
    const alerts: string[] = [];
    
    const p = v.pulse ?? (v as any).heartRate;
    const o2 = v.o2Sat;
    const t = v.temperature;
    const sys = v.bpSystolic;
    const dia = v.bpDiastolic;

    if (o2 !== undefined && o2 < 92) {
      alerts.push(`Critical O2 Saturation: ${o2}% (< 92%)`);
    }
    if (p !== undefined) {
      if (p > 120) {
        alerts.push(`Critical Heart Rate: ${p} bpm (> 120 bpm)`);
      } else if (p < 50) {
        alerts.push(`Critical Heart Rate: ${p} bpm (< 50 bpm)`);
      }
    }
    if (t !== undefined) {
      if (t > 39) {
        alerts.push(`Critical Temperature: ${t}°C (> 39°C)`);
      } else if (t < 35.5) {
        alerts.push(`Critical Temperature: ${t}°C (< 35.5°C)`);
      }
    }
    if (sys !== undefined && dia !== undefined) {
      if (sys > 160 || dia > 100) {
        alerts.push(`Critical Blood Pressure: ${sys}/${dia} mmHg (> 160/100)`);
      } else if (sys < 90 || dia < 50) {
        alerts.push(`Critical Blood Pressure: ${sys}/${dia} mmHg (< 90/50)`);
      }
    }
    return alerts.length > 0 ? alerts : null;
  };

  const criticalAlerts = checkCriticalVitals(parsedVitals);

  const getHrColor = (pVal: number | undefined) => {
    if (pVal === undefined) return theme.colors.text;
    if (pVal > 120 || pVal < 50) return theme.colors.error;
    if (pVal > 100 || pVal < 60) return theme.colors.warning;
    return theme.colors.success;
  };
  
  const getTempColor = (tVal: number | undefined) => {
    if (tVal === undefined) return theme.colors.text;
    if (tVal > 39 || tVal < 35.5) return theme.colors.error;
    if (tVal > 37.8 || tVal < 36.2) return theme.colors.warning;
    return theme.colors.success;
  };
  
  const getO2Color = (oVal: number | undefined) => {
    if (oVal === undefined) return theme.colors.text;
    if (oVal < 92) return theme.colors.error;
    if (oVal < 95) return theme.colors.warning;
    return theme.colors.success;
  };

  const getBpColor = (sys: number | undefined, dia: number | undefined) => {
    if (sys === undefined || dia === undefined) return theme.colors.text;
    if (sys > 160 || dia > 100 || sys < 90 || dia < 50) return theme.colors.error;
    if (sys > 140 || dia > 90 || sys < 95 || dia < 55) return theme.colors.warning;
    return theme.colors.success;
  };

  const renderNoteItem = ({ item, index }: { item: ClinicalNote, index: number }) => (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={styles.timelineDot} />
        {index < notes.length - 1 && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <View style={styles.noteHeader}>
           <Text style={styles.noteAuthor}>{item.createdBy?.fullName || 'Unknown'}</Text>
           <Text style={styles.noteTime}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        <Text style={styles.noteTypeBadge}>{item.type}</Text>
        <Text style={styles.noteText}>{item.content}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0284c7" />
      
      {/* Offline Banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>Offline Mode</Text>
        </View>
      )}

      {/* Critical Alert Banner */}
      {criticalAlerts && criticalAlerts.length > 0 && (
        <View style={styles.criticalBanner}>
          <Ionicons name="warning" size={20} color={theme.colors.surface} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            {criticalAlerts.map((alertText, index) => (
              <Text key={index} style={styles.criticalText}>
                {alertText}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Dynamic Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
           <Text style={styles.patientName}>{name || "Unknown Patient"}</Text>
           <View style={styles.badge}>
             <Text style={styles.badgeText}>{gender === 'MALE' || gender === 'Male' ? 'Male' : 'Female'}</Text>
           </View>
        </View>
        <View style={styles.headerDetails}>
           <Text style={styles.headerDetailText}>MRN: {id ? `MRN-${id}` : 'N/A'}</Text>
           <Text style={styles.headerSeparator}>•</Text>
           <Text style={styles.headerDetailText}>
             {dob ? new Date().getFullYear() - new Date(dob as string).getFullYear() : 'N/A'} Years
           </Text>
        </View>
      </View>

      {/* Modern Tabs */}
      <View style={styles.tabBar}>
        {['notes', 'vitals', 'meds', 'labs', 'radiology'].map((tab) => (
          <TouchableOpacity 
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.activeTabItem]} 
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.activeTabLabel]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {activeTab === tab && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {activeTab === 'notes' ? (
          <>
            {/* Vitals Summary Card */}
            <View style={styles.summaryCard}>
               <Text style={styles.cardTitle}>Latest Vitals</Text>
               <View style={styles.vitalsGrid}>
                   <View style={styles.vitalItem}>
                       <Ionicons name="heart" size={20} color={getHrColor(pulse)} />
                       <Text style={styles.vitalLabel}>HR</Text>
                       <Text style={[styles.vitalValue, { color: getHrColor(pulse) }]}>{patientDetails.hr}</Text>
                   </View>
                   <View style={styles.vitalDivider} />
                   <View style={styles.vitalItem}>
                       <Ionicons name="speedometer" size={20} color={getBpColor(parsedVitals?.bpSystolic, parsedVitals?.bpDiastolic)} />
                       <Text style={styles.vitalLabel}>BP</Text>
                       <Text style={[styles.vitalValue, { color: getBpColor(parsedVitals?.bpSystolic, parsedVitals?.bpDiastolic) }]}>{patientDetails.bp}</Text>
                   </View>
                   <View style={styles.vitalDivider} />
                   <View style={styles.vitalItem}>
                       <Ionicons name="thermometer" size={20} color={getTempColor(parsedVitals?.temperature)} />
                       <Text style={styles.vitalLabel}>Temp</Text>
                       <Text style={[styles.vitalValue, { color: getTempColor(parsedVitals?.temperature) }]}>{patientDetails.temp}</Text>
                   </View>
                   <View style={styles.vitalDivider} />
                   <View style={styles.vitalItem}>
                       <Ionicons name="pulse" size={20} color={getO2Color(parsedVitals?.o2Sat)} />
                       <Text style={styles.vitalLabel}>O2 Sat</Text>
                       <Text style={[styles.vitalValue, { color: getO2Color(parsedVitals?.o2Sat) }]}>{patientDetails.o2Sat}</Text>
                   </View>
               </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Notes History</Text>
              <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.fabButton}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#0284c7" style={{marginTop: 20}} />
            ) : (
              <FlatList
                data={notes}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderNoteItem}
                contentContainerStyle={{ paddingBottom: 80 }}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
                    <Text style={styles.emptyText}>No clinical notes recorded yet.</Text>
                  </View>
                } 
              />
            )}
          </>
        ) : activeTab === 'vitals' ? (
          <VitalsList encounterId={Number(id)} />
        ) : activeTab === 'meds' ? (
          <MedicationList encounterId={Number(id)} />
        ) : activeTab === 'labs' ? (
          <LabResultsList encounterId={Number(id)} />
        ) : (
          <RadiologyList encounterId={Number(id)} />
        )}
      </View>

      {/* Add Note Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
               <Text style={styles.modalTitle}>Add Clinical Note</Text>
               <TouchableOpacity onPress={() => setModalVisible(false)}>
                 <Ionicons name="close" size={24} color="#64748b" />
               </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.textInput}
              placeholder="Type your clinical note here..."
              placeholderTextColor="#94a3b8"
              value={newNote}
              onChangeText={setNewNote}
              multiline
              textAlignVertical="top"
            />
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => setModalVisible(false)}
              >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, submitting && styles.disabledBtn]} 
                onPress={handleAddNote} 
                disabled={submitting}
              >
                  {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // Header 
  header: { 
    padding: theme.sizes.lg, 
    paddingTop: 40,
    backgroundColor: theme.colors.primary, 
    borderBottomLeftRadius: 24, 
    borderBottomRightRadius: 24,
    ...theme.shadows.medium,
    zIndex: 10,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  patientName: { fontSize: 22, fontWeight: "700", color: theme.colors.surface, flex: 1 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: theme.colors.surface, fontSize: 12, fontWeight: '600' },
  headerDetails: { flexDirection: 'row', alignItems: 'center' },
  headerDetailText: { fontSize: 14, color: theme.colors.primaryLight, fontWeight: '500' },
  headerSeparator: { marginHorizontal: 8, color: theme.colors.primaryLight },

  // Tabs
  tabBar: { 
    flexDirection: 'row', 
    backgroundColor: theme.colors.surface, 
    marginHorizontal: 16, 
    marginTop: -20, 
    borderRadius: theme.sizes.md, 
    padding: 4, 
    ...theme.shadows.small,
    marginBottom: 16,
    zIndex: 20,
  },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  activeTabItem: {},
  tabLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textLight },
  activeTabLabel: { color: theme.colors.primary, fontWeight: '700' },
  activeIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.primary, marginTop: 4 },

  // Content
  content: { flex: 1, paddingHorizontal: 16 },
  
  // Summary Card
  summaryCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 20, ...theme.shadows.small },
  cardTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.textLight, marginBottom: 16 }, // #475569
  vitalsGrid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vitalItem: { alignItems: 'center', flex: 1 },
  vitalLabel: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4, marginBottom: 2 }, // #94a3b8
  vitalValue: { fontSize: 18, fontWeight: '700', color: theme.colors.text }, // #1e293b
  vitalDivider: { width: 1, height: 30, backgroundColor: theme.colors.border }, // #e2e8f0

  // Notes & Timeline
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  fabButton: { backgroundColor: theme.colors.primary, width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", ...theme.shadows.small },

  timelineItem: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { width: 24, alignItems: 'center', marginRight: 12 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: theme.colors.border, marginTop: 4 },
  timelineContent: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, ...theme.shadows.small },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  noteAuthor: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  noteTime: { fontSize: 11, color: theme.colors.textMuted },
  noteTypeBadge: { alignSelf: 'flex-start', backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, color: theme.colors.primaryDark, fontSize: 10, fontWeight: '600', marginBottom: 8, overflow: 'hidden' },
  noteText: { fontSize: 14, color: theme.colors.textLight, lineHeight: 20 },

  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { marginTop: 12, color: theme.colors.textMuted, fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 24, ...theme.shadows.large },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  textInput: { backgroundColor: theme.colors.background, borderRadius: 12, padding: 16, height: 120, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 24 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  cancelBtnText: { color: theme.colors.textLight, fontWeight: '600' },
  saveBtn: { backgroundColor: theme.colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  saveBtnText: { color: theme.colors.surface, fontWeight: '600' },
  disabledBtn: { opacity: 0.7 },
  
  offlineBanner: {
    backgroundColor: theme.colors.error,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
      color: theme.colors.surface,
      fontSize: 12,
      fontWeight: '700',
  },
  criticalBanner: {
    backgroundColor: theme.colors.error,
    padding: theme.sizes.md,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  criticalText: {
    color: theme.colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
});
