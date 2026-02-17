import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Alert,
  Share,
  TextInput,
  Animated,
  Image,
  ScrollView,
  SafeAreaView,
  StyleSheet,
} from "react-native";

import { supabase } from "../lib/supabase";
import HomeSetupScreen from "./HomeSetupScreen";
import ProfileEditScreen from "./ProfileEditScreen";
import TasksScreen from "./TasksScreen";
import NotesScreen from "./NotesScreen";
import MealPrepScreen from "./MealPrepScreen";

// --- Types ---

type Home = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string | null;
  created_by_name: string | null;
  location_text: string | null;
  created_at: string; 
};

type Profile = {
  id: string; // ✅ Added ID to fix identification issues
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  full_name: string | null;
  sex: string | null;
  avatar_url: string | null;
};

type Member = {
  user_id: string;
  profiles: Profile | null;
};

type ScreenKey = "home" | "tasks" | "notes" | "mealPrep" | "profileEdit" | "profileCreate";

type TaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  state: "pending" | "accepted" | "rejected";
  is_completed: boolean;
  assigned_to: string;
  assigned_scope?: "single" | "both" | string;
};

type NoteRow = {
  id: string;
  title: string;
  visibility: "shared" | "personal";
  updated_at: string;
};

type MealEntryRow = {
  meal: "breakfast" | "lunch" | "dinner";
  cooked: boolean;
  dishes_cleaned: boolean;
  title: string | null;
};

// --- Helpers ---

function displayNameFromProfile(p?: Profile | null) {
  return (
    p?.nickname?.trim() ||
    p?.first_name?.trim() ||
    (p?.last_name?.trim() ? p?.last_name?.trim() : "") ||
    "Partner"
  );
}

function initialsFromName(name: string) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function mondayOf(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function copyToClipboardSafe(text: string) {
  try {
    const Clipboard = require("expo-clipboard");
    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(text);
      return true;
    }
  } catch {}
  return false;
}

// --- Components ---

function AvatarBubble({ uri, label, size = 40, inverse = false }: { uri?: string | null; label: string; size?: number, inverse?: boolean }) {
  const initials = useMemo(() => initialsFromName(label), [label]);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: inverse ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.1)",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: inverse ? "rgba(255,255,255,0.2)" : "white",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontWeight: "900", fontSize: size * 0.4, color: inverse ? "#fff" : "#000" }}>{initials}</Text>
      )}
    </View>
  );
}

const QUOTES = [
  "Us is my favorite place.",
  "Same team, same dream.",
  "You + me = home.",
  "I choose you, daily.",
  "Two hearts. One home.",
  "Built on little moments.",
  "Love looks good on us.",
  "Even Mondays feel softer with you.",
];

// --- Main Screen ---

