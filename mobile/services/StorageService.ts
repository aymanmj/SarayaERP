import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const KEYS = {
  ROUNDS: 'offline_rounds',
  PATIENT_PREFIX: 'offline_patient_',
  PENDING_ACTIONS: 'offline_pending_actions',
  FAILED_ACTIONS: 'offline_failed_actions',
};


export type OfflineActionType =
  | 'CREATE_NOTE'
  | 'CREATE_VITALS'
  | 'ADMINISTER_MED'
  | 'DISPENSE_PRESCRIPTION'
  | 'ADJUST_STOCK';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: any;
  timestamp: number;
}

export interface FailedAction extends OfflineAction {
  error: string;
  failedAt: number;
}

const StorageService = {
  // ... existing methods ...

  // Failed Actions
  saveFailedAction: async (action: OfflineAction, error: string) => {
    try {
      const failedAction: FailedAction = {
        ...action,
        error,
        failedAt: Date.now(),
      };
      
      const existingJson = await AsyncStorage.getItem(KEYS.FAILED_ACTIONS);
      const existing: FailedAction[] = existingJson ? JSON.parse(existingJson) : [];
      
      const updated = [...existing, failedAction];
      await AsyncStorage.setItem(KEYS.FAILED_ACTIONS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save failed action', e);
    }
  },

  getFailedActions: async () => {
    try {
      const json = await AsyncStorage.getItem(KEYS.FAILED_ACTIONS);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      return [];
    }
  },

  clearFailedActions: async () => {
    await AsyncStorage.removeItem(KEYS.FAILED_ACTIONS);
  },
  
  // Existing queue methods (ensure they use KEYS.PENDING_ACTIONS correctly reference)
  // ...
  
  // Network Check
  isOnline: async () => {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable;
  },

  // Rounds
  saveRounds: async (data: any[]) => {
    try {
      await AsyncStorage.setItem(KEYS.ROUNDS, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save rounds offline', e);
    }
  },

  getRounds: async () => {
    try {
      const json = await AsyncStorage.getItem(KEYS.ROUNDS);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.error('Failed to get offline rounds', e);
      return [];
    }
  },

  // Patient Details
  savePatientDetails: async (encounterId: number | string, data: any) => {
    try {
      await AsyncStorage.setItem(`${KEYS.PATIENT_PREFIX}${encounterId}`, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to save patient ${encounterId} offline`, e);
    }
  },

  getPatientDetails: async (encounterId: number | string) => {
    try {
      const json = await AsyncStorage.getItem(`${KEYS.PATIENT_PREFIX}${encounterId}`);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      console.error(`Failed to get offline patient ${encounterId}`, e);
      return null;
    }
  },

  // Pending Actions Queue
  queueAction: async (action: Omit<OfflineAction, 'id' | 'timestamp'>) => {
    try {
      const newAction: OfflineAction = {
        ...action,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
      };
      
      const existingJson = await AsyncStorage.getItem(KEYS.PENDING_ACTIONS);
      const existing: OfflineAction[] = existingJson ? JSON.parse(existingJson) : [];
      
      const updated = [...existing, newAction];
      await AsyncStorage.setItem(KEYS.PENDING_ACTIONS, JSON.stringify(updated));
      return newAction;
    } catch (e) {
      console.error('Failed to queue offline action', e);
      return null;
    }
  },

  getPendingActions: async () => {
    try {
      const json = await AsyncStorage.getItem(KEYS.PENDING_ACTIONS);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      return [];
    }
  },

  removeAction: async (id: string) => {
    try {
      const actions = await StorageService.getPendingActions();
      const updated = actions.filter((a: OfflineAction) => a.id !== id);
      await AsyncStorage.setItem(KEYS.PENDING_ACTIONS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to remove pending action', e);
    }
  },
  
  clearPendingActions: async () => {
      await AsyncStorage.removeItem(KEYS.PENDING_ACTIONS);
  }
};

export default StorageService;
