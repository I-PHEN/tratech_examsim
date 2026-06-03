import { useEffect, useMemo, useState, type ReactNode, type ElementType } from 'react';
import { Loader2, Users as UsersIcon, UserPlus, Activity, FileText, ArrowUpDown } from 'lucide-react';
import { apiGet, ApiError } from '../../lib/apiClient';
import { cn } from '../../lib/utils';

type Summary = { totalUsers: number; newThisWeek: number; activeLast7Days: number; totalExams: number };
type UserRow = {
  uid: string;
  email: string | null;
  name: string | null;
  department: string | null;
  year: string | null;
  semester: string | null;
  signedUpAt: string | null;
  lastSignInAt: string | null;
  emailVerified: boolean;
  sessionCount: number;
  answerCount: number;
  lastActiveAt: string | null;
};

type SortKey = 'signedUpAt' | 'lastActiveAt' | 'sessionCount' | 'answerCount';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatCard({ icon: Icon, label, value }: { icon: ElementType; label: string; value: number }) {
  return (
    <div className="bg-surface-container-low border border-border-subtle rounded-2xl p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-black text-text-primary tabular-nums">{value}</p>
        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">{label}</p>
      </div>
    </div>
  );
}

export function UserAnalytics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('signedUpAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{ summary: Summary; users: UserRow[] }>('/api/admin/analytics/users');
        setSummary(data.summary);
        setUsers(data.users);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sorted = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      let av: number;
      let bv: number;
      if (sortKey === 'sessionCount' || sortKey === 'answerCount') {
        av = a[sortKey];
        bv = b[sortKey];
      } else {
        av = a[sortKey] ? Date.parse(a[sortKey] as string) : 0;
        bv = b[sortKey] ? Date.parse(b[sortKey] as string) : 0;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [users, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-6 p-4 rounded-xl bg-danger-muted border border-danger/20 text-danger text-sm text-center">
        {error}
      </div>
    );
  }

  const Th = ({ k, children }: { k: SortKey; children: ReactNode }) => (
    <button
      onClick={() => toggleSort(k)}
      className={cn('inline-flex items-center gap-1 hover:text-text-primary transition-colors', sortKey === k && 'text-text-primary')}
    >
      {children}
      <ArrowUpDown className="w-3 h-3 opacity-60" />
    </button>
  );

  return (
    <div className="animate-in fade-in max-w-6xl mx-auto w-full mt-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={UsersIcon} label="Total users" value={summary?.totalUsers ?? 0} />
        <StatCard icon={UserPlus} label="New this week" value={summary?.newThisWeek ?? 0} />
        <StatCard icon={Activity} label="Active (7 days)" value={summary?.activeLast7Days ?? 0} />
        <StatCard icon={FileText} label="Exams taken" value={summary?.totalExams ?? 0} />
      </div>

      <div className="bg-surface-container-low border border-border-subtle rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black text-text-tertiary uppercase tracking-widest border-b border-border-subtle">
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Dept · Yr/Sem</th>
                <th className="text-left px-4 py-3"><Th k="signedUpAt">Signed up</Th></th>
                <th className="text-left px-4 py-3"><Th k="lastActiveAt">Last active</Th></th>
                <th className="text-right px-4 py-3"><Th k="sessionCount">Sessions</Th></th>
                <th className="text-right px-4 py-3"><Th k="answerCount">Answers</Th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => (
                <tr key={u.uid} className="border-b border-border-subtle/60 last:border-0 hover:bg-bg-raised/40">
                  <td className="px-4 py-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary truncate">{u.name || u.email || u.uid}</span>
                      {!u.emailVerified && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 border border-amber-500/30 rounded px-1 shrink-0">
                          unverified
                        </span>
                      )}
                    </div>
                    {u.name && u.email && <span className="text-xs text-text-tertiary truncate block">{u.email}</span>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                    {[u.department, [u.year, u.semester].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{fmtDate(u.signedUpAt)}</td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{fmtDate(u.lastActiveAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">{u.sessionCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">{u.answerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && <p className="text-center text-sm text-text-secondary py-10">No users yet.</p>}
      </div>
    </div>
  );
}
