import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

interface AddVitalModalProps {
  visible: boolean;
  onClose: () => void;
  encounterId: number;
  onSuccess: () => void;
}

const AddVitalModal: React.FC<AddVitalModalProps> = ({ visible, onClose, encounterId, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    temperature: '',
    bpSystolic: '',
    bpDiastolic: '',
    pulse: '',
    respRate: '',
    o2Sat: '',
    weight: '',
    height: '',
    note: '',
  });

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload: any = {};
      
      // Convert non-empty strings to numbers
      if (formData.temperature) payload.temperature = parseFloat(formData.temperature);
      if (formData.bpSystolic) payload.bpSystolic = parseInt(formData.bpSystolic);
      if (formData.bpDiastolic) payload.bpDiastolic = parseInt(formData.bpDiastolic);
      if (formData.pulse) payload.pulse = parseInt(formData.pulse);
      if (formData.respRate) payload.respRate = parseInt(formData.respRate);
      if (formData.o2Sat) payload.o2Sat = parseInt(formData.o2Sat);
      if (formData.weight) payload.weight = parseFloat(formData.weight);
      if (formData.height) payload.height = parseFloat(formData.height);
      if (formData.note) payload.note = formData.note;

      if (Object.keys(payload).length === 0) {
        Alert.alert('تنبيه', 'يجب إدخال قيمة واحدة على الأقل');
        setLoading(false);
        return;
      }

      await api.createVitals(encounterId, payload);
      
      // Reset form
      setFormData({
        temperature: '',
        bpSystolic: '',
        bpDiastolic: '',
        pulse: '',
        respRate: '',
        o2Sat: '',
        weight: '',
        height: '',
        note: '',
      });
      
      onSuccess();
      onClose();
      Alert.alert('نجاح', 'تم تسجيل العلامات الحيوية بنجاح');

    } catch (error: any) {
      console.error('Failed to create vitals:', error);
      Alert.alert('خطأ', error.response?.data?.message || 'فشل تسجيل العلامات الحيوية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>تسجيل علامات حيوية</Text>
          </View>

          <ScrollView style={styles.formContainer}>
            
            {/* Blood Pressure */}
            <Text style={styles.sectionTitle}>ضغط الدم (BP)</Text>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Diastolic</Text>
                <TextInput
                  style={styles.input}
                  placeholder="80"
                  keyboardType="numeric"
                  value={formData.bpDiastolic}
                  onChangeText={(text) => handleChange('bpDiastolic', text)}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Systolic</Text>
                <TextInput
                  style={styles.input}
                  placeholder="120"
                  keyboardType="numeric"
                  value={formData.bpSystolic}
                  onChangeText={(text) => handleChange('bpSystolic', text)}
                />
              </View>
            </View>

            {/* Pulse & Temp */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>الحرارة (°C)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="37.0"
                  keyboardType="numeric"
                  value={formData.temperature}
                  onChangeText={(text) => handleChange('temperature', text)}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>النبض (bpm)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="75"
                  keyboardType="numeric"
                  value={formData.pulse}
                  onChangeText={(text) => handleChange('pulse', text)}
                />
              </View>
            </View>

            {/* Resp & O2 */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>O2 Sat (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="98"
                  keyboardType="numeric"
                  value={formData.o2Sat}
                  onChangeText={(text) => handleChange('o2Sat', text)}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>التنفس (/min)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="16"
                  keyboardType="numeric"
                  value={formData.respRate}
                  onChangeText={(text) => handleChange('respRate', text)}
                />
              </View>
            </View>

            {/* Weight & Height */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>الطول (cm)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="170"
                  keyboardType="numeric"
                  value={formData.height}
                  onChangeText={(text) => handleChange('height', text)}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>الوزن (kg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="70"
                  keyboardType="numeric"
                  value={formData.weight}
                  onChangeText={(text) => handleChange('weight', text)}
                />
              </View>
            </View>

            <Text style={styles.label}>ملاحظات</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="أي ملاحظات إضافية..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={formData.note}
              onChangeText={(text) => handleChange('note', text)}
            />

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.btn, styles.btnCancel]} 
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.btnTextCancel}>إلغاء</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btn, styles.btnSave]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.btnTextSave}>حفظ</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  formContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
    backgroundColor: '#f1f5f9',
    padding: 4,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  halfInput: {
    width: '48%',
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'right', // Right align labels for RTL context if needed, usually mostly helpful
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  textArea: {
    textAlign: 'right', // Notes are likely Arabic text
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 12,
  },
  btn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: '#f1f5f9',
  },
  btnSave: {
    backgroundColor: '#0284c7',
  },
  btnTextCancel: {
    color: '#64748b',
    fontWeight: 'bold',
  },
  btnTextSave: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default AddVitalModal;
