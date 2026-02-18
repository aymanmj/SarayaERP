import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, FlatList, Button } from 'react-native';
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
  const [activeTab, setActiveTab] = useState<'notes' | 'labs' | 'vitals' | 'meds'>('notes');

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

  // Helper to parse vitals safely
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
      bp: parsedVitals?.bpSystolic && parsedVitals?.bpDiastolic ? `${parsedVitals.bpSystolic}/${parsedVitals.bpDiastolic}` : 'N/A',
      hr: parsedVitals?.heartRate || 'N/A',
      temp: parsedVitals?.temperature ? `${parsedVitals.temperature}°C` : 'N/A'
  };

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.patientName}>{name || "Unknown Patient"}</Text>
        <Text style={styles.patientDetail}>MRN: {id ? `MRN-${id}` : 'N/A'}</Text>
        <Text style={styles.patientDetail}>
            {dob ? new Date().getFullYear() - new Date(dob as string).getFullYear() : 'N/A'} Years | {gender || 'Unknown'}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'notes' && styles.activeTab]} 
          onPress={() => setActiveTab('notes')}
        >
          <Text style={[styles.tabText, activeTab === 'notes' && styles.activeTabText]}>Clinical Notes</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'vitals' && styles.activeTab]} 
          onPress={() => setActiveTab('vitals')}
        >
          <Text style={[styles.tabText, activeTab === 'vitals' && styles.activeTabText]}>Vitals</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'meds' && styles.activeTab]} 
          onPress={() => setActiveTab('meds')}
        >
          <Text style={[styles.tabText, activeTab === 'meds' && styles.activeTabText]}>Meds</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'labs' && styles.activeTab]} 
          onPress={() => setActiveTab('labs')}
        >
          <Text style={[styles.tabText, activeTab === 'labs' && styles.activeTabText]}>Lab Results</Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {activeTab === 'notes' ? (
          <>
            <View style={styles.vitalsCard}>
               <Text style={styles.vitalsTitle}>Latest Vitals</Text>
               <View style={styles.vitalsRow}>
                   <Text style={styles.vitalText}>BP: {patientDetails.bp}</Text>
                   <Text style={styles.vitalText}>HR: {patientDetails.hr}</Text>
                   <Text style={styles.vitalText}>Temp: {patientDetails.temp}</Text>
               </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Notes History</Text>
              <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#0000ff" />
            ) : (
              <FlatList
                data={notes}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <View style={styles.noteCard}>
                    <Text style={styles.noteType}>{item.type}</Text>
                    <Text style={styles.noteContent}>{item.content}</Text>
                    <Text style={styles.noteMeta}>
                      {item.createdBy?.fullName || 'Unknown'} | {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No notes found.</Text>} 
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
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Add Clinical Note</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter note content..."
            value={newNote}
            onChangeText={setNewNote}
            multiline
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButtonSave} onPress={handleAddNote} disabled={submitting}>
                <Text style={styles.modalButtonText}>{submitting ? "Saving..." : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  header: { padding: 20, backgroundColor: "#0284c7", borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingBottom: 30 },
  patientName: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 5 },
  patientDetail: { fontSize: 16, color: "#e0f2fe" },
  
  // Tabs
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 20, marginTop: -20, borderRadius: 12, padding: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: '#0284c7' },
  tabText: { fontWeight: '600', color: '#64748b' },
  activeTabText: { color: '#fff' },

  content: { flex: 1, padding: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  sectionTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  addButton: { backgroundColor: "#0284c7", width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  
  // Vitals Card
  vitalsCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  vitalsTitle: { fontSize: 14, fontWeight: 'bold', color: '#64748b', marginBottom: 10 },
  vitalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  vitalText: { fontSize: 16, fontWeight: 'bold', color: '#333' },

  noteCard: { backgroundColor: "#fff", padding: 15, borderRadius: 10, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  noteType: { fontSize: 14, fontWeight: "bold", color: "#0284c7", marginBottom: 5 },
  noteContent: { fontSize: 16, color: "#333", marginBottom: 10 },
  noteMeta: { fontSize: 12, color: "#777" },
  emptyText: { textAlign: "center", marginTop: 20, color: "#777" },
  
  modalView: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.9)" }, // Darker background
  modalTitle: { fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: "#fff", padding: 15, borderRadius: 10, marginBottom: 20, minHeight: 100, textAlignVertical: 'top' },
  modalButtons: { flexDirection: "row", justifyContent: "space-around" },
  modalButtonCancel: { backgroundColor: "#ef4444", padding: 10, borderRadius: 8, width: '40%', alignItems: 'center' },
  modalButtonSave: { backgroundColor: "#0284c7", padding: 10, borderRadius: 8, width: '40%', alignItems: 'center' },
  modalButtonText: { color: '#fff', fontWeight: 'bold' } 
});
