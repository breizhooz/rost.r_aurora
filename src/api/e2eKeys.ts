// Client API du matériel de clés E2E (service-user, /api/v1/users/me/keys).
// Ne manipule que des charges opaques (base64) ; la crypto est dans @nutri/e2e-core.

import axios from 'axios';
import { usersClient } from './client';
import type {
  EnrollPayload,
  KeyMaterialDTO,
  RecoveryMaterialDTO,
  RotatePayload,
} from '@nutri/e2e-core';

/** Matériel pour déverrouiller par mot de passe. `null` si l'utilisateur n'est pas inscrit (404). */
export async function getKeyMaterial(): Promise<KeyMaterialDTO | null> {
  try {
    const { data } = await usersClient.get<KeyMaterialDTO>('/api/v1/users/me/keys');
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

/** Inscrit le matériel de clés (une seule fois, à l'onboarding). */
export async function enrollKeyMaterial(payload: EnrollPayload): Promise<void> {
  await usersClient.post('/api/v1/users/me/keys', payload);
}

/** Ré-enveloppe la UK après changement de mot de passe. */
export async function rotateKeyMaterial(payload: RotatePayload): Promise<void> {
  await usersClient.put('/api/v1/users/me/keys', payload);
}

/** Matériel de la voie de récupération (code de récup). */
export async function getRecoveryMaterial(): Promise<RecoveryMaterialDTO> {
  const { data } = await usersClient.get<RecoveryMaterialDTO>(
    '/api/v1/users/me/keys/recovery',
  );
  return data;
}
