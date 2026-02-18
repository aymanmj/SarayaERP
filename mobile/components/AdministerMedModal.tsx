import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

interface AdministerMedModalProps {
  visible: boolean;
  onClose: () => void;
  medication: any;
  encounterId: number;
  onSuccess: () => void;
}

export default function AdministerMedModal({ visible, onClose, medication, encounterId, onSuccess }: AdministerMedModalProps) {
  const [status, setStatus] = useState<'GIVEN' | 'NOT_GIVEN' | 'HELD'>('GIVEN');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!medication) return;

    setSubmitting(true);
    try {
      await api.administerMedication(encounterId, medication.id, status, notes);
      Alert.alert("Success", "Medication administration recorded");
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to record administration");
    } finally {
      setSubmitting(false);
    }
  };

  if (!medication) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Administer Medication</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.drugInfo}>
            <Text style={styles.drugName}>{medication.drugItem?.name}</Text>
            <Text style={styles.drugDose}>{medication.dose} - {medication.route}</Text>
            {medication.notes && <Text style={styles.drugNotes}>Note: {medication.notes}</Text>}
          </View>

          <Text style={styles.label}>Status:</Text>
          <View style={styles.statusContainer}>
            {['GIVEN', 'NOT_GIVEN', 'HELD'].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.statusButton, status === s && styles.activeStatus]}
                onPress={() => setStatus(s as any)}
              >
                <Text style={[styles.statusText, status === s && styles.activeStatusText]}>
                  {s.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Notes (Optional):</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Patient refused, IV site changed..."
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Confirm Administration</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#fff', borderRadius: 15, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  drugInfo: { backgroundColor: '#f0f9ff', padding: 15, borderRadius: 10, marginBottom: 20 },
  drugName: { fontSize: 18, fontWeight: 'bold', color: '#0284c7', marginBottom: 5 },
  drugDose: { fontSize: 16, color: '#444' },
  drugNotes: { fontSize: 14, color: '#666', marginTop: 5, fontStyle: 'italic' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 10, color: '#333' },
  statusContainer: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statusButton: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  activeStatus: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  statusText: { color: '#666', fontWeight: '600' },
  activeStatusText: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, height: 80, textAlignVertical: 'top', marginBottom: 20 },
  submitButton: { backgroundColor: '#10b981', padding: 15, borderRadius: 10, alignItems: 'center' },
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
