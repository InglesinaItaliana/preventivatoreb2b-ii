
import { auth, functions, db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Recupera l'ID cliente di Fatture in Cloud dal profilo dell'utente.
 * @param user L'oggetto utente di Firebase.
 * @returns L'ID del cliente o null se non trovato.
 */
export const getFicClientId = async (user: User): Promise<string | null> => {
  try {
    const userProfileRef = doc(db, 'users', user.uid);
    const userProfileSnap = await getDoc(userProfileRef);
    if (userProfileSnap.exists()) {
      return userProfileSnap.data()?.ficId || null;
    }
  } catch (e) {
    console.error("Error fetching FIC client ID:", e);
  }
  return null;
};


/**
 * Recupera i dati di un cliente da Fatture in Cloud tramite una Cloud Function.
 * @param clientId L'ID del cliente su Fatture in Cloud.
 * @param companyId L'ID dell'azienda su Fatture in Cloud.
 * @returns I dati del cliente o null in caso di errore.
 */
export const getClientFromFattureInCloud = async (clientId: string, companyId: string) => {
  if (!clientId || !companyId) {
    console.error("Client ID or Company ID is missing for FIC API call.");
    return null;
  }
  try {
    const getFicClient = httpsCallable(functions, 'getFicClient');
    const result = await getFicClient({ clientId, companyId });
    return result.data;
  } catch (error) {
    console.error("Errore nella chiamata alla Cloud Function per Fatture in Cloud:", error);
    return null;
  }
};
