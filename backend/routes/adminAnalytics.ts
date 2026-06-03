import { Router } from 'express';
import { asyncHandler } from '../lib/errors';
import { requireOwner } from '../lib/auth';
import { getFirebaseAdmin, getDb } from '../lib/firebase-admin';
import { retryTransient } from '../lib/retry';
import { supabase } from '../lib/supabase';

const router = Router();

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Owner-only user roster + usage. Roster comes from Firebase Auth (every
// account), enriched with the Firestore `users` profile, and joined to per-user
// usage aggregated from Supabase sessions/answers.
//
// NOTE: usage is aggregated in JS over a full read of sessions + answers. That's
// fine at the current scale; if these tables grow large, move the aggregation
// into a Postgres view / RPC.
router.get(
  '/users',
  requireOwner,
  asyncHandler(async (_req, res) => {
    const adminApp = getFirebaseAdmin();

    // 1. Roster — Firebase Auth, paginated.
    type AuthRow = {
      uid: string;
      email: string | null;
      signedUpAt: string | null;
      lastSignInAt: string | null;
      emailVerified: boolean;
    };
    const authRows: AuthRow[] = [];
    let pageToken: string | undefined;
    do {
      const page = await retryTransient(() => adminApp.auth().listUsers(1000, pageToken));
      for (const u of page.users) {
        authRows.push({
          uid: u.uid,
          email: u.email ?? null,
          signedUpAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
          lastSignInAt: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
          emailVerified: u.emailVerified,
        });
      }
      pageToken = page.pageToken;
    } while (pageToken);

    // 2. Profiles — Firestore `users`.
    const profSnap = await retryTransient(() => getDb().collection('users').get());
    const profiles = new Map<string, Record<string, unknown>>();
    profSnap.forEach((d) => profiles.set(d.id, d.data() ?? {}));

    // 3. Usage — Supabase sessions + answers, aggregated per user.
    const { data: sessions, error: sErr } = await supabase
      .from('sessions')
      .select('id, user_uid, started_at, finished_at');
    if (sErr) throw sErr;
    const { data: answers, error: aErr } = await supabase
      .from('session_answers')
      .select('session_id');
    if (aErr) throw aErr;

    type Usage = { sessionCount: number; finishedCount: number; answerCount: number; lastActiveAt: string | null };
    const usage = new Map<string, Usage>();
    const sessionUser = new Map<string, string>(); // session id -> user_uid
    const bump = (uid: string): Usage => {
      let u = usage.get(uid);
      if (!u) {
        u = { sessionCount: 0, finishedCount: 0, answerCount: 0, lastActiveAt: null };
        usage.set(uid, u);
      }
      return u;
    };

    for (const s of (sessions ?? []) as Array<{
      id: string;
      user_uid: string | null;
      started_at: string | null;
      finished_at: string | null;
    }>) {
      if (!s.user_uid) continue;
      sessionUser.set(s.id, s.user_uid);
      const u = bump(s.user_uid);
      u.sessionCount++;
      if (s.finished_at) u.finishedCount++;
      const t = s.finished_at ?? s.started_at;
      if (t && (!u.lastActiveAt || t > u.lastActiveAt)) u.lastActiveAt = t;
    }
    for (const row of (answers ?? []) as Array<{ session_id: string }>) {
      const uid = sessionUser.get(row.session_id);
      if (uid) bump(uid).answerCount++;
    }

    const users = authRows.map((a) => {
      const p = profiles.get(a.uid) ?? {};
      const u = usage.get(a.uid);
      return {
        uid: a.uid,
        email: a.email,
        name: (p.preferredName as string) ?? null,
        department: (p.department as string) ?? null,
        year: (p.year as string) ?? null,
        semester: (p.semester as string) ?? null,
        signedUpAt: a.signedUpAt,
        lastSignInAt: a.lastSignInAt,
        emailVerified: a.emailVerified,
        sessionCount: u?.sessionCount ?? 0,
        answerCount: u?.answerCount ?? 0,
        lastActiveAt: u?.lastActiveAt ?? null,
      };
    });

    const now = Date.now();
    const summary = {
      totalUsers: users.length,
      newThisWeek: users.filter((u) => u.signedUpAt && now - Date.parse(u.signedUpAt) < WEEK_MS).length,
      activeLast7Days: users.filter((u) => u.lastActiveAt && now - Date.parse(u.lastActiveAt) < WEEK_MS).length,
      totalExams: Array.from(usage.values()).reduce((n, u) => n + u.finishedCount, 0),
    };

    res.json({ summary, users });
  })
);

export default router;
