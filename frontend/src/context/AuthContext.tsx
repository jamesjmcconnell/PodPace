import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { Session, User, Provider } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient'; // Import initialized client

// Define the shape of the context value
interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithOAuth: (provider: Provider) => Promise<void>;
  signOut: () => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the provider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Set up listener for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('[AuthContext] Auth state changed:', _event, session);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false); // Ensure loading is false after state change handled
      }
    );

    // Cleanup listener on unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // --- Auth Methods ---

  const signInWithMagicLink = async (email: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Optional: Redirect URL after login from magic link
          // emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      // User will receive an email. UI should show a message.
      alert('Check your email for the magic link!');
    } catch (error: any) {
      console.error('Error sending magic link:', error);
      alert(`Error: ${error.error_description || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const signInWithOAuth = async (provider: Provider) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // Optional: Redirect URL after successful OAuth login
          // redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      // User will be redirected to the provider's login page.
    } catch (error: any) {
      console.error(`Error signing in with ${provider}:`, error);
      alert(`Error: ${error.error_description || error.message}`);
      setLoading(false); // Only set loading false on error, success redirects
    }
    // No finally setLoading(false) here because successful OAuth redirects away
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // State will update via onAuthStateChange listener
    } catch (error: any) {
      console.error('Error signing out:', error);
      alert(`Error: ${error.error_description || error.message}`);
      setLoading(false);
    }
    // setLoading will be handled by the onAuthStateChange listener
  };

  // Value provided by the context
  const value = {
    session,
    user,
    loading,
    signInWithMagicLink,
    signInWithOAuth,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the Auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};