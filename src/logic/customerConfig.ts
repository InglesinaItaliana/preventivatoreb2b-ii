import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface PricingContext {
  activeList: string;
  deliveryCost: number;
  detraction: number;
  tariffName: string; // <--- NUOVO CAMPO
}

export async function getCustomerPricingContext(userId: string, userSnapshotData?: any): Promise<PricingContext> {
  // 1. Recupera Dati Cliente
  let userData = userSnapshotData;
  if (!userData) {
    const uSnap = await getDoc(doc(db, 'users', userId));
    userData = uSnap.exists() ? uSnap.data() : {};
  }

  // 2. Recupera Settings Globali
  const settingsSnap = await getDoc(doc(db, 'settings', 'pricing'));
  const globalSettings = settingsSnap.exists() ? settingsSnap.data() : { 
    delivery_tariffs: {}, 
    active_global_default: '2026-a' 
  };

  // 3. Risoluzione LISTINO
  let activeList = globalSettings.active_global_default;
  if (userData.price_list_mode && userData.price_list_mode !== 'default') {
    activeList = userData.price_list_mode;
  }

  // 4. Risoluzione SPEDIZIONE
  // Se non c'è un codice, usiamo una stringa vuota o un default
  const tariffName = userData.delivery_tariff_code || 'Spedizione Standard';
  
  // Cerchiamo il prezzo usando il nome come chiave (es. 'Corriere Espresso')
  // Se non lo trova, prova a cercare vecchi codici o mette 0
  const deliveryCost = globalSettings.delivery_tariffs?.[tariffName] ?? 0;

  // 5. Risoluzione DETRAZIONE
  const detraction = userData.detraction_value || 0;

  return {
    activeList,
    deliveryCost,
    detraction,
    tariffName // <--- LO RESTITUIAMO
  };
}