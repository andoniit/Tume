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
  Image,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "../lib/supabase";

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

function isKnownSexValue(v: string) {
  return SEX_OPTIONS.some((o) => o.value === v);
}

function labelForSex(value: string, custom?: string) {
  if (value === "self_describe") {
    return custom?.trim() ? `Self-describe: ${custom.trim()}` : "Prefer to self-describe";
  }
  const found = SEX_OPTIONS.find((o) => o.value === value);
  return found?.label ?? "Prefer not to say";
}

const signOut = async () => {
  try {
    await supabase.auth.signOut();
  } catch (e: any) {
    Alert.alert("Sign out failed", e?.message ?? "Something went wrong.");
  }
};

export default function ProfileEditScreen({
  mode, // "create" | "edit"
  onBack,
  onSaved,
}: {
  mode: "create" | "edit";
  onBack: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [nickname, setNickname] = useState("");

  const [sex, setSex] = useState<string>("prefer_not_to_say");
  const [sexCustom, setSexCustom] = useState<string>("");
  const [sexModalOpen, setSexModalOpen] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string>("");

  const previewName = useMemo(() => {
    const nn = nickname.trim();
    if (nn) return nn;
    const parts = [first.trim(), last.trim()].filter(Boolean);
    return parts.join(" ");
  }, [first, last, nickname]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const { data: s, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;
        const user = s.session?.user;
        if (!user) throw new Error("No session");

        setEmail(user.email ?? "");

        const gAvatar =
          (user.user_metadata as any)?.avatar_url ||
          (user.user_metadata as any)?.picture ||
          "";
        setGoogleAvatarUrl(typeof gAvatar === "string" ? gAvatar : "");

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("first_name,last_name,nickname,full_name,sex,avatar_url")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        setFirst(profile?.first_name ?? "");
        setLast(profile?.last_name ?? "");
        setNickname(profile?.nickname ?? "");

        const savedAvatar = (profile as any)?.avatar_url as string | null | undefined;
        if (savedAvatar) {
          setAvatarUrl(savedAvatar);
        } else if (gAvatar && typeof gAvatar === "string") {
          setAvatarUrl(gAvatar);
          await supabase.from("profiles").update({ avatar_url: gAvatar }).eq("id", user.id);
        }

        const savedSex = (profile as any)?.sex as string | null | undefined;
        if (savedSex) {
          if (isKnownSexValue(savedSex)) {
            setSex(savedSex);
            setSexCustom("");
          } else {
            setSex("self_describe");
            setSexCustom(savedSex);
          }
        } else {
          setSex("prefer_not_to_say");
          setSexCustom("");
        }

        if (!profile?.first_name && !profile?.nickname && profile?.full_name) {
          setFirst(profile.full_name);
        }
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const pickAndUploadAvatar = async () => {
    try {
      const { data: s, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;
      const user = s.session?.user;
      if (!user) throw new Error("No session");

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        throw new Error("Photo permission denied. Enable it in Settings to upload a photo.");
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (result.canceled) return;

      setUploadingAvatar(true);

      const asset = result.assets[0];

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: "base64",
      });

      const arrayBuffer = decode(base64);
      const filePath = `${user.id}/avatar.jpg`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, arrayBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const cleanPublicUrl = pub.publicUrl;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: cleanPublicUrl })
        .eq("id", user.id);

      if (profErr) throw profErr;

      setAvatarUrl(`${cleanPublicUrl}?t=${Date.now()}`);
      Alert.alert("Updated ✅", "Profile photo updated.");
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Something went wrong.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const useGoogleAvatar = async () => {
    if (!googleAvatarUrl) return;
    try {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) throw new Error("No session");

      setUploadingAvatar(true);

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: googleAvatarUrl })
        .eq("id", user.id);

      if (error) throw error;

      setAvatarUrl(`${googleAvatarUrl}?t=${Date.now()}`);
      Alert.alert("Updated ✅", "Using your Google profile photo.");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Something went wrong.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    if (!first.trim()) return Alert.alert("Missing info", "First name is required.");
    if (!nickname.trim()) return Alert.alert("Missing info", "Nickname is required.");

    try {
      setSaving(true);

      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) throw new Error("No session");

      const fullName = [first.trim(), last.trim()].filter(Boolean).join(" ");
      const sexToSave = sex === "self_describe" ? (sexCustom.trim() || "self_describe") : sex;

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: first.trim(),
          last_name: last.trim() || null,
          nickname: nickname.trim(),
          full_name: fullName || nickname.trim(),
          sex: sexToSave,
          avatar_url: avatarUrl ? avatarUrl.split("?")[0] : null,
        })
        .eq("id", user.id);

      if (error) throw error;

      onSaved();
      onBack();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          
          {/* Header */}
          <View style={styles.header}>
            {mode === "edit" ? (
              <Pressable onPress={onBack} hitSlop={20}>
                <Text style={styles.backLink}>← Back</Text>
              </Pressable>
            ) : <View />}
            <Text style={styles.title}>{mode === "create" ? "Setup Profile" : "Edit Profile"}</Text>
            {/* Invisible Spacer to balance header */}
            <View style={{width: 40}} /> 
          </View>

          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                   <Text style={{ fontSize: 32, fontWeight: "900", color: "#ccc" }}>+</Text>
                </View>
              )}
              <Pressable onPress={pickAndUploadAvatar} disabled={uploadingAvatar} style={styles.editBadge}>
                 <Text style={{ fontSize: 16 }}>📷</Text>
              </Pressable>
            </View>
            
            {uploadingAvatar && <Text style={styles.uploadingText}>Uploading...</Text>}
            
            {googleAvatarUrl && !uploadingAvatar ? (
               <Pressable onPress={useGoogleAvatar} style={{marginTop: 10}}>
                  <Text style={{color: '#3661D6', fontWeight: '700', fontSize: 13}}>Use Google Photo</Text>
               </Pressable>
            ) : null}
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            <View>
                <Text style={styles.label}>EMAIL (PRIVATE)</Text>
                <View style={[styles.input, {backgroundColor: '#f9f9f9'}]}>
                   <Text style={{color: '#888', fontWeight: '600'}}>{email || "—"}</Text>
                </View>
            </View>

            <View style={{flexDirection: 'row', gap: 12}}>
                <View style={{flex: 1}}>
                    <Text style={styles.label}>FIRST NAME</Text>
                    <TextInput 
                        value={first} 
                        onChangeText={setFirst} 
                        placeholder="Required" 
                        style={styles.input} 
                        placeholderTextColor="#ccc"
                    />
                </View>
                <View style={{flex: 1}}>
                    <Text style={styles.label}>LAST NAME</Text>
                    <TextInput 
                        value={last} 
                        onChangeText={setLast} 
                        placeholder="Optional" 
                        style={styles.input} 
                        placeholderTextColor="#ccc"
                    />
                </View>
            </View>

            <View>
                <Text style={styles.label}>NICKNAME (DISPLAY NAME)</Text>
                <TextInput 
                    value={nickname} 
                    onChangeText={setNickname} 
                    placeholder="What should we call you?" 
                    style={styles.input} 
                    placeholderTextColor="#ccc"
                />
            </View>

            <View>
                <Text style={styles.label}>GENDER</Text>
                <Pressable onPress={() => setSexModalOpen(true)} style={styles.selectInput}>
                    <Text style={{fontWeight: '700', fontSize: 16, color: '#000'}}>
                        {labelForSex(sex, sexCustom)}
                    </Text>
                    <Text style={{fontSize: 12, fontWeight: '900', color: '#ccc'}}>▼</Text>
                </Pressable>
                
                {sex === "self_describe" && (
                    <TextInput 
                        value={sexCustom} 
                        onChangeText={setSexCustom} 
                        placeholder="Please describe..." 
                        style={[styles.input, {marginTop: 10}]} 
                    />
                )}
            </View>
          </View>

          {/* Footer Actions */}
          <View style={styles.footer}>
             <Pressable onPress={save} disabled={saving || uploadingAvatar} style={styles.saveBtn}>
                 {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
             </Pressable>
             
             {mode === "edit" && (
                 <Pressable onPress={signOut} style={styles.signOutBtn}>
                     <Text style={styles.signOutText}>Sign Out</Text>
                 </Pressable>
             )}
          </View>

        </ScrollView>

        {/* Custom Modal for Sex Selection */}
        <Modal visible={sexModalOpen} transparent animationType="fade" onRequestClose={() => setSexModalOpen(false)}>
            <Pressable onPress={() => setSexModalOpen(false)} style={styles.modalOverlay}>
                <Pressable style={styles.modalContent} onPress={()=>{}}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Identity</Text>
                        <Pressable onPress={() => setSexModalOpen(false)} style={styles.closeBtn}>
                             <Text style={{fontWeight: '900', color: '#666'}}>✕</Text>
                        </Pressable>
                    </View>
                    <ScrollView contentContainerStyle={{padding: 20}}>
                        {SEX_OPTIONS.map((opt) => {
                            const isSelected = sex === opt.value;
                            return (
                                <Pressable
                                    key={opt.value}
                                    onPress={() => {
                                        setSex(opt.value);
                                        if (opt.value !== "self_describe") setSexCustom("");
                                        setSexModalOpen(false);
                                    }}
                                    style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                                >
                                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt.label}</Text>
                                    {isSelected && <Text style={{color: '#fff'}}>✓</Text>}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    container: { padding: 24, paddingBottom: 60 },
    
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 },
    backLink: { fontSize: 16, fontWeight: '700', color: '#666' },
    title: { fontSize: 24, fontWeight: '900' },
    
    avatarSection: { alignItems: 'center', marginBottom: 30 },
    avatarContainer: { width: 100, height: 100, marginBottom: 10 },
    avatarImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#f0f0f0' },
    avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f4f4f4', alignItems: 'center', justifyContent: 'center' },
    editBadge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: '#fff', padding: 8, borderRadius: 20, borderWidth: 1, borderColor: '#eee', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: {width:0, height: 2} },
    uploadingText: { fontSize: 12, fontWeight: '600', color: '#888', marginTop: 8 },

    form: { gap: 20 },
    label: { fontSize: 11, fontWeight: '800', color: '#999', marginBottom: 8, letterSpacing: 1 },
    input: { backgroundColor: '#f4f4f4', padding: 16, borderRadius: 16, fontSize: 16, fontWeight: '600', color: '#000' },
    selectInput: { backgroundColor: '#f4f4f4', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

    footer: { marginTop: 40, gap: 16 },
    saveBtn: { backgroundColor: '#000', height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    signOutBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
    signOutText: { color: '#FF3B30', fontWeight: '700', fontSize: 14 },

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