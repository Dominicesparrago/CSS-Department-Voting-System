import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from './firebase/init';
import type { AppConfig } from './types';

/**
 * App-wide policy flags at config/app. Publicly readable; only the superadmin
 * writes them. Absence of the doc (or a failed read) means "defaults" so the
 * public site never breaks on config problems.
 */

export const DEFAULT_APP_CONFIG: AppConfig = {
  allowGuestVoters: true,
  maintenanceMode: false,
};

function toConfig(data: Partial<AppConfig> | undefined): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    ...data,
    allowGuestVoters: data?.allowGuestVoters !== false,
    maintenanceMode: data?.maintenanceMode === true,
  };
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const snapshot = await getDoc(doc(getFirebaseDb(), 'config', 'app'));
    return toConfig(snapshot.exists() ? (snapshot.data() as Partial<AppConfig>) : undefined);
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}

export function watchAppConfig(onChange: (config: AppConfig) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    doc(getFirebaseDb(), 'config', 'app'),
    (snapshot) => onChange(toConfig(snapshot.exists() ? (snapshot.data() as Partial<AppConfig>) : undefined)),
    (error) => onError?.(error),
  );
}
