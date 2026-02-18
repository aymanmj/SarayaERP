import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, FlatList, StatusBar } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import api from '../../services/api';
import LabResultsList from "../../components/LabResultsList";
import VitalsList from "../../components/VitalsList";
import MedicationList from "../../components/MedicationList";
import { Ionicons } from '@expo/vector-icons';

export default function PatientDetailScreen() {
  const params = useLocalSearchParams();
  const { id, name, diagnosis, gender, dob, vitals } = params;

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'notes' | 'vitals' | 'meds' | 'labs'>('notes');

  useEffect(() => {
    if (id) {
      fetchNotes();
    }
  }, [id]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const data = await api.getClinicalNotes(Number(id));
      setNotes(data || []);
    } catch (error) {
      console.error("Failed to fetch notes", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      Alert.alert("Validation", "Note content cannot be empty");
      return;
    }
    if (!id || isNaN(Number(id))) {
      Alert.alert("Error", "Invalid Encounter ID");
      return;
    }
    setSubmitting(true);
    try {
      await api.createClinicalNote(Number(id), newNote, 'DOCTOR_ROUND');
      setNewNote('');
      setModalVisible(false);
      fetchNotes(); 
      Alert.alert("Success", "Note added successfully");
    } catch (error: any) {
      console.error("Failed to add note", error);
      Alert.alert("Error", "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper directly in component or separate utils if needed. for now simplistic.
  const parseVitals = (vitalsStr: any) => {
    try {
      if (typeof vitalsStr === 'string') return JSON.parse(vitalsStr);
      return vitalsStr;
    } catch (e) {
      return null;
    }
  };

  const parsedVitals = vitals ? parseVitals(vitals) : null;
  const patientDetails = {
      bp: parsedVitals?.bpSystolic && parsedVitals?.bpDiastolic ? `${parsedVitals.bpSystolic}/${parsedVitals.bpDiastolic}` : '--/--',
      hr: parsedVitals?.heartRate || '--',
      temp: parsedVitals?.temperature ? `${parsedVitals.temperature}°C` : '--'
  };

  const renderNoteItem = ({ item, index }: { item: any, index: number }) => (
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
        {['notes', 'vitals', 'meds', 'labs'].map((tab) => (
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
                       <Ionicons name="heart" size={20} color="#ef4444" />
                       <Text style={styles.vitalLabel}>HR</Text>
                       <Text style={styles.vitalValue}>{patientDetails.hr}</Text>
                   </View>
                   <View style={styles.vitalDivider} />
                   <View style={styles.vitalItem}>
                       <Ionicons name="speedometer" size={20} color="#3b82f6" />
                       <Text style={styles.vitalLabel}>BP</Text>
                       <Text style={styles.vitalValue}>{patientDetails.bp}</Text>
                   </View>
                   <View style={styles.vitalDivider} />
                   <View style={styles.vitalItem}>
                       <Ionicons name="thermometer" size={20} color="#f59e0b" />
                       <Text style={styles.vitalLabel}>Temp</Text>
                       <Text style={styles.vitalValue}>{patientDetails.temp}</Text>
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
        ) : (
          <LabResultsList encounterId={Number(id)} />
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
  container: { flex: 1, backgroundColor: "#f1f5f9" },

  // Header 
  header: { 
    padding: 24, 
    paddingTop: 40,
    backgroundColor: "#0284c7", 
    borderBottomLeftRadius: 24, 
    borderBottomRightRadius: 24,
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  patientName: { fontSize: 22, fontWeight: "700", color: "#fff", flex: 1 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  headerDetails: { flexDirection: 'row', alignItems: 'center' },
  headerDetailText: { fontSize: 14, color: "#e0f2fe", fontWeight: '500' },
  headerSeparator: { marginHorizontal: 8, color: '#bae6fd' },

  // Tabs
  tabBar: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    marginHorizontal: 16, 
    marginTop: -20, 
    borderRadius: 16, 
    padding: 4, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 10, 
    elevation: 4,
    marginBottom: 16,
    zIndex: 20,
  },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  activeTabItem: {},
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  activeTabLabel: { color: '#0284c7', fontWeight: '700' },
  activeIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#0284c7', marginTop: 4 },

  // Content
  content: { flex: 1, paddingHorizontal: 16 },
  
  // Summary Card
  summaryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#475569', marginBottom: 16 },
  vitalsGrid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vitalItem: { alignItems: 'center', flex: 1 },
  vitalLabel: { fontSize: 12, color: '#94a3b8', marginTop: 4, marginBottom: 2 },
  vitalValue: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  vitalDivider: { width: 1, height: 30, backgroundColor: '#e2e8f0' },

  // Notes & Timeline
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  fabButton: { backgroundColor: "#0284c7", width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", elevation: 4, shadowColor: '#0284c7', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: {width:0, height:2} },

  timelineItem: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { width: 24, alignItems: 'center', marginRight: 12 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#0284c7', marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#e2e8f0', marginTop: 4 },
  timelineContent: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  noteAuthor: { fontSize: 13, fontWeight: '600', color: '#334155' },
  noteTime: { fontSize: 11, color: '#94a3b8' },
  noteTypeBadge: { alignSelf: 'flex-start', backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, color: '#0369a1', fontSize: 10, fontWeight: '600', marginBottom: 8, overflow: 'hidden' },
  noteText: { fontSize: 14, color: '#475569', lineHeight: 20 },

  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { marginTop: 12, color: '#94a3b8', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  textInput: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, height: 120, fontSize: 15, color: '#334155', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  cancelBtnText: { color: '#64748b', fontWeight: '600' },
  saveBtn: { backgroundColor: '#0284c7', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  disabledBtn: { opacity: 0.7 },
});
