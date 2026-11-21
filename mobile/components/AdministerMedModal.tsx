import * as Crypto from 'expo-crypto';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { theme } from '../constants/theme';
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";


const administerSchema = z.object({
  status: z.enum(['GIVEN', 'NOT_GIVEN', 'HELD']),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.status !== 'GIVEN' && (!data.notes || data.notes.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Required when medication is not given or held",
      path: ["notes"]
    });
  }
});

type AdministerFormValues = z.infer<typeof administerSchema>;
const scheduledFrequencies = new Set(['DAILY', 'BID', 'TID', 'QID', 'QHS']);
type DoseSlot = { prescriptionItemId: number; scheduledSlot: string; status: string };

interface AdministerMedModalProps {
  visible: boolean;
  onClose: () => void;
  medication: any;
  encounterId: number;
  onSuccess: () => void;
}

import ScannerModal from './ScannerModal';

export default function AdministerMedModal({ visible, onClose, medication, encounterId, onSuccess }: AdministerMedModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  const { user } = useAuth();
  const pending = useRef<{ scope: string; encounterId: number; itemId: number; status: string; notes: string; requestId: string; scheduledSlot?: string } | null>(null);
  const flight = useRef(false);
  const needsSlot = scheduledFrequencies.has(medication?.frequency);
  const itemId = medication?.id;
  const [slots, setSlots] = useState<DoseSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>();
  const [slotError, setSlotError] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  useEffect(() => {
    setSlots([]);
    setSelectedSlot(undefined);
    setSlotError(false);
    if (!visible || !needsSlot) return;
    let current = true;
    setLoadingSlots(true);
    void api.getMedicationSchedule(encounterId).then((rows) => {
      if (current) setSlots(rows.filter((slot) =>
        slot.prescriptionItemId === itemId && ['PENDING', 'OVERDUE', 'HELD'].includes(slot.status),
      ));
    }).catch(() => {
      if (current) setSlotError(true);
    }).finally(() => {
      if (current) setLoadingSlots(false);
    });
    return () => { current = false; };
  }, [visible, needsSlot, encounterId, itemId]);

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<AdministerFormValues>({
    resolver: zodResolver(administerSchema),
    defaultValues: { status: 'GIVEN', notes: '' }
  });

  const status = watch('status');

  const onSubmit = async (data: AdministerFormValues) => {
    if (!medication || flight.current) return;
    const scope = `${user?.hospitalId}:${user?.id}:${encounterId}:${medication.id}`;
    if (pending.current && pending.current.scope !== scope) {
      Alert.alert('عملية غير محسومة', 'توجد محاولة سابقة تخص موظفًا أو مريضًا آخر؛يلزم حسمها قبل تنفيذ عملية جديدة');
      return;
    }
    const previous = pending.current;
    const dose = slots.find((slot) => slot.scheduledSlot === selectedSlot);
    if (!previous && needsSlot && (!dose || (data.status === 'HELD' && dose.status === 'HELD'))) {
      Alert.alert('موعد الجرعة', 'اختر موعدًا متاحًا للإجراء.');
      return;
    }
    const request = previous ?? { scope, encounterId, itemId: medication.id, status: data.status, notes: data.notes || '', requestId: Crypto.randomUUID(), scheduledSlot: dose?.scheduledSlot };
    pending.current = request;
    flight.current = true;
    setSubmitting(true);
    try {
      await api.administerMedication(request.encounterId, request.itemId, request.status, request.notes, request.requestId, request.scheduledSlot);
      pending.current = null;
      Alert.alert('تم التسجيل', 'أكد الخادم تسجيل إعطاء الدواء');
      onSuccess();
      reset();
      onClose();
    } catch (error: unknown) {
      if (!previous && axios.isAxiosError(error) && error.response && [400, 401, 403, 404, 409, 422].includes(error.response.status)) pending.current = null;
      Alert.alert('لم تتأكد النتيجة', 'لم يعرض الإعطاء كمنفذ. أعد المحاولة بنفس البيانات والمعرف لحسم النتيجة، ولا تسجل جرعة جديدة قبل التحقق.');
    } finally {
      flight.current = false;
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (pending.current || flight.current) { Alert.alert('عملية غير محسومة', 'احسم نتيجة المحاولة الحالية بالمعرف نفسه قبل إغلاق النافذة أو بدء إعطاء جديد'); return; }
    onClose();
  };

  const handleScan = (data: string) => {
    setScannerVisible(false);
    
    Alert.alert('قراءة رمز فقط', `الرمز المقروء: ${data}. هذه القراءة المحلية لا تتحقق من المريض أو الدواء أو الجرعة أو الطريق أو الموعد. يلزم تحقق سريري مباشر قبل التسجيل.`);
  };

  if (!medication) return null;

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="fade" 
      onRequestClose={handleClose}
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
              <View style={{flexDirection: 'row', gap: 8}}>
                  <TouchableOpacity onPress={() => setScannerVisible(true)} style={styles.scanBtn}>
                    <Ionicons name="qr-code-outline" size={20} color="#0284c7" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={20} color="#64748b" />
                  </TouchableOpacity>
              </View>
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

            {needsSlot && (
              <View>
                <Text style={styles.sectionLabel}>اختر موعد الجرعة</Text>
                {loadingSlots && <ActivityIndicator />}
                {!loadingSlots && slots.length === 0 && (
                  <Text>{slotError ? 'تعذر تحميل جدول الدواء.' : 'لا توجد جرعات متاحة لهذا اليوم.'}</Text>
                )}
                {slots.map((slot) => (
                  <TouchableOpacity
                    key={slot.scheduledSlot}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selectedSlot === slot.scheduledSlot }}
                    disabled={submitting || !!pending.current}
                    onPress={() => setSelectedSlot(slot.scheduledSlot)}
                  >
                    <Text>{selectedSlot === slot.scheduledSlot ? '✓ ' : ''}{slot.scheduledSlot.slice(11)}{slot.status === 'HELD' ? ' — مؤجل' : ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Status Selection */}
            <Text style={styles.sectionLabel}>Administration Status</Text>
            <View style={styles.statusContainer}>
              <TouchableOpacity
                style={[styles.statusBtn, status === 'GIVEN' && styles.statusBtnGiven]}
                disabled={submitting || !!pending.current}
                onPress={() => setValue('status', 'GIVEN')}
              >
                <Ionicons name="checkmark-circle" size={18} color={status === 'GIVEN' ? '#fff' : '#15803d'} />
                <Text style={[styles.statusText, status === 'GIVEN' && styles.statusTextActive]}>Given</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statusBtn, status === 'NOT_GIVEN' && styles.statusBtnNotGiven]}
                disabled={submitting || !!pending.current}
                onPress={() => setValue('status', 'NOT_GIVEN')}
              >
                <Ionicons name="alert-circle" size={18} color={status === 'NOT_GIVEN' ? '#fff' : '#b91c1c'} />
                <Text style={[styles.statusText, status === 'NOT_GIVEN' && styles.statusTextActive]}>Not Given</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.statusBtn, status === 'HELD' && styles.statusBtnHeld]}
                disabled={submitting || !!pending.current}
                onPress={() => setValue('status', 'HELD')}
              >
                <Ionicons name="hand-left" size={18} color={status === 'HELD' ? '#fff' : '#b45309'} />
                <Text style={[styles.statusText, status === 'HELD' && styles.statusTextActive]}>Held</Text>
              </TouchableOpacity>
            </View>

            {/* Notes Input */}
            <Text style={styles.sectionLabel}>Notes {status === 'GIVEN' ? '(Optional)' : '*'}</Text>
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.notes && styles.inputError]}
                  placeholder="Add any observations or reasons..."
                  placeholderTextColor="#94a3b8"
                  value={value}
                  editable={!submitting && !pending.current}
                  onChangeText={onChange}
                  multiline
                  textAlignVertical="top"
                />
              )}
            />
            {errors.notes && <Text style={styles.errorText}>{errors.notes.message}</Text>}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton, 
                status === 'GIVEN' ? styles.btnGiven : 
                status === 'NOT_GIVEN' ? styles.btnNotGiven : styles.btnHeld,
                submitting && styles.disabledButton
              ]}
              onPress={handleSubmit(onSubmit)}
              disabled={submitting || (needsSlot && !selectedSlot && !pending.current)}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {pending.current ? 'إعادة المحاولة بالبيانات والمعرف الأصليين' : `Confirm ${status === 'GIVEN' ? 'Administration' : status.replace('_', ' ')}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
      
      <ScannerModal 
        visible={scannerVisible} 
        onClose={() => setScannerVisible(false)} 
        onScan={handleScan}
        title={`Scan ${medication.drugItem?.name || 'Medication'}`}
      />
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
  title: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  closeBtn: { padding: 4, backgroundColor: theme.colors.background, borderRadius: 20 },
  scanBtn: { padding: 4, backgroundColor: theme.colors.background, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border },

  drugCard: { 
    flexDirection: 'row', 
    backgroundColor: 'rgba(13, 148, 136, 0.1)', 
    padding: 16, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.2)'
  },
  iconContainer: { 
    width: 40, height: 40, 
    borderRadius: 20, 
    backgroundColor: theme.colors.surface, 
    justifyContent: 'center', alignItems: 'center', 
    marginRight: 12 
  },
  drugDetails: { flex: 1 },
  drugName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  drugDose: { fontSize: 13, color: theme.colors.primaryLight, marginTop: 2, fontWeight: '500' },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 8, marginLeft: 4 },
  
  statusContainer: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statusBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    gap: 6,
    paddingVertical: 12, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: theme.colors.border, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: theme.colors.surface
  },
  
  statusBtnGiven: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  statusBtnNotGiven: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  statusBtnHeld: { backgroundColor: '#d97706', borderColor: '#d97706' },

  statusText: { fontSize: 12, fontWeight: '600', color: theme.colors.textLight },
  statusTextActive: { color: '#fff' },

  input: { 
    backgroundColor: theme.colors.background, 
    borderWidth: 1, 
    borderColor: theme.colors.border, 
    borderRadius: 12, 
    padding: 16, 
    height: 100, 
    fontSize: 14, 
    color: theme.colors.text, 
    marginBottom: 4 
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 10,
    marginBottom: 16,
    marginLeft: 4,
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
