import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../config/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  minecraft_username: string | null;
  gd_username: string | null;
  display_name: string | null;
  email: string;
  role: 'user' | 'admin';
  admin_rank: 'owner' | 'admin' | 'mod' | 'tier_tester' | null;
  ign_verified: boolean;
  accepted_terms: boolean;
  accepted_terms_at: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error?: string; profile?: Profile | null }>;
  signUp: (data: SignUpData) => Promise<{ error?: string; requiresEmailConfirmation?: boolean; email?: string }>;
  signOut: () => Promise<void>;
  acceptTerms: () => Promise<{ error?: string }>;
}

export interface SignUpData {
  minecraft_username: string;
  gd_username?: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      setProfile(data as Profile);
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (identifier: string, password: string): Promise<{ error?: string; profile?: Profile | null }> => {
    let email = identifier;

    // Se l'identificatore non contiene '@', proviamo a cercare il profilo per minecraft_username
    if (!identifier.includes('@')) {
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('email, minecraft_username, id')
        .eq('minecraft_username', identifier)
        .single();

      if (!profileError && profileRow) {
        email = (profileRow as { email: string }).email;
      } else {
        return { error: 'Utente non trovato. Usa email o Minecraft username.' };
      }
    }

    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    // Fetch esplicito del profilo dopo login
    if (signInData.user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', signInData.user.id)
        .single();
      if (profileData) {
        setProfile(profileData as Profile);
        return { profile: profileData as Profile };
      }
    }
    return {};
  };

  const signUp = async (data: SignUpData): Promise<{ error?: string; requiresEmailConfirmation?: boolean; email?: string }> => {
    // Verifica che minecraft_username non sia già preso
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('minecraft_username', data.minecraft_username)
      .single();

    if (existing) {
      return { error: 'Questo Minecraft username è già registrato.' };
    }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          minecraft_username: data.minecraft_username,
        },
      },
    });

    if (signUpError) return { error: signUpError.message };
    if (!authData.user) return { error: 'Registrazione fallita, riprova.' };

    // Supabase Auth richiede conferma email di default - indichiamo questo al chiamante
    return { requiresEmailConfirmation: true, email: data.email };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  const acceptTerms = async (): Promise<{ error?: string }> => {
    if (!user) return { error: 'Non autenticato' };
    const { error } = await supabase
      .from('profiles')
      .update({ accepted_terms: true, accepted_terms_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) return { error: error.message };
    setProfile((prev) => prev ? { ...prev, accepted_terms: true, accepted_terms_at: new Date().toISOString() } : prev);
    return {};
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, acceptTerms }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
