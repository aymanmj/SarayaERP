import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
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
      setNotes('');
      setStatus('GIVEN');
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
    <Modal 
      visible={visible} 
      transparent 
      animationType="fade" 
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={() => Keyboard.dismiss()}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Administer Medication</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Drug Info Card */}
            <View style={styles.drugCard}>
              <View style={styles.iconContainer}>
                 <Ionicons name="medkit" size={24} color="#0284c7" />
              </View>
              <View style={styles.drugDetails}>
                <Text style={styles.drugName}>{medication.drugItem?.name || medication.product?.name || 'Unknown'}</Text>
                <Text style={styles.drugDose}>{medication.dose} • {medication.route} • {medication.frequency}</Text>
              </View>
            </View>

            {/* Status Selection */}
            <Text style={styles.sectionLabel}>Administration Status</Text>
            <View style={styles.statusContainer}>
              <TouchableOpacity
                style={[styles.statusBtn, status === 'GIVEN' && styles.statusBtnGiven]}
                onPress={() => setStatus('GIVEN')}
              >
                <Ionicons name="checkmark-circle" size={18} color={status === 'GIVEN' ? '#fff' : '#15803d'} />
                <Text style={[styles.statusText, status === 'GIVEN' && styles.statusTextActive]}>Given</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statusBtn, status === 'NOT_GIVEN' && styles.statusBtnNotGiven]}
                onPress={() => setStatus('NOT_GIVEN')}
              >
                <Ionicons name="alert-circle" size={18} color={status === 'NOT_GIVEN' ? '#fff' : '#b91c1c'} />
                <Text style={[styles.statusText, status === 'NOT_GIVEN' && styles.statusTextActive]}>Not Given</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.statusBtn, status === 'HELD' && styles.statusBtnHeld]}
                onPress={() => setStatus('HELD')}
              >
                <Ionicons name="hand-left" size={18} color={status === 'HELD' ? '#fff' : '#b45309'} />
                <Text style={[styles.statusText, status === 'HELD' && styles.statusTextActive]}>Held</Text>
              </TouchableOpacity>
            </View>

            {/* Notes Input */}
            <Text style={styles.sectionLabel}>Notes (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Add any observations or reasons..."
              placeholderTextColor="#94a3b8"
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton, 
                status === 'GIVEN' ? styles.btnGiven : 
                status === 'NOT_GIVEN' ? styles.btnNotGiven : styles.btnHeld,
                submitting && styles.disabledButton
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  Confirm {status === 'GIVEN' ? 'Administration' : status.replace('_', ' ')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 20 },
  keyboardView: { width: '100%', alignItems: 'center' },
  
  modalContainer: { 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 24, 
    width: '100%',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10
  },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  closeBtn: { padding: 4, backgroundColor: '#f1f5f9', borderRadius: 20 },

  drugCard: { 
    flexDirection: 'row', 
    backgroundColor: '#f0f9ff', 
    padding: 16, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0f2fe'
  },
  iconContainer: { 
    width: 40, height: 40, 
    borderRadius: 20, 
    backgroundColor: '#fff', 
    justifyContent: 'center', alignItems: 'center', 
    marginRight: 12 
  },
  drugDetails: { flex: 1 },
  drugName: { fontSize: 16, fontWeight: '700', color: '#0c4a6e' },
  drugDose: { fontSize: 13, color: '#0369a1', marginTop: 2, fontWeight: '500' },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 8, marginLeft: 4 },
  
  statusContainer: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statusBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    gap: 6,
    paddingVertical: 12, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#e2e8f0', 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  
  statusBtnGiven: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  statusBtnNotGiven: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  statusBtnHeld: { backgroundColor: '#d97706', borderColor: '#d97706' },

  statusText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  statusTextActive: { color: '#fff' },

  input: { 
    backgroundColor: '#f8fafc', 
    borderWidth: 1, 
    borderColor: '#e2e8f0', 
    borderRadius: 12, 
    padding: 16, 
    height: 100, 
    fontSize: 14, 
    color: '#334155', 
    marginBottom: 24 
  },

  submitButton: { 
    paddingVertical: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  btnGiven: { backgroundColor: '#16a34a' },
  btnNotGiven: { backgroundColor: '#dc2626' },
  btnHeld: { backgroundColor: '#d97706' },
  
  disabledButton: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
