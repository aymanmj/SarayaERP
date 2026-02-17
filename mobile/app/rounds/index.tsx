import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import api from "../../services/api";

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
      >
        <View style={styles.cardHeader}>
          <Text style={styles.patientName}>{item.patient.fullName}</Text>
          <Text style={styles.room}>{location}</Text>
        </View>
        <Text style={styles.diagnosis}>
          {item.admission?.primaryDiagnosis || "No Diagnosis Recorded"}
        </Text>
        <Text style={styles.status}>Status: {item.status}</Text>
        <Text style={styles.actionText}>Tap to start round</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={encounters}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchRounds}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No active patients found for your rotation.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  patientName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  room: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  diagnosis: {
    fontSize: 16,
    color: "#444",
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  actionText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    color: "#666",
    fontSize: 16,
  },
});
