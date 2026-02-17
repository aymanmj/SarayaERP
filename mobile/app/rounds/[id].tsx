import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import api from '../../services/api';

export default function PatientDetailScreen() {
  const params = useLocalSearchParams();
  const { id, name, diagnosis, gender, dob, vitals } = params;

  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchNotes();
    }
  }, [id]);

  const fetchNotes = async () => {
    setLoadingNotes(true);
    try {
      const data = await api.getClinicalNotes(Number(id));
      setNotes(data);
    } catch (error) {
      console.error("Failed to fetch notes", error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      await api.createClinicalNote(Number(id), newNote);
      setNewNote('');
      setModalVisible(false);
      fetchNotes(); // Refresh list
      Alert.alert("Success", "Note added successfully");
    } catch (error) {
      console.error("Failed to add note", error);
      Alert.alert("Error", "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate Age
  const calculateAge = (dobString: string) => {
    if (!dobString) return 'N/A';
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const age = dob ? calculateAge(dob as string) : 'N/A';
  
  // Parse Vitals
  let parsedVitals = null;
  if (vitals) {
    try {
      parsedVitals = JSON.parse(vitals as string);
    } catch (e) {
      console.error("Failed to parse vitals", e);
    }
  }

  const patientDetails = {
    id,
    name: name || 'Unknown Patient',
    age: age,
    gender: gender || 'Unknown',
    vitals: parsedVitals ? {
      bp: parsedVitals.bpSystolic && parsedVitals.bpDiastolic ? `${parsedVitals.bpSystolic}/${parsedVitals.bpDiastolic}` : 'N/A',
      hr: parsedVitals.heartRate || 'N/A',
      temp: parsedVitals.temperature ? `${parsedVitals.temperature}°C` : 'N/A'
    } : { bp: 'N/A', hr: 'N/A', temp: 'N/A' },
    notes: `Admitted for ${diagnosis}.`
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.name}>{patientDetails.name}</Text>
          <Text style={styles.details}>{patientDetails.age} Y / {patientDetails.gender}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Vitals</Text>
          <View style={styles.vitalsGrid}>
            <View style={styles.vitalItem}>
              <Text style={styles.vitalLabel}>BP</Text>
              <Text style={styles.vitalValue}>{patientDetails.vitals.bp}</Text>
            </View>
            <View style={styles.vitalItem}>
              <Text style={styles.vitalLabel}>HR</Text>
              <Text style={styles.vitalValue}>{patientDetails.vitals.hr}</Text>
            </View>
            <View style={styles.vitalItem}>
              <Text style={styles.vitalLabel}>Temp</Text>
              <Text style={styles.vitalValue}>{patientDetails.vitals.temp}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Clinical Notes</Text>
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
              <Text style={styles.addButtonText}>+ Add Note</Text>
            </TouchableOpacity>
          </View>
          
          {loadingNotes ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : notes.length === 0 ? (
            <Text style={styles.emptyText}>No notes recorded yet.</Text>
          ) : (
            notes.map((note) => (
              <View key={note.id} style={styles.noteCard}>
                <View style={styles.noteHeader}>
                  <Text style={styles.noteAuthor}>{note.createdBy?.fullName || 'Unknown'}</Text>
                  <Text style={styles.noteDate}>{new Date(note.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.noteContent}>{note.content}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Add Clinical Note</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter note details..."
              multiline
              numberOfLines={4}
              value={newNote}
              onChangeText={setNewNote}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.buttonClose]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.textStyle}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonSave]}
                onPress={handleAddNote}
                disabled={submitting}
              >
                <Text style={styles.textStyle}>{submitting ? 'Saving...' : 'Save Note'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  details: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  vitalsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  vitalItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '30%',
  },
  vitalLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  vitalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  notes: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontStyle: 'italic',
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  noteCard: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  noteAuthor: {
    fontWeight: '600',
    fontSize: 14,
    color: '#333',
  },
  noteDate: {
    fontSize: 12,
    color: '#888',
  },
  noteContent: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    width: '90%',
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    textAlignVertical: 'top',
    height: 100,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    borderRadius: 8,
    padding: 12,
    elevation: 2,
    width: '48%',
  },
  buttonClose: {
    backgroundColor: '#888',
  },
  buttonSave: {
    backgroundColor: '#007AFF',
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
