import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function PatientDetailScreen() {
  const params = useLocalSearchParams();
  const { id, name, diagnosis, gender, dob, vitals } = params;

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
        <Text style={styles.sectionTitle}>Doctor Notes</Text>
        <Text style={styles.notes}>{patientDetails.notes}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
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
  }
});
