import StorageService, { OfflineAction } from './StorageService';
import api from './api'; 
import Logger from './Logger'; 
import NetInfo from '@react-native-community/netinfo';

let isSyncing = false;

const SyncService = {
  init: () => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        Logger.info('SyncService: Network online, triggering sync...');
        SyncService.sync();
      }
    });
    return unsubscribe;
  },

  sync: async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
        const isOnline = await StorageService.isOnline();
        if (!isOnline) {
            isSyncing = false;
            return;
        }

        const pendingActions = await StorageService.getPendingActions();
        if (pendingActions.length === 0) {
            isSyncing = false;
            return;
        }

        Logger.info(`SyncService: Found ${pendingActions.length} pending actions.`);

        // Process sequentially to maintain order
        for (const action of pendingActions) {
            await SyncService.processAction(action);
        }
    } catch (e) {
        Logger.error('SyncService: General sync error', e);
    } finally {
        isSyncing = false;
    }
  },

  processAction: async (action: OfflineAction) => {
    try {
      Logger.debug(`SyncService: Processing action ${action.type} (${action.id})`);
      switch (action.type) {
        case 'CREATE_NOTE':
            await api.post('/clinical-notes', action.payload);
            break;
        case 'CREATE_VITALS':
            // Payload: { encounterId, ...data }
            const { encounterId: vitalsEncId, ...vitalsData } = action.payload;
            await api.createVitals(Number(vitalsEncId), vitalsData);
            break;
        case 'ADMINISTER_MED':
            const { encounterId: medEncId, prescriptionItemId, status, notes } = action.payload;
            await api.administerMedication(Number(medEncId), Number(prescriptionItemId), status, notes);
            break;
        case 'DISPENSE_PRESCRIPTION':
            const { prescriptionId, items, notes: dispenseNotes } = action.payload;
            await api.dispensePrescription(Number(prescriptionId), items, dispenseNotes);
            break;
        case 'ADJUST_STOCK':
             const { drugItemId, quantity, type, reason } = action.payload;
             await api.adjustStock(Number(drugItemId), Number(quantity), type, reason);
             break;
        default:
            Logger.warn(`SyncService: Unknown action type ${action.type}`);
            break;
      }
      
      // Success: Remove from queue
      await StorageService.removeAction(action.id);
      Logger.info(`SyncService: Action ${action.id} processed and removed.`);

    } catch (error: any) {
      Logger.error(`SyncService: Failed to process action ${action.id}`, error);
      
      // Determine if error is permanent (4xx) or transient (5xx / Network)
      const status = error.response?.status;
      
      if (status >= 400 && status < 500) {
          // Permanent failure (e.g. Validation Error, Forbidden)
          // Move to Failed List so we don't block the queue forever
          await StorageService.saveFailedAction(action, error.message || JSON.stringify(error.response?.data));
          await StorageService.removeAction(action.id);
          Logger.warn(`SyncService: Action ${action.id} failed permanently. Moved to Failed Actions.`);
      } else {
          // Transient failure (Network, Server Error)
          // Keep in queue, will retry next sync
          Logger.info(`SyncService: Action ${action.id} failed transiently. Keeping in queue.`);
      }
    }
  }
};

export default SyncService;
