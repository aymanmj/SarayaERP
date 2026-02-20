import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from '@tanstack/react-query';

const numericStringRefinement = (min: number, max: number, message: string) => 
  z.string().optional().refine(val => !val || (Number(val) >= min && Number(val) <= max), { message });

const vitalSchema = z.object({
  temperature: numericStringRefinement(30, 45, "حرارة غير منطقية"),
  bpSystolic: numericStringRefinement(40, 250, "قيمة غير منطقية"),
  bpDiastolic: numericStringRefinement(20, 150, "قيمة غير منطقية"),
  pulse: numericStringRefinement(20, 300, "نبض غير منطقي"),
  respRate: numericStringRefinement(5, 80, "قيمة غير منطقية"),
  o2Sat: numericStringRefinement(50, 100, "يجب أن يكون بين 50 و 100"),
  weight: z.string().optional(),
  height: z.string().optional(),
  note: z.string().optional(),
});

type VitalFormValues = z.infer<typeof vitalSchema>;

interface AddVitalModalProps {
  visible: boolean;
  onClose: () => void;
  encounterId: number;
  onSuccess: () => void;
}

const AddVitalModal: React.FC<AddVitalModalProps> = ({ visible, onClose, encounterId, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { control, handleSubmit, reset, formState: { errors } } = useForm<VitalFormValues>({
    resolver: zodResolver(vitalSchema),
    defaultValues: {
      temperature: '', bpSystolic: '', bpDiastolic: '', pulse: '', respRate: '', o2Sat: '', weight: '', height: '', note: ''
    }
  });

  const onSubmit = async (data: VitalFormValues) => {
    setLoading(true);
    try {
      const payload: any = {};
      
      if (data.temperature) payload.temperature = parseFloat(data.temperature);
      if (data.bpSystolic) payload.bpSystolic = parseInt(data.bpSystolic);
      if (data.bpDiastolic) payload.bpDiastolic = parseInt(data.bpDiastolic);
      if (data.pulse) payload.pulse = parseInt(data.pulse);
      if (data.respRate) payload.respRate = parseInt(data.respRate);
      if (data.o2Sat) payload.o2Sat = parseInt(data.o2Sat);
      if (data.weight) payload.weight = parseFloat(data.weight);
      if (data.height) payload.height = parseFloat(data.height);
      if (data.note) payload.note = data.note;

      if (Object.keys(payload).length === 0) {
        Alert.alert('تنبيه', 'يجب إدخال قيمة واحدة على الأقل');
        setLoading(false);
        return;
      }

      // Optimistic Update
      const tempVital = {
        id: Date.now(),
        ...payload,
        createdAt: new Date().toISOString(),
        createdBy: { id: 0, fullName: "You (Pending)" }
      };

      queryClient.setQueryData(['vitals', encounterId], (oldData: any) => {
        if (!Array.isArray(oldData)) return [tempVital];
        return [tempVital, ...oldData];
      });

      await api.createVitals(encounterId, payload);
      
      reset();
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
                <Controller
                  control={control}
                  name="bpDiastolic"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.bpDiastolic && styles.inputError]} placeholder="80" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
                {errors.bpDiastolic && <Text style={styles.errorText}>{errors.bpDiastolic.message}</Text>}
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Systolic</Text>
                <Controller
                  control={control}
                  name="bpSystolic"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.bpSystolic && styles.inputError]} placeholder="120" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
                {errors.bpSystolic && <Text style={styles.errorText}>{errors.bpSystolic.message}</Text>}
              </View>
            </View>

            {/* Pulse & Temp */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>الحرارة (°C)</Text>
                <Controller
                  control={control}
                  name="temperature"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.temperature && styles.inputError]} placeholder="37.0" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
                {errors.temperature && <Text style={styles.errorText}>{errors.temperature.message}</Text>}
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>النبض (bpm)</Text>
                <Controller
                  control={control}
                  name="pulse"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.pulse && styles.inputError]} placeholder="75" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
                {errors.pulse && <Text style={styles.errorText}>{errors.pulse.message}</Text>}
              </View>
            </View>

            {/* Resp & O2 */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>O2 Sat (%)</Text>
                <Controller
                  control={control}
                  name="o2Sat"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.o2Sat && styles.inputError]} placeholder="98" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
                {errors.o2Sat && <Text style={styles.errorText}>{errors.o2Sat.message}</Text>}
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>التنفس (/min)</Text>
                <Controller
                  control={control}
                  name="respRate"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.respRate && styles.inputError]} placeholder="16" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
                {errors.respRate && <Text style={styles.errorText}>{errors.respRate.message}</Text>}
              </View>
            </View>

            {/* Weight & Height */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>الطول (cm)</Text>
                <Controller
                  control={control}
                  name="height"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.height && styles.inputError]} placeholder="170" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>الوزن (kg)</Text>
                <Controller
                  control={control}
                  name="weight"
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={[styles.input, errors.weight && styles.inputError]} placeholder="70" keyboardType="numeric" value={value} onChangeText={onChange} />
                  )}
                />
              </View>
            </View>

            <Text style={styles.label}>ملاحظات</Text>
            <Controller
              control={control}
              name="note"
              render={({ field: { onChange, value } }) => (
                <TextInput style={[styles.input, styles.textArea]} placeholder="أي ملاحظات إضافية..." multiline numberOfLines={3} textAlignVertical="top" value={value} onChangeText={onChange} />
              )}
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
              onPress={handleSubmit(onSubmit)}
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
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'right',
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
