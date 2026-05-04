import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  isAdmin: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Check if admin
        try {
          const adminDoc = await getDoc(doc(db, 'admins', user.uid));
          setIsAdmin(adminDoc.exists() || user.email === 'iphhennom@gmail.com');
        } catch (error) {
          console.error("Error checking admin status", error);
          setIsAdmin(user.email === 'iphhennom@gmail.com');
        }
      } else {
        setIsAdmin(false);
      }
      
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isAdmin, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
