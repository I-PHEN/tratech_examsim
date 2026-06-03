import admin from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import appletConfig from '../../firebase-applet-config.json';
import 'dotenv/config';

let initialized = false;
let dbInstance: Firestore | null = null;

function ensureInit(): void {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin not configured: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  initialized = true;
}

export function getFirebaseAdmin(): typeof admin {
  ensureInit();
  return admin;
}

/**
 * Firestore handle for this app's data.
 *
 * Two things the default `admin.firestore()` gets wrong here:
 *  1. **Database:** the web client connects to a *named* database
 *     (`firestoreDatabaseId` in firebase-applet-config.json), not "(default)".
 *     `admin.firestore()` points at "(default)", so it silently reads/writes
 *     the wrong database — the app's users/admins docs aren't there.
 *  2. **Transport:** the Firestore Admin SDK uses gRPC by default, whose
 *     long-lived channel can wedge after the connection sits idle (this app
 *     rarely touches Admin Firestore), making the next call hang forever with
 *     no timeout. `preferRest` uses REST and avoids the stale-channel hang.
 *
 * Always use this instead of `getFirebaseAdmin().firestore()`.
 */
export function getDb(): Firestore {
  ensureInit();
  if (!dbInstance) {
    dbInstance = getFirestore(admin.app(), appletConfig.firestoreDatabaseId);
    dbInstance.settings({ preferRest: true });
  }
  return dbInstance;
}