export default function HomeGateScreen() {
  const [screen, setScreen] = useState<ScreenKey>("home");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [home, setHome] = useState<Home | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  // Home card expand/collapse
  const [homeOpen, setHomeOpen] = useState(false);

  // Home edit flip
  const [editingHome, setEditingHome] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");

  const flip = useRef(new Animated.Value(0)).current;
  const loadingRef = useRef(false);

  // Dashboard previews
  const [previewTasks, setPreviewTasks] = useState<TaskRow[]>([]);
  const [previewNotes, setPreviewNotes] = useState<NoteRow[]>([]);
  const [todayMeals, setTodayMeals] = useState<Record<string, MealEntryRow>>({});

  // Love pings count
  const [loveSentToday, setLoveSentToday] = useState(0);
  const [sendingLove, setSendingLove] = useState(false);

  const frontInterpolate = flip.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });
  const backInterpolate = flip.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });
  const frontOpacity = flip.interpolate({
    inputRange: [89, 90],
    outputRange: [1, 0],
  });
  const backOpacity = flip.interpolate({
    inputRange: [89, 90],
    outputRange: [0, 1],
  });

  const quoteOfDay = useMemo(() => {
    const dayKey = Math.floor(Date.now() / 86400000);
    return QUOTES[dayKey % QUOTES.length];
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      setLoading(true);

      const { data: sessionData, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;

      const user = sessionData.session?.user;
      if (!user) throw new Error("No session.");
      
      setUserId(user.id);

      // ✅ FETCH ID in select to correctly identify 'me' vs 'partner'
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,nickname,full_name,sex,avatar_url")
        .eq("id", user.id)
        .single();

      if (pErr) throw pErr;
      setProfile(prof);

      const needsProfile = !prof?.first_name?.trim() || !prof?.nickname?.trim();
      if (needsProfile && screen !== "profileCreate") setScreen("profileCreate");

      const { data: member, error: mErr } = await supabase
        .from("space_members")
        .select("space_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mErr) throw mErr;

      if (!member?.space_id) {
        setHome(null);
        setMembers([]);
        return;
      }

      const { data: space, error: hErr } = await supabase
        .from("spaces")
        .select("id,name,invite_code,created_by,created_by_name,location_text,created_at")
        .eq("id", member.space_id)
        .single();

      if (hErr) throw hErr;
      setHome(space);

      setEditName(space.name || "");
      setEditLocation(space.location_text || "");

      const { data: sm, error: memErr } = await supabase
        .from("space_members")
        .select("user_id")
        .eq("space_id", space.id);

      if (memErr) throw memErr;

      const userIds = ((sm as any) ?? []).map((r: any) => r.user_id).filter(Boolean) as string[];

      if (!userIds.length) {
        setMembers([]);
      } else {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id,nickname,first_name,avatar_url")
          .in("id", userIds);

        if (profErr) throw profErr;

        const map = new Map<string, any>();
        (profs ?? []).forEach((p: any) => map.set(p.id, p));

        const enriched: Member[] = userIds.map((id) => ({
          user_id: id,
          profiles: map.get(id) || null,
        }));

        setMembers(enriched);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [screen]);

  useEffect(() => {
    load();
  }, [load]);

  const daysConnected = useMemo(() => {
    if (!home?.created_at) return 0;
    const ms = Date.now() - new Date(home.created_at).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }, [home?.created_at]);

  const inviteLink = useMemo(() => {
    if (!home?.invite_code) return "";
    return `tume://join?code=${home.invite_code}`;
  }, [home?.invite_code]);

  const loadDashboard = useCallback(async () => {
    if (!home) return;

    try {
      const { data: tData } = await supabase
        .from("tasks")
        .select("id,title,due_at,state,is_completed,assigned_to,assigned_scope")
        .eq("space_id", home.id)
        .eq("is_completed", false)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(3);

      setPreviewTasks((tData as any) ?? []);

      const { data: nData } = await supabase
        .from("notes")
        .select("id,title,visibility,updated_at")
        .eq("space_id", home.id)
        .eq("visibility", "shared")
        .order("updated_at", { ascending: false })
        .limit(3);

      setPreviewNotes((nData as any) ?? []);

      const today = new Date();
      const weekStart = mondayOf(today);
      const weekISO = fmtISODate(weekStart);

      const { data: w } = await supabase
        .from("meal_weeks")
        .select("id")
        .eq("space_id", home.id)
        .eq("week_start", weekISO)
        .maybeSingle();

      if (!w?.id) {
        setTodayMeals({});
      } else {
        const dayIndex = (() => {
          const d = new Date();
          const js = d.getDay();
          return js === 0 ? 6 : js - 1; 
        })();

        const { data: eData } = await supabase
          .from("meal_entries")
          .select("meal,title,cooked,dishes_cleaned")
          .eq("week_id", w.id)
          .eq("day_index", dayIndex);

        const map: Record<string, MealEntryRow> = {};
        ((eData as any) ?? []).forEach((r: any) => {
          map[r.meal] = r;
        });
        setTodayMeals(map);
      }

      if (userId) {
        const { count } = await supabase
          .from("love_pings")
          .select("id", { head: true, count: "exact" })
          .eq("space_id", home.id)
          .eq("sender_id", userId)
          .gte("created_at", startOfTodayISO());

        setLoveSentToday(count ?? 0);
      }
    } catch {
      // ignore
    }
  }, [home, userId]);

  useEffect(() => {
    if (!home) return;
    loadDashboard();
  }, [home, loadDashboard, screen]);

  // Actions
  const copyInviteCode = async () => {
    if (!home?.invite_code) return;
    const ok = await copyToClipboardSafe(home.invite_code);
    if (ok) Alert.alert("Copied ✅", "Invite code copied to clipboard.");
    else Alert.alert("Copy failed", "Please install expo-clipboard.");
  };

  const shareInvite = async () => {
    if (!home?.invite_code) return;
    const message = `🏡 Join my Tume!\n\nInvite code: ${home.invite_code}\nLink: ${inviteLink}`;
    await Share.share({ message });
  };

  const flipToEdit = () => {
    setEditingHome(true);
    Animated.timing(flip, { toValue: 180, duration: 320, useNativeDriver: true }).start();
  };

  const flipBack = () => {
    Animated.timing(flip, { toValue: 0, duration: 320, useNativeDriver: true }).start(() =>
      setEditingHome(false)
    );
  };

  const saveHomeEdits = async () => {
    if (!home) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from("spaces")
        .update({
          name: editName.trim() || home.name,
          location_text: editLocation.trim() || null,
        })
        .eq("id", home.id);

      if (error) throw error;
      await load();
      await loadDashboard();
      flipBack();
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const leaveHome = async () => {
    if (!home || !userId) return;
    Alert.alert("Leave Home?", "You can re-join later using the invite code.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            const { error } = await supabase
              .from("space_members")
              .delete()
              .eq("space_id", home.id)
              .eq("user_id", userId);
            if (error) throw error;
            await load();
          } catch (e: any) {
            Alert.alert("Leave failed", e?.message ?? "Something went wrong.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const sendLovePing = async () => {
    if (!home) return;
    if (sendingLove) return;
    try {
      setSendingLove(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return Alert.alert("Error", "Not signed in.");

      const { data, error } = await supabase.functions.invoke("send-love", {
        body: { space_id: home.id },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) return Alert.alert("Send failed", error.message);
      if (!data?.ok && data?.reason === "LIMIT_REACHED") {
        await loadDashboard();
        return Alert.alert("Limit reached", "You can send this 2 times per day 💌");
      }
      Alert.alert("Sent 💌", "Your partner will get a notification.");
      await loadDashboard();
    } catch (e: any) {
      Alert.alert("Send failed", e?.message ?? "Something went wrong.");
    } finally {
      setSendingLove(false);
    }
  };

  const renderContent = () => {
    if (loading) return <View style={styles.center}><ActivityIndicator color="#000" /></View>;
    if (!home) return <HomeSetupScreen onDone={load} />;
    
    if (screen === "profileEdit") return <ProfileEditScreen onBack={() => setScreen("home")} onSaved={load} mode={"edit"} />;
    if (screen === "profileCreate") return <ProfileEditScreen onBack={() => setScreen("home")} onSaved={load} mode={"create"} />;
    if (screen === "tasks") return <TasksScreen spaceId={home.id} members={members} onBack={() => setScreen("home")} />;
    if (screen === "notes") return <NotesScreen spaceId={home.id} members={members} onBack={() => setScreen("home")} />;
    if (screen === "mealPrep") return <MealPrepScreen spaceId={home.id} members={members} onBack={() => setScreen("home")} />;

    // --- DASHBOARD ---
    
    // ✅ Identify Me and Partner correctly using userId
    const me = members.find(m => m.user_id === userId);
    const partner = members.find(m => m.user_id !== userId);
    
    // Use fallback if me is somehow undefined (shouldn't happen with load logic)
    const myName = me ? displayNameFromProfile(me.profiles) : "You";
    const partnerName = partner ? displayNameFromProfile(partner.profiles) : "Partner";

    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120, gap: 20 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
           <View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 1, marginBottom: 4 }}>WELCOME HOME</Text>
              <Text style={{ fontSize: 32, fontWeight: '900', letterSpacing: -1 }}>{home.name}</Text>
           </View>
           <Pressable onPress={() => setScreen("profileEdit")}>
              <AvatarBubble uri={profile?.avatar_url} label={myName} size={48} />
           </Pressable>
        </View>

        {/* Quote */}
        <View style={styles.quotePill}>
           <Text style={{ fontWeight: '700', fontSize: 13, color: '#666' }}>"{quoteOfDay}"</Text>
        </View>

        {/* Hero Card: Connection */}
        <View style={styles.heroCard}>
           <View>
              <Text style={{ color: '#fff', fontSize: 56, fontWeight: '900', lineHeight: 60 }}>{daysConnected}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>DAYS CONNECTED</Text>
           </View>
           
           {/* ✅ Showing BOTH Avatars */}
           <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
               <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    {/* Partner Avatar (Right) */}
                    <View style={{zIndex: 1}}>
                       <AvatarBubble uri={partner?.profiles?.avatar_url} label={partnerName} size={48} inverse />
                       <Text style={{color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 4}}>{partner ? partnerName : "Invite"}</Text>
                    </View>
                    
                    {/* My Avatar (Left, slightly behind or next to) */}
                    <View style={{marginLeft: -15, opacity: 0.6, transform: [{scale: 0.8}]}}>
                        <AvatarBubble uri={me?.profiles?.avatar_url} label={myName} size={48} inverse />
                    </View>
               </View>
           </View>
        </View>

        {/* Love Button */}
        <Pressable 
          onPress={sendLovePing}
          disabled={sendingLove || loveSentToday >= 2}
          style={[styles.loveBtn, (sendingLove || loveSentToday >= 2) && {opacity: 0.6}]}
        >
             <Text style={{fontSize: 24}}>💌</Text>
             <View style={{flex: 1}}>
                 <Text style={{fontWeight: '900', fontSize: 16}}>Send Love</Text>
                 <Text style={{fontSize: 12, opacity: 0.7}}>Sent {Math.min(loveSentToday, 2)}/2 today</Text>
             </View>
             <Text style={{fontWeight: '900', fontSize: 20}}>→</Text>
        </Pressable>

        {/* Modules Grid */}
        <View style={{gap: 16}}>
            <Text style={styles.sectionTitle}>YOUR HOME</Text>
            
            <View style={{flexDirection: 'row', gap: 16}}>
                {/* Tasks Module */}
                <Pressable onPress={() => setScreen("tasks")} style={[styles.moduleCard, {backgroundColor: '#3661D6', flex: 1}]}>
                    <View style={styles.iconCircle}><Text style={{fontSize: 20}}>✓</Text></View>
                    <View>
                        <Text style={{color: '#fff', fontSize: 20, fontWeight: '900'}}>Tasks</Text>
                        <Text style={{color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginTop: 4}}>
                            {previewTasks.length} upcoming
                        </Text>
                    </View>
                </Pressable>

                {/* Meals Module */}
                <Pressable onPress={() => setScreen("mealPrep")} style={[styles.moduleCard, {backgroundColor: '#EE6B4D', flex: 1}]}>
                    <View style={styles.iconCircle}><Text style={{fontSize: 20}}>🍳</Text></View>
                    <View>
                        <Text style={{color: '#fff', fontSize: 20, fontWeight: '900'}}>Meals</Text>
                        <Text style={{color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginTop: 4}}>
                           Plan today
                        </Text>
                    </View>
                </Pressable>
            </View>

            {/* Notes Module */}
            <Pressable onPress={() => setScreen("notes")} style={[styles.moduleCard, {backgroundColor: '#E0Dbf0', height: 100, flexDirection: 'row', alignItems: 'center', padding: 20}]}>
                 <View style={[styles.iconCircle, {backgroundColor: 'rgba(0,0,0,0.05)', marginBottom: 0, marginRight: 16}]}>
                     <Text style={{fontSize: 20}}>📝</Text>
                 </View>
                 <View>
                     <Text style={{color: '#1C1C1E', fontSize: 20, fontWeight: '900'}}>Notes</Text>
                     <Text style={{color: 'rgba(28,28,30,0.6)', fontSize: 12, fontWeight: '700'}}>
                        {previewNotes.length > 0 ? previewNotes[0].title : "No notes yet"}
                     </Text>
                 </View>
            </Pressable>
        </View>

        {/* Home Settings / Info (Flippable) */}
        <Pressable onPress={() => setHomeOpen(!homeOpen)}>
            <View style={[styles.card, {backgroundColor: '#E9F588', minHeight: 120}]}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20}}>
                    <Text style={{fontSize: 12, fontWeight: '900', opacity: 0.5, letterSpacing: 1}}>HOME SETTINGS</Text>
                    <Text style={{fontSize: 20}}>⚙️</Text>
                </View>

                {!homeOpen ? (
                     <View>
                         <Text style={{fontSize: 24, fontWeight: '900'}}>{home.name}</Text>
                         <Text style={{fontWeight: '700', opacity: 0.6}}>{home.location_text || "No location set"}</Text>
                         <Text style={{marginTop: 10, fontSize: 12, fontWeight: '900', opacity: 0.4}}>Tap to edit details ▼</Text>
                     </View>
                ) : (
                    <View style={{ height: editingHome ? 240 : 200 }}>
                        {/* FRONT */}
                        <Animated.View style={{ position: "absolute", width: "100%", height: "100%", opacity: frontOpacity, transform: [{ rotateY: frontInterpolate }], backfaceVisibility: "hidden" }}>
                            <Text style={{fontSize: 12, fontWeight: '900', opacity: 0.5, marginBottom: 4}}>INVITE CODE</Text>
                            <Pressable onPress={copyInviteCode} style={{backgroundColor: 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 12, marginBottom: 16}}>
                                <Text style={{fontSize: 24, fontWeight: '900', letterSpacing: 2, textAlign: 'center'}}>{home.invite_code}</Text>
                            </Pressable>
                            
                            <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
                                <Pressable onPress={flipToEdit} style={styles.actionBtn}><Text style={styles.actionBtnText}>Edit</Text></Pressable>
                                <Pressable onPress={shareInvite} style={styles.actionBtn}><Text style={styles.actionBtnText}>Share</Text></Pressable>
                            </View>
                            <Pressable onPress={leaveHome} style={[styles.actionBtn, {backgroundColor: 'rgba(0,0,0,0.05)'}]}><Text style={styles.actionBtnText}>Leave Home</Text></Pressable>
                        </Animated.View>

                        {/* BACK */}
                        <Animated.View style={{ position: "absolute", width: "100%", height: "100%", opacity: backOpacity, transform: [{ rotateY: backInterpolate }], backfaceVisibility: "hidden" }}>
                             <Text style={{fontSize: 16, fontWeight: '900', marginBottom: 10}}>Edit Details</Text>
                             <TextInput value={editName} onChangeText={setEditName} placeholder="Home Name" style={styles.input} />
                             <TextInput value={editLocation} onChangeText={setEditLocation} placeholder="Location" style={styles.input} />
                             
                             <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
                                 <Pressable onPress={saveHomeEdits} style={[styles.actionBtn, {backgroundColor: '#000'}]}><Text style={[styles.actionBtnText, {color: '#fff'}]}>Save</Text></Pressable>
                                 <Pressable onPress={flipBack} style={styles.actionBtn}><Text style={styles.actionBtnText}>Cancel</Text></Pressable>
                             </View>
                        </Animated.View>
                    </View>
                )}
            </View>
        </Pressable>

      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <SafeAreaView style={{ flex: 1 }}>
        {renderContent()}
      </SafeAreaView>
      {/* Floating Bottom Nav */}
      {screen === 'home' && (
         <View style={styles.navContainer}>
             <View style={styles.navBar}>
                 {[
                     {id: 'home', icon: '⌂'}, 
                     {id: 'tasks', icon: '✓'}, 
                     {id: 'mealPrep', icon: '🍳'}, 
                     {id: 'notes', icon: '📝'}
                 ].map(item => (
                     <Pressable key={item.id} onPress={() => setScreen(item.id as ScreenKey)} style={styles.navItem}>
                         <Text style={{fontSize: 24, color: item.id === 'home' ? '#fff' : '#666'}}>{item.icon}</Text>
                         {item.id === 'home' && <View style={{position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff'}} />}
                     </Pressable>
                 ))}
             </View>
         </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: { borderRadius: 32, padding: 24 },
    
    heroCard: { backgroundColor: '#1C1C1E', borderRadius: 32, padding: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    quotePill: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f4f4f4', marginBottom: 10 },
    
    loveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFD6E0', padding: 20, borderRadius: 24, gap: 16 },
    
    sectionTitle: { fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 1, marginLeft: 4 },
    
    moduleCard: { borderRadius: 32, padding: 20, height: 160, justifyContent: 'space-between' },
    iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },

    // Edit Inputs
    input: { backgroundColor: '#fff', padding: 12, borderRadius: 12, fontSize: 16, fontWeight: '600', marginBottom: 8 },
    actionBtn: { flex: 1, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    actionBtnText: { fontWeight: '800' },

    // Nav
    navContainer: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center' },
    navBar: { flexDirection: 'row', backgroundColor: '#1C1C1E', padding: 6, borderRadius: 32, gap: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: {width: 0, height: 5} },
    navItem: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});