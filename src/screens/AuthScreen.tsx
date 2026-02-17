// src/screens/AuthScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

// --- Logic Helper (Preserved) ---
function parseParams(urlString: string) {
  try {
    const u = new URL(urlString);
    const query: Record<string, string> = {};
    u.searchParams.forEach((v, k) => (query[k] = v));

    const fragment: Record<string, string> = {};
    if (u.hash?.startsWith("#")) {
      const hash = u.hash.slice(1);
      hash.split("&").forEach((pair) => {
        const [k, v] = pair.split("=");
        if (k) fragment[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
      });
    }
    return { query, fragment };
  } catch (e) {
    return { query: {}, fragment: {} };
  }
}

// --- Constants ---
const SEX_OPTIONS: { label: string; value: string }[] = [
  { label: "Prefer not to say", value: "prefer_not_to_say" },
  { label: "Female", value: "female" },
  { label: "Male", value: "male" },
  { label: "Intersex", value: "intersex" },
  { label: "Non-binary", value: "non_binary" },
  { label: "Agender", value: "agender" },
  { label: "Genderqueer / Gender nonconforming", value: "genderqueer_gender_nonconforming" },
  { label: "Transgender", value: "transgender" },
  { label: "Two-Spirit", value: "two_spirit" },
  { label: "Prefer to self-describe", value: "self_describe" },
];

function labelForSex(value: string, custom?: string) {
  if (value === "self_describe") {
    return custom?.trim() ? custom.trim() : "Self-describe";
  }
  const found = SEX_OPTIONS.find((o) => o.value === value);
  return found?.label ?? "Select...";
}

// --- Main Component ---
export default function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  
  // Auth Form Common
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign Up Only Fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [sex, setSex] = useState("prefer_not_to_say");
  const [sexCustom, setSexCustom] = useState("");
  const [sexModalOpen, setSexModalOpen] = useState(false);

  // --- Auth Logic ---

  const handleAuth = async () => {
    if (!email || !password) return Alert.alert("Missing fields", "Please enter email and password.");
    
    // Validate Sign Up Fields
    if (mode === "signUp") {
        if (!firstName.trim()) return Alert.alert("Required", "First name is missing.");
        if (!nickname.trim()) return Alert.alert("Required", "Nickname is missing.");
    }

    setLoading(true);
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // 1. Sign Up User
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        if (data.user) {
          // 2. Create Profile Immediately
          const sexValue = sex === "self_describe" ? (sexCustom || "self_describe") : sex;
          const { error: profError } = await supabase.from("profiles").upsert({
            id: data.user.id,
            first_name: firstName.trim(),
            last_name: lastName.trim() || null,
            nickname: nickname.trim(),
            full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            sex: sexValue,
          });
          
          if (profError) throw profError;
          
          // 3. Refresh session to ensure app knows we are logged in with profile
          await supabase.auth.refreshSession();
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setGoogleLoading(true);

      const redirectTo = AuthSession.makeRedirectUri({
        scheme: "tume",
        path: "auth-callback",
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("No OAuth URL returned.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== "success" || !result.url) return;

      const { query, fragment } = parseParams(result.url);

      if (query.code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(query.code);
        if (exErr) throw exErr;
        return;
      }

      if (fragment.access_token && fragment.refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: fragment.access_token,
          refresh_token: fragment.refresh_token,
        });
        if (setErr) throw setErr;
        return;
      }
      
      // If none of above triggered, check if session exists
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return;

      throw new Error("No code or tokens returned.");
    } catch (e: any) {
      Alert.alert("Google sign-in failed", e?.message ?? "Something went wrong.");
    } finally {
      setGoogleLoading(false);
    }
  };

  // --- Render ---
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            
            <View style={{ marginBottom: 30, marginTop: 40 }}>
                <Text style={styles.logoText}>tume.</Text>
                <Text style={styles.headerSubtitle}>
                    {mode === "signIn" ? "Welcome back to your shared space." : "Create a home for just the two of you."}
                </Text>
            </View>

            <View style={styles.form}>
                
                {/* Email/Pass (Always Visible) */}
                <View>
                    <Text style={styles.label}>EMAIL</Text>
                    <TextInput 
                        value={email} 
                        onChangeText={setEmail} 
                        autoCapitalize="none" 
                        keyboardType="email-address"
                        style={styles.input} 
                        placeholder="you@example.com"
                        placeholderTextColor="#ccc"
                    />
                </View>

                <View>
                    <Text style={styles.label}>PASSWORD</Text>
                    <TextInput 
                        value={password} 
                        onChangeText={setPassword} 
                        secureTextEntry
                        style={styles.input} 
                        placeholder="••••••••"
                        placeholderTextColor="#ccc"
                    />
                </View>

                {/* SIGN UP EXTRA FIELDS */}
                {mode === "signUp" && (
                    <>
                        <View style={{flexDirection: 'row', gap: 12}}>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>FIRST NAME</Text>
                                <TextInput value={firstName} onChangeText={setFirstName} style={styles.input} placeholder="Jane" placeholderTextColor="#ccc" />
                            </View>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>LAST NAME</Text>
                                <TextInput value={lastName} onChangeText={setLastName} style={styles.input} placeholder="Doe" placeholderTextColor="#ccc" />
                            </View>
                        </View>

                        <View>
                            <Text style={styles.label}>NICKNAME</Text>
                            <TextInput value={nickname} onChangeText={setNickname} style={styles.input} placeholder="Display Name" placeholderTextColor="#ccc" />
                        </View>

                        <View>
                            <Text style={styles.label}>GENDER</Text>
                            <Pressable onPress={() => setSexModalOpen(true)} style={styles.selectInput}>
                                <Text style={{fontWeight: '700', fontSize: 16}}>{labelForSex(sex, sexCustom)}</Text>
                                <Text style={{fontSize: 12}}>▼</Text>
                            </Pressable>
                            
                            {sex === "self_describe" && (
                                <TextInput value={sexCustom} onChangeText={setSexCustom} style={[styles.input, {marginTop: 10}]} placeholder="Please describe" />
                            )}
                        </View>
                    </>
                )}

                {/* Auth Button */}
                <Pressable onPress={handleAuth} style={styles.primaryBtn} disabled={loading || googleLoading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{mode === "signIn" ? "Sign In" : "Sign Up"}</Text>}
                </Pressable>

                {/* Divider */}
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10}}>
                    <View style={{height: 1, backgroundColor: '#eee', flex: 1}} />
                    <Text style={{color: '#ccc', fontWeight: 'bold', fontSize: 12}}>OR</Text>
                    <View style={{height: 1, backgroundColor: '#eee', flex: 1}} />
                </View>

                {/* Google Button */}
                <Pressable onPress={signInWithGoogle} style={styles.googleBtn} disabled={loading || googleLoading}>
                    {googleLoading ? (
                        <ActivityIndicator color="#000" />
                    ) : (
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                             <Text style={{fontSize: 18, fontWeight: '900', color: '#000'}}>G</Text> 
                             <Text style={styles.googleBtnText}>Continue with Google</Text>
                        </View>
                    )}
                </Pressable>

                {/* Toggle Mode */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20, paddingBottom: 40 }}>
                    <Text style={{ color: '#888', fontWeight: '600' }}>
                        {mode === "signIn" ? "New here? " : "Already have an account? "}
                    </Text>
                    <Pressable onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>
                        <Text style={{ color: '#000', fontWeight: '800' }}>
                            {mode === "signIn" ? "Create Account" : "Sign In"}
                        </Text>
                    </Pressable>
                </View>
            </View>

            {/* Sex Modal */}
            <Modal visible={sexModalOpen} transparent animationType="fade">
                <Pressable onPress={() => setSexModalOpen(false)} style={styles.modalOverlay}>
                    <Pressable style={styles.modalContent} onPress={()=>{}}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Identity</Text>
                            <Pressable onPress={() => setSexModalOpen(false)} style={styles.closeBtn}><Text style={{fontWeight: '900', color: '#666'}}>✕</Text></Pressable>
                        </View>
                        <ScrollView contentContainerStyle={{padding: 20}}>
                            {SEX_OPTIONS.map((opt) => (
                                <Pressable
                                    key={opt.value}
                                    onPress={() => { setSex(opt.value); if(opt.value!=="self_describe") setSexCustom(""); setSexModalOpen(false); }}
                                    style={[styles.optionRow, sex === opt.value && styles.optionRowSelected]}
                                >
                                    <Text style={[styles.optionText, sex === opt.value && styles.optionTextSelected]}>{opt.label}</Text>
                                    {sex === opt.value && <Text style={{color:'#fff'}}>✓</Text>}
                                </Pressable>
                            ))}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
    
    logoText: { fontSize: 48, fontWeight: '900', letterSpacing: -2, marginBottom: 10 },
    headerTitle: { fontSize: 32, fontWeight: '900', marginBottom: 10 },
    headerSubtitle: { fontSize: 16, color: '#666', lineHeight: 24, fontWeight: '500' },

    form: { gap: 20 },
    label: { fontSize: 11, fontWeight: '800', color: '#999', marginBottom: 8, letterSpacing: 1 },
    input: { backgroundColor: '#F2F2F7', padding: 18, borderRadius: 18, fontSize: 16, fontWeight: '600', color: '#000' },
    selectInput: { backgroundColor: '#F2F2F7', padding: 18, borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

    primaryBtn: { backgroundColor: '#000', height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginTop: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: {width:0, height: 4} },
    primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    googleBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
    googleBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%" },
    modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: '900' },
    closeBtn: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 16 },
    optionRow: { padding: 16, borderRadius: 12, marginBottom: 8, backgroundColor: '#f9f9f9', flexDirection: 'row', justifyContent: 'space-between' },
    optionRowSelected: { backgroundColor: '#000' },
    optionText: { fontSize: 16, fontWeight: '700', color: '#333' },
    optionTextSelected: { color: '#fff' },
});