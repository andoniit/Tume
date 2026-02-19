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
  StyleSheet,
  StatusBar,
  Platform,
  UIManager,
  Dimensions,
  Easing
} from "react-native";

// --- Expo UI Native Materials ---
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import * as Haptics from 'expo-haptics';
import { supabase } from "../lib/supabase";
import HomeSetupScreen from "./HomeSetupScreen";
import ProfileEditScreen from "./ProfileEditScreen";
import TasksScreen from "./TasksScreen";
import NotesScreen from "./NotesScreen";
import MealPrepScreen from "./MealPrepScreen";
import AiTestScreen from "./AiTestScreen";
import VoiceAiTestScreen from "./VoiceAiTestScreen";

// --- Import Custom SVGs ---
import HomeIcon from '../../assets/icons/home.svg';
import TasksIcon from '../../assets/icons/tasks.svg';
import MealIcon from '../../assets/icons/cooking-pot.svg';
import NotesIcon from '../../assets/icons/notes.svg';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  id: string;
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

type ScreenKey = "home" | "tasks" | "notes" | "mealPrep" | "profileEdit" | "profileCreate" | "aiTest" | "voiceAi";

type TaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  state: "pending" | "accepted" | "rejected";
  is_completed: boolean;
  assigned_to: string;
};

type NoteRow = {
  id: string;
  title: string;
  visibility: "shared" | "personal";
  updated_at: string;
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

// --- Animated Counter ---
function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const duration = 2000; 
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.floor(ease * value));
      if (progress < 1) requestAnimationFrame(animate);
      else setDisplayValue(value);
    };
    requestAnimationFrame(animate);
  }, [value]);

  return <Text style={{ color: '#fff', fontSize: 56, fontWeight: '900', lineHeight: 60 }}>{displayValue}</Text>;
}

// --- Floating Nav ---
const TABS: { id: ScreenKey; Icon: any; label: string }[] = [
  { id: 'home', Icon: HomeIcon, label: 'Home' },
  { id: 'tasks', Icon: TasksIcon, label: 'Tasks' },
  { id: 'mealPrep', Icon: MealIcon, label: 'Meals' },
  { id: 'notes', Icon: NotesIcon, label: 'Notes' }
];

function FloatingNavBar({ active, onChange }: { active: string, onChange: (key: ScreenKey) => void }) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const tabWidth = layoutWidth > 0 ? (layoutWidth - 12) / TABS.length : 0;

  useEffect(() => {
    const activeIndex = TABS.findIndex(t => t.id === active);
    if (activeIndex !== -1 && tabWidth > 0) {
      Animated.spring(translateX, {
        toValue: (activeIndex * tabWidth) + 6,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
      }).start();
    }
  }, [active, tabWidth]);

  return (
    <View style={styles.navWrapper}>
      <View style={styles.navContainer} onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}>
        
        {/* Apple Native Liquid Glass using Expo's systemThinMaterialLight */}
        <BlurView 
            intensity={100} 
            tint="systemThinMaterialLight" 
            style={StyleSheet.absoluteFill} 
        />
        {/* Crisp outer light border to mimic edge refraction */}
        <View style={[StyleSheet.absoluteFill, { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 40 }]} />

        {/* Active Pill */}
        {tabWidth > 0 && (
          <Animated.View 
            style={[
              styles.navPill, 
              { 
                width: tabWidth, 
                transform: [{ translateX }],
                overflow: 'hidden',
              }
            ]}
          >
             {/* Base Purple Gradient */}
             <LinearGradient 
                colors={['#8A73FF', '#6A4DFF']} 
                style={StyleSheet.absoluteFill} 
             />
             {/* 3D Gloss Highlight (top half) */}
             <LinearGradient
                colors={['rgba(255,255,255,0.5)', 'transparent']}
                locations={[0, 0.4]}
                style={StyleSheet.absoluteFill}
             />
             {/* Frosted inner edge border */}
             <View style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 30 }]} />
          </Animated.View>
        )}

        {/* Tab Items */}
        <View style={styles.navItemsRow}>
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
              <Pressable 
                key={tab.id} 
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
                    onChange(tab.id);
                }} 
                style={styles.navItem}
              >
                <tab.Icon 
                  width={24} 
                  height={24} 
                  color={isActive ? '#ffffff' : '#8E8E93'} 
                />
                {isActive && (
                  <Animated.Text style={styles.navLabel}>{tab.label}</Animated.Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// --- Main Screen ---
export default function HomeGateScreen() {
  const [screen, setScreen] = useState<ScreenKey>("home");
  const [prevScreen, setPrevScreen] = useState<ScreenKey>("home"); 

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [home, setHome] = useState<Home | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  
  // Animation Values
  const scrollY = useRef(new Animated.Value(0)).current;
  const profileOpenAnim = useRef(new Animated.Value(0)).current; 
  
  // Header State Animation (0 = Home/Logo Mode, 1 = SubPage/Title Mode)
  const headerStateAnim = useRef(new Animated.Value(0)).current;

  // Home flip
  const [homeOpen, setHomeOpen] = useState(false);
  const [editingHome, setEditingHome] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const flip = useRef(new Animated.Value(0)).current;
  
  const loadingRef = useRef(false);
  const [previewTasks, setPreviewTasks] = useState<TaskRow[]>([]);
  const [previewNotes, setPreviewNotes] = useState<NoteRow[]>([]);

  // Flip Interpolations
  const frontInterpolate = flip.interpolate({ inputRange: [0, 180], outputRange: ["0deg", "180deg"] });
  const backInterpolate = flip.interpolate({ inputRange: [0, 180], outputRange: ["180deg", "360deg"] });
  const frontOpacity = flip.interpolate({ inputRange: [89, 90], outputRange: [1, 0] });
  const backOpacity = flip.interpolate({ inputRange: [89, 90], outputRange: [0, 1] });

  const QUOTES = ["Us is my favorite place.", "Same team, same dream.", "You + me = home.", "I choose you, daily."];
  const quoteOfDay = useMemo(() => QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length], []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;
      
      setUserId(user.id);
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(prof);
      if ((!prof?.first_name || !prof?.nickname) && screen !== "profileCreate") setScreen("profileCreate");

      const { data: member } = await supabase.from("space_members").select("space_id").eq("user_id", user.id).maybeSingle();
      if (!member?.space_id) { setHome(null); setMembers([]); return; }

      const { data: space } = await supabase.from("spaces").select("*").eq("id", member.space_id).single();
      setHome(space);
      setEditName(space.name || "");
      setEditLocation(space.location_text || "");

      const { data: sm } = await supabase.from("space_members").select("user_id").eq("space_id", space.id);
      const userIds = ((sm as any) ?? []).map((r: any) => r.user_id);
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", userIds);
        const map = new Map(); (profs ?? []).forEach((p: any) => map.set(p.id, p));
        setMembers(userIds.map((id: string) => ({ user_id: id, profiles: map.get(id) || null })));
      }
    } catch (e) { Alert.alert("Error", "Failed to load home."); } 
    finally { setLoading(false); loadingRef.current = false; }
  }, [screen]);

  useEffect(() => { load(); }, [load]);

  const daysConnected = useMemo(() => {
    if (!home?.created_at) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(home.created_at).getTime()) / 86400000));
  }, [home?.created_at]);

  const loadDashboard = useCallback(async () => {
    if (!home) return;
    try {
      const { data: tData } = await supabase.from("tasks").select("*").eq("space_id", home.id).eq("is_completed", false).limit(3);
      setPreviewTasks((tData as any) ?? []);
      const { data: nData } = await supabase.from("notes").select("*").eq("space_id", home.id).limit(1);
      setPreviewNotes((nData as any) ?? []);
    } catch {}
  }, [home]);

  useEffect(() => { if (home) loadDashboard(); }, [home, loadDashboard, screen]);

  // Actions
  const copyInviteCode = async () => { if (home?.invite_code) await copyToClipboardSafe(home.invite_code); };
  const shareInvite = async () => { if (home?.invite_code) await Share.share({ message: `Join my Tume: ${home.invite_code}` }); };
  
  const flipToEdit = () => { setEditingHome(true); Animated.timing(flip, { toValue: 180, duration: 320, useNativeDriver: true }).start(); };
  const flipBack = () => { Animated.timing(flip, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => setEditingHome(false)); };
  
  const saveHomeEdits = async () => {
    if (!home) return;
    const { error } = await supabase.from("spaces").update({ name: editName, location_text: editLocation }).eq("id", home.id);
    if (!error) { await load(); flipBack(); }
  };

  const leaveHome = async () => {
    if (!home || !userId) return;
    const { error } = await supabase.from("space_members").delete().eq("space_id", home.id).eq("user_id", userId);
    if (!error) await load();
  };

  // --- TRANSITION LOGIC ---
  useEffect(() => {
    if (screen === 'home') {
        Animated.spring(headerStateAnim, { 
            toValue: 0, 
            useNativeDriver: true, 
            friction: 8, 
            tension: 40 
        }).start();
    } else if (screen !== 'profileEdit' && screen !== 'profileCreate') {
        Animated.spring(headerStateAnim, { 
            toValue: 1, 
            useNativeDriver: true, 
            friction: 8, 
            tension: 40 
        }).start();
    }
  }, [screen]);

  const openProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
    setPrevScreen(screen); 
    setScreen('profileEdit');
    profileOpenAnim.setValue(0);
    Animated.spring(profileOpenAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 50
    }).start();
  };

  const closeProfile = () => {
    Animated.timing(profileOpenAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.ease)
    }).start(() => setScreen(prevScreen)); 
  };

  const me = members.find(m => m.user_id === userId);
  const partner = members.find(m => m.user_id !== userId);
  const myName = me ? displayNameFromProfile(me.profiles) : "You";
  const partnerName = partner ? displayNameFromProfile(partner.profiles) : "Partner";

  // --- Animations ---
  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  const logoScale = headerStateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.55] 
  });
  
  const logoTranslateY = headerStateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -36] 
  });
  
  const logoTranslateX = headerStateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -26] 
  });

  const titleTranslateY = headerStateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 2] 
  });
  const titleOpacity = headerStateAnim.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0, 0, 1] 
  });

  const scale = profileOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] });
  const translateX = profileOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_WIDTH/2 - 48, 0] });
  const translateY = profileOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [-(SCREEN_HEIGHT/2 - 80), 0] });
  const overlayRadius = profileOpenAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [200, 50, 0] });
  const overlayOpacity = profileOpenAnim.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] });

  const backdropOpacity = profileOpenAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.65] 
  });

  const getPageTitle = () => {
      const activeScreen = screen === 'profileEdit' ? prevScreen : screen;
      switch(activeScreen) {
          case 'tasks': return "Tasks";
          case 'notes': return "Notes";
          case 'mealPrep': return "Meals";
          case "voiceAi": return "Voice AI";
          default: return "";
      }
  };

  const renderCurrentScreen = () => {
    if (loading && !home) return <View style={styles.center}><ActivityIndicator color="#000" /></View>;
    if (!home) return <HomeSetupScreen onDone={load} />;
    if (screen === "profileCreate") return <ProfileEditScreen onBack={() => setScreen("home")} onSaved={load} mode={"create"} />;
    if (screen === "aiTest") return <AiTestScreen spaceId={home.id} onBack={() => setScreen("home")} />;

    switch (screen) {
        case "tasks": return <TasksScreen spaceId={home.id} members={members} onBack={() => setScreen("home")} />;
        case "notes": return <NotesScreen spaceId={home.id} members={members} onBack={() => setScreen("home")} />;
        case "mealPrep": return <MealPrepScreen spaceId={home.id} members={members} onBack={() => setScreen("home")} />;
        case "voiceAi": return <VoiceAiTestScreen />;
        
        case "home":
        default:
            return (
                <View style={{flex: 1}}>
                  <Animated.ScrollView 
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ 
                        paddingHorizontal: 24, 
                        paddingBottom: 150, 
                        paddingTop: 140, 
                        gap: 20 
                    }} 
                    showsVerticalScrollIndicator={false}
                  >
                      {/* Welcome */}
                      <View style={{ marginTop: 0, marginBottom: 10 }}>
                          <Text style={styles.subLabel}>WELCOME TO</Text>
                          <Text style={styles.heroTitle}>{home.name.toUpperCase()}</Text>
                      </View>
                      <Pressable onPress={() => setScreen("aiTest")} style={{ padding: 12, borderWidth: 2, borderRadius: 12 }}>
                        <Text style={{ fontWeight: "900" }}>Open AI Test</Text>
                      </Pressable>
                      
                      <View style={styles.quotePill}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: '#666' }}>"{quoteOfDay}"</Text>
                      </View>

                      {/* Hero Card */}
                      <View style={styles.heroCard}>
                        <View>
                            <AnimatedCounter value={daysConnected} />
                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>DAYS CONNECTED</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={{zIndex: 1}}>
                                <AvatarBubble uri={partner?.profiles?.avatar_url} label={partnerName} size={48} inverse />
                                <Text style={{color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 4}}>{partner ? partnerName : "Invite"}</Text>
                              </View>
                              <View style={{marginLeft: -15, opacity: 0.6, transform: [{scale: 0.8}]}}>
                                  <AvatarBubble uri={me?.profiles?.avatar_url} label={myName} size={48} inverse />
                              </View>
                        </View>
                      </View>

                      <Text style={styles.sectionTitle}>YOUR HOME</Text>
                      <View style={{flexDirection: 'row', gap: 16}}>
                          <Pressable onPress={() => setScreen("tasks")} style={[styles.moduleCard, {backgroundColor: '#3661D6', flex: 1}]}>
                              <View style={styles.iconCircle}>
                                  <TasksIcon width={24} height={24} color="#ffffff" />
                              </View>
                              <View>
                                  <Text style={styles.cardTitle}>Tasks</Text>
                                  <Text style={styles.cardSub}>{previewTasks.length} pending</Text>
                              </View>
                          </Pressable>

                          <Pressable onPress={() => setScreen("mealPrep")} style={[styles.moduleCard, {backgroundColor: '#EE6B4D', flex: 1}]}>
                              <View style={styles.iconCircle}>
                                  <MealIcon width={24} height={24} color="#ffffff" />
                              </View>
                              <View>
                                  <Text style={styles.cardTitle}>Meals</Text>
                                  <Text style={styles.cardSub}>Plan today</Text>
                              </View>
                          </Pressable>
                      </View>

                      {/* Notes */}
                      <Pressable onPress={() => setScreen("notes")} style={[styles.moduleCard, {backgroundColor: '#E0Dbf0', height: 110, flexDirection: 'row', alignItems: 'center', padding: 24}]}>
                          <View style={[styles.iconCircle, {backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 0, marginRight: 20}]}>
                          <NotesIcon width={24} height={24} color="#1C1C1E" />
                      </View>
                          <View style={{flex: 1}}>
                              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                                  <Text style={[styles.cardTitle, {color: '#1C1C1E'}]}>Notes</Text>
                                  <Text style={{fontSize: 10, fontWeight: '900', opacity: 0.4, letterSpacing: 1}}>RECENT</Text>
                              </View>
                              <Text style={[styles.cardSub, {color: 'rgba(28,28,30,0.6)'}]}>
                                  {previewNotes.length > 0 ? previewNotes[0].title : "Create a new note..."}
                              </Text>
                          </View>
                      </Pressable>
                      
                      {/* Voice AI Test */}
                      <Pressable
                        onPress={() => setScreen("voiceAi")}
                        style={[
                          styles.moduleCard,
                          {
                            backgroundColor: "#1C1C1E",
                            height: 110,
                            flexDirection: "row",
                            alignItems: "center",
                            padding: 24,
                          },
                        ]}
                      >
                        <View style={[styles.iconCircle, { backgroundColor: "rgba(255,255,255,0.12)", marginBottom: 0, marginRight: 20 }]}>
                          <Text style={{ color: "white", fontSize: 18, fontWeight: "800" }}>🎤</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={[styles.cardTitle, { color: "white" }]}>Voice AI</Text>
                            <Text style={{ fontSize: 10, fontWeight: "900", opacity: 0.6, letterSpacing: 1, color: "white" }}>TEST</Text>
                          </View>

                          <Text style={[styles.cardSub, { color: "rgba(255,255,255,0.7)" }]}>
                            Speak a command (task / meal / note)
                          </Text>
                        </View>
                      </Pressable>

                      {/* Settings Card */}
                      <Pressable onPress={() => setHomeOpen(!homeOpen)}>
                          <View style={[styles.card, {backgroundColor: '#E9F588', minHeight: 120}]}>
                              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20}}>
                                  <Text style={{fontSize: 12, fontWeight: '900', opacity: 0.5, letterSpacing: 1}}>SETTINGS</Text>
                              </View>

                              {!homeOpen ? (
                                  <View>
                                      <Text style={{fontSize: 24, fontWeight: '900'}}>{home.name}</Text>
                                      <Text style={{fontWeight: '700', opacity: 0.6}}>{home.location_text || "No location set"}</Text>
                                  </View>
                              ) : (
                                  <View style={{ height: editingHome ? 240 : 200 }}>
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
                                      <Animated.View style={{ position: "absolute", width: "100%", height: "100%", opacity: backOpacity, transform: [{ rotateY: backInterpolate }], backfaceVisibility: "hidden" }}>
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
                  </Animated.ScrollView>
                </View>
            );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      
      <View style={{ flex: 1, position: 'relative' }}>
        
        {/* --- GLOBAL DYNAMIC HEADER (Apple Glass Upgrade) --- */}
        {screen !== 'profileCreate' && (
            <Animated.View style={styles.headerWrapper}>
                
                {/* Native iOS Apple Glass Material. 
                  "systemThickMaterialLight" ties directly into UIBlurEffectStyle in SwiftUI/UIKit
                */}
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: screen === 'home' ? headerBlurOpacity : 1 }]}>
                    <BlurView 
                        intensity={100} 
                        tint="systemThickMaterialLight" 
                        style={StyleSheet.absoluteFill} 
                    />
                    {/* Add a subtle structural glow to the bottom edge */}
                    <View style={[StyleSheet.absoluteFill, { 
                        borderBottomWidth: StyleSheet.hairlineWidth, 
                        borderBottomColor: 'rgba(255,255,255,0.7)' 
                    }]} />
                </Animated.View>
                
                <View style={styles.headerContainer}>
                    <View style={styles.headerTextContainer}>
                        {/* The LOGO */}
                        <Animated.Text 
                            style={[
                                styles.logoText, 
                                { 
                                    transform: [
                                        { scale: logoScale }, 
                                        { translateY: logoTranslateY },
                                        { translateX: logoTranslateX }
                                    ] 
                                }
                            ]}
                        >
                            tume.
                        </Animated.Text>
                        
                        {/* The Page Title */}
                        <Animated.Text 
                            style={[
                                styles.pageTitle, 
                                { 
                                    opacity: titleOpacity,
                                    transform: [{ translateY: titleTranslateY }]
                                }
                            ]}
                        >
                            {getPageTitle()}
                        </Animated.Text>
                    </View>

                    <Pressable onPress={openProfile} hitSlop={20}>
                       <AvatarBubble uri={profile?.avatar_url} label={myName} size={48} />
                    </Pressable>
                </View>
            </Animated.View>
        )}

        {/* Content */}
        <View style={{ flex: 1 }}>{renderCurrentScreen()}</View>

        {/* --- HIGH CONTRAST DARK BACKDROP FOR PROFILE OVERLAY --- */}
        {screen === 'profileEdit' && (
             <Animated.View 
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill, 
                    { backgroundColor: '#000', opacity: backdropOpacity, zIndex: 199 }
                ]} 
             />
        )}

        {/* --- PROFILE OVERLAY --- */}
        {screen === 'profileEdit' && (
             <Animated.View 
                style={[
                    styles.profileOverlay, 
                    { 
                        opacity: overlayOpacity,
                        borderRadius: overlayRadius,
                        transform: [
                            { translateX },
                            { translateY },
                            { scale }
                        ]
                    }
                ]}
             >
                 <View style={{flex: 1, overflow: 'hidden'}}>
                    <ProfileEditScreen onBack={closeProfile} onSaved={load} mode={"edit"} />
                 </View>
             </Animated.View>
        )}

        {/* Floating Nav */}
        {home && screen !== 'profileEdit' && screen !== 'profileCreate' && (
             <FloatingNavBar active={screen} onChange={setScreen} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: { borderRadius: 32, padding: 24 },
    
    // Header
    headerWrapper: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
        height: 130,
        justifyContent: 'flex-end',
        paddingBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
    },
    headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 24, paddingBottom: 6 },
    
    headerTextContainer: {
        flex: 1,
        height: 60,
        justifyContent: 'flex-end',
        position: 'relative',
    },
    logoText: { 
        fontSize: 46, 
        fontWeight: '900', 
        letterSpacing: -2, 
        color: '#000',
        position: 'absolute', bottom: 0, left: 0,
    },
    pageTitle: { 
        fontSize: 40, 
        fontWeight: '800', 
        color: '#000', 
        position: 'absolute', bottom: -10, left: 0 
    },
    
    // Profile Overlay
    profileOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 200,
        backgroundColor: '#fff',
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.4,
        shadowRadius: 40,
        elevation: 20,
    },

    // Content
    heroTitle: { fontSize: 36, fontWeight: '800', letterSpacing: -1, color: '#000', marginTop: 0 },
    subLabel: { fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 1 },

    heroCard: { backgroundColor: '#1C1C1E', borderRadius: 32, padding: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    quotePill: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f4f4f4', marginBottom: 10 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 1, marginLeft: 4 },
    
    moduleCard: { borderRadius: 32, padding: 20, height: 160, justifyContent: 'space-between' },
    cardTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
    cardSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginTop: 4 },
    iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },

    // Edit Inputs
    input: { backgroundColor: '#fff', padding: 12, borderRadius: 12, fontSize: 16, fontWeight: '600', marginBottom: 8 },
    actionBtn: { flex: 1, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    actionBtnText: { fontWeight: '800' },

    // --- Floating Nav (Expo Native Material Match) ---
    navWrapper: { position: 'absolute', bottom: 30, left: 24, right: 24, alignItems: 'center', zIndex: 100 },
    navContainer: {
        flexDirection: 'row',
        padding: 6,
        borderRadius: 40, 
        height: 72, 
        width: '100%',
        backgroundColor: 'transparent', 
        overflow: 'hidden', 
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
        elevation: 10,
        position: 'relative'
    },
    navPill: {
        position: 'absolute', top: 6, bottom: 6, left: 0, 
        borderRadius: 30, 
        zIndex: 0,
        shadowColor: '#7B61FF', 
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    navItemsRow: { flex: 1, flexDirection: 'row', zIndex: 1 },
    navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    navLabel: { color: '#fff', fontWeight: '800', fontSize: 14, marginLeft: 8 }
});