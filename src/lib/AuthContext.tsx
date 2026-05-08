import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

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
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfileLocal: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  isAdmin: false,
  isLoading: true,
  refreshProfile: async () => {},
  updateProfileLocal: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Fetch user profile
        await fetchProfile(user.uid);

        // Check if admin
        try {
          const adminDoc = await getDoc(doc(db, 'admins', user.uid));
          setIsAdmin(adminDoc.exists() || user.email === 'iphhennom@gmail.com');
        } catch (error) {
          console.error("Error checking admin status", error);
          setIsAdmin(user.email === 'iphhennom@gmail.com');
        }
      } else {
        setUserProfile(null);
        setIsAdmin(false);
      }
      
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (currentUser) {
      await fetchProfile(currentUser.uid);
    }
  };

  const updateProfileLocal = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => prev ? { ...prev, ...updates } : updates as UserProfile);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, isAdmin, isLoading, refreshProfile, updateProfileLocal }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
