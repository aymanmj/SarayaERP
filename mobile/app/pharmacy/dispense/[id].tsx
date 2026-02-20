import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import { useQueryClient } from '@tanstack/react-query';
import { theme } from '../../../constants/theme';
import ScannerModal from '../../../components/ScannerModal';

export default function DispenseScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [prescription, setPrescription] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dispensing, setDispensing] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
    const [scannerVisible, setScannerVisible] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (id) fetchPrescription();
    }, [id]);

    const fetchPrescription = async () => {
        setLoading(true);
        try {
            // First try to resolve from React Query cache
            let found = null;
            const data: any = queryClient.getQueryData(['pharmacyWorklist', 10]);
            if (data?.pages) {
                for (const page of data.pages) {
                    found = page.find((p: any) => p.id == id);
                    if (found) break;
                }
            }
            
            // Fallback to fetch first page
            if (!found) {
                const list = await api.getPharmacyWorklist(1, 20);
                found = list.find((p: any) => p.id == id);
            }

            if (found) {
                setPrescription(found);
                // Pre-select all items by default
                if (found.items) {
                    setSelectedItems(new Set(found.items.map((i: any) => i.id)));
                }
            } else {
                Alert.alert("Error", "Prescription not found in recent worklist");
                router.back();
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to load prescription");
            router.back();
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

    const handleScan = (data: string) => {
        setScannerVisible(false);
        
        // Find matching item by code or name
        const match = prescription?.items?.find((item: any) => {
            const drugName = item.drugItem?.name || item.drugItem?.tradeName || '';
            const drugCode = item.drugItem?.code || '';
            return (data === drugCode) || 
                   (drugName.toLowerCase().includes(data.toLowerCase())) || 
                   (data.toLowerCase().includes(drugName.toLowerCase()));
        });

        if (match) {
            const next = new Set(selectedItems);
            next.add(match.id);
            setSelectedItems(next);
            Alert.alert("Match Confirmed", `${match.drugItem?.tradeName || 'Medication'} verified and selected.`);
        } else {
            Alert.alert("Mismatch Warning", `Scanned code '${data}' does not match any items in this prescription.`);
        }
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
                    <Text style={styles.value}>{prescription.patient?.fullName || 'Unknown'}</Text>
                    <Text style={styles.label}>Doctor</Text>
                    <Text style={styles.value}>{prescription.doctor?.fullName}</Text>
                </View>

                <Text style={styles.sectionTitle}>Prescription Items</Text>
                {prescription.items?.map((item: any) => (
                    <TouchableOpacity 
                        key={item.id} 
                        style={[styles.itemCard, selectedItems.has(item.id) && styles.selectedCard]}
                        onPress={() => toggleItem(item.id)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.checkbox, selectedItems.has(item.id) && styles.checkboxSelected]}>
                             {selectedItems.has(item.id) && <Ionicons name="checkmark" size={16} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.drugName}>{item.drugItem?.tradeName}</Text>
                            <Text style={styles.drugDetail}>{item.dose} - {item.route} - {item.frequency}</Text>
                            <Text style={styles.drugDetail}>Qty: {item.quantity} days</Text>
                        </View>
                        <TouchableOpacity 
                            style={{ padding: 8 }}
                            onPress={() => setScannerVisible(true)}
                        >
                            <Ionicons name="scan-circle-outline" size={28} color={theme.colors.primary} />
                        </TouchableOpacity>
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

            <ScannerModal 
                visible={scannerVisible} 
                onClose={() => setScannerVisible(false)} 
                onScan={handleScan}
                title="Scan Medication Barcode"
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.sizes.lg, backgroundColor: theme.colors.surface, ...theme.shadows.small },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    content: { padding: theme.sizes.lg },
    section: { backgroundColor: theme.colors.surface, padding: theme.sizes.lg, borderRadius: theme.sizes.md, marginBottom: 24, ...theme.shadows.small },
    label: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
    value: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: theme.colors.text },
    itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, padding: 16, borderRadius: theme.sizes.md, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border },
    selectedCard: { borderColor: theme.colors.primary, backgroundColor: '#f0f9ff' },
    checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.colors.border, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface },
    checkboxSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
    drugName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    drugDetail: { color: theme.colors.textLight, marginTop: 4, fontSize: 13 },
    footer: { padding: theme.sizes.lg, backgroundColor: theme.colors.surface, ...theme.shadows.medium, borderTopWidth: 1, borderTopColor: theme.colors.border },
    dispenseBtn: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: theme.sizes.sm, alignItems: 'center' },
    disabledBtn: { backgroundColor: theme.colors.textMuted },
    btnText: { color: theme.colors.surface, fontSize: 16, fontWeight: '700' }
});
