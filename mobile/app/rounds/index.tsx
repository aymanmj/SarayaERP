import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import api from "../../services/api";
import { Ionicons } from "@expo/vector-icons";

interface Encounter {
  id: number;
  patientId: number;
  status: string;
  patient: {
    fullName: string;
    mrn: string;
    dateOfBirth?: string;
    gender?: string;
  };
  admission?: {
    primaryDiagnosis?: string;
  };
  bedAssignments: {
    bed: { bedNumber: string; ward: { name: string } };
  }[];
  vitalSigns?: {
    bpSystolic: number;
    bpDiastolic: number;
    heartRate: number;
    temperature: number;
    createdAt: string;
  }[];
}

export default function RoundsScreen() {
  const router = useRouter();
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRounds();
  }, []);

  const fetchRounds = async () => {
    try {
      const response = await api.get("/clinical/inpatient/my-rotation");
      setEncounters(response.data);
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error", "Failed to fetch rounds data");
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: Encounter }) => {
    const currentBed = item.bedAssignments?.[0]?.bed;
    const location = currentBed
      ? `${currentBed.ward.name} - ${currentBed.bedNumber}`
      : "No Bed Assigned";

    const latestVitals = item.vitalSigns?.[0];

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: "/rounds/[id]",
            params: {
              id: item.id,
              name: item.patient.fullName,
              mrn: item.patient.mrn,
              gender: item.patient.gender,
              dob: item.patient.dateOfBirth,
              diagnosis: item.admission?.primaryDiagnosis || "No Diagnosis",
              vitals: latestVitals ? JSON.stringify(latestVitals) : undefined,
            },
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
             <Text style={styles.avatarText}>{item.patient.fullName.charAt(0)}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.patientName} numberOfLines={1}>{item.patient.fullName}</Text>
            <Text style={styles.mrn}>MRN: {item.patient.mrn}</Text>
          </View>
          <View style={[styles.statusBadge, item.status === 'OPEN' ? styles.statusOpen : styles.statusClosed]}>
             <Text style={[styles.statusText, item.status === 'OPEN' ? styles.statusTextOpen : styles.statusTextClosed]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsContainer}>
           <View style={styles.detailRow}>
              <Ionicons name="bed-outline" size={16} color="#64748b" />
              <Text style={styles.detailText}>{location}</Text>
           </View>
           <View style={styles.detailRow}>
              <Ionicons name="medkit-outline" size={16} color="#64748b" />
              <Text style={styles.detailText} numberOfLines={1}>
                {item.admission?.primaryDiagnosis || "No Diagnosis Recorded"}
              </Text>
           </View>
        </View>

        <View style={styles.cardFooter}>
           <Text style={styles.actionText}>Tap to start round</Text>
           <Ionicons name="chevron-forward" size={16} color="#0284c7" />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
         <Text style={styles.headerTitle}>Doctor Rounds</Text>
         <Text style={styles.headerSubtitle}>My Active Patients</Text>
      </View>
      <FlatList
        data={encounters}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchRounds}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              No active patients found for your rotation.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  header: {
    backgroundColor: "#0284c7",
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 10,
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#e0f2fe",
    marginTop: 4,
    fontWeight: "500",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#64748b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0369a1",
  },
  headerText: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 2,
  },
  mrn: {
    fontSize: 12,
    color: "#64748b",
    fontFamily: "monospace", // If handled by font loading, otherwise system mono
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusOpen: {
    backgroundColor: "#dcfce7",
  },
  statusClosed: {
    backgroundColor: "#f1f5f9",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusTextOpen: {
    color: "#166534",
  },
  statusTextClosed: {
    color: "#64748b",
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginBottom: 12,
  },
  detailsContainer: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#475569",
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  actionText: {
    fontSize: 12,
    color: "#0284c7",
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 16,
    color: "#94a3b8",
    fontSize: 16,
  },
});
