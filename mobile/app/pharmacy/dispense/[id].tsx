import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';

export default function DispenseScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [prescription, setPrescription] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dispensing, setDispensing] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (id) fetchPrescription();
    }, [id]);

    const fetchPrescription = async () => {
        // We reuse the worklist payload or fetch details. 
        // Assuming we need to fetch specific details or filter from worklist cache
        // Currently api.getPharmacyWorklist returns list. 
        // Ideally we should have getPrescription(id)
        // For MVP, we'll re-fetch worklist and find item. Not efficient but works for now.
        setLoading(true);
        try {
            const list = await api.getPharmacyWorklist();
            const found = list.find((p: any) => p.id == id);
            if (found) {
                setPrescription(found);
                // Pre-select all items for easier flow? Or force check?
                // Let's force check
            } else {
                Alert.alert("Error", "Prescription not found");
                router.back();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const toggleItem = (itemId: number) => {
        const next = new Set(selectedItems);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        setSelectedItems(next);
    };

    const handleDispense = async () => {
        if (selectedItems.size === 0) {
            Alert.alert("Validation", "Select at least one item to dispense");
            return;
        }

        setDispensing(true);
        try {
            // Prepare payload
            const itemsToDispense = prescription.items
                .filter((item: any) => selectedItems.has(item.id))
                .map((item: any) => ({
                    prescriptionItemId: item.id,
                    quantity: item.quantity, // Dispensing full quantity
                    // dispensedDrugItemId: item.drugItemId // Assuming same drug
                }));
            
            const result = await api.dispensePrescription(Number(id), itemsToDispense, "Dispensed via mobile");
            
            if (result.offline) {
                Alert.alert("Offline", "Dispense queued. Will update when online.");
            } else {
                Alert.alert("Success", "Prescription dispensed successfully.");
            }
            router.back();
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to dispense");
        } finally {
            setDispensing(false);
        }
    };

    if (loading) return <ActivityIndicator style={styles.center} />;
    if (!prescription) return <View style={styles.center}><Text>Not found</Text></View>;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#1e293b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Dispense Rx #{id}</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={styles.label}>Patient</Text>
                    <Text style={styles.value}>{prescription.encounter?.patient?.fullName}</Text>
                    <Text style={styles.label}>Doctor</Text>
                    <Text style={styles.value}>{prescription.doctor?.fullName}</Text>
                </View>

                <Text style={styles.sectionTitle}>Prescription Items</Text>
                {prescription.items?.map((item: any) => (
                    <TouchableOpacity 
                        key={item.id} 
                        style={[styles.itemCard, selectedItems.has(item.id) && styles.selectedCard]}
                        onPress={() => toggleItem(item.id)}
                    >
                        <View style={styles.checkbox}>
                             {selectedItems.has(item.id) && <Ionicons name="checkmark" size={16} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.drugName}>{item.drugItem?.tradeName}</Text>
                            <Text style={styles.drugDetail}>{item.dose} - {item.route} - {item.frequency}</Text>
                            <Text style={styles.drugDetail}>Qty: {item.quantity} days</Text>
                        </View>
                        <Ionicons name="scan-circle-outline" size={28} color="#0284c7" />
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity 
                    style={[styles.dispenseBtn, selectedItems.size === 0 && styles.disabledBtn]}
                    onPress={handleDispense}
                    disabled={dispensing || selectedItems.size === 0}
                >
                    {dispensing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Dispense Selected</Text>}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', elevation: 1 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    content: { padding: 16 },
    section: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 24, elevation: 1 },
    label: { fontSize: 12, color: '#64748b', marginBottom: 2 },
    value: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#334155' },
    itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
    selectedCard: { borderColor: '#0284c7', backgroundColor: '#f0f9ff' },
    checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#cbd5e1', marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
    drugName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
    drugDetail: { color: '#64748b' },
    footer: { padding: 16, backgroundColor: '#fff', elevation: 8 },
    dispenseBtn: { backgroundColor: '#0284c7', padding: 16, borderRadius: 12, alignItems: 'center' },
    disabledBtn: { backgroundColor: '#94a3b8' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
