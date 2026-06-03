import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { apiGet } from './apiClient';

type AdminRole = 'owner' | 'editor' | null;

interface UserProfile {
  department?: string;
  year?: string;
  semester?: string;
  preferredName?: string;
  themeAccent?: string;
  [key: string]: any;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  isOwner: boolean;
  role: AdminRole;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfileLocal: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  isAdmin: false,
  isOwner: false,
  role: null,
  isLoading: true,
  refreshProfile: async () => {},
  updateProfileLocal: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AdminRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as UserProfile);
      } else {
        setUserProfile({});
      }
    } catch (e) {
      console.error(e);
      setUserProfile({});
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Fetch user profile continuously
        unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            setUserProfile({});
          }
        }, (error) => {
          console.error("Error fetching user profile stream", error);
          setUserProfile({});
        });

        // Resolve admin role server-side (owner / editor / null). This is the
        // single source of truth for what admin UI the user may see; the server
        // re-checks on every privileged request regardless.
        try {
          const { role } = await apiGet<{ role: AdminRole }>('/api/admins/me');
          setRole(role);
        } catch (error) {
          console.error('Error checking admin role', error);
          setRole(null);
        }
      } else {
        if (unsubscribeProfile) {
          unsubscribeProfile();
        }
        setUserProfile(null);
        setRole(null);
      }
      
      setIsLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const refreshProfile = async () => {
    // If we're using onSnapshot, manual refresh might not be strictly necessary
    // but we can leave it to fetch forcefully if needed
    if (currentUser) {
      await fetchProfile(currentUser.uid);
    }
  };

  const updateProfileLocal = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => prev ? { ...prev, ...updates } : updates as UserProfile);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, isAdmin: role !== null, isOwner: role === 'owner', role, isLoading, refreshProfile, updateProfileLocal }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
