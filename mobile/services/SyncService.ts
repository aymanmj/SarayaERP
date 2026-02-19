import StorageService, { OfflineAction } from './StorageService';
import api from './api'; 
import Logger from './Logger'; 

const SyncService = {
  sync: async () => {
    const isOnline = await StorageService.isOnline();
    if (!isOnline) return;

    const pendingActions = await StorageService.getPendingActions();
    if (pendingActions.length === 0) return;

    if (pendingActions.length === 0) return;

    Logger.info(`SyncService: Found ${pendingActions.length} pending actions.`);

    for (const action of pendingActions) {
      await SyncService.processAction(action);
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
      // If successful (no error thrown), remove from queue
      await StorageService.removeAction(action.id);
      Logger.info(`SyncService: Action ${action.id} processed and removed.`);
    } catch (error) {
      Logger.error(`SyncService: Failed to process action ${action.id}`, error);
      // Simple strategy: keep in queue for retry
    }
  }
};

export default SyncService;
