import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Share as RNShare,
  StyleSheet,
  Dimensions,
  LayoutAnimation,
  UIManager,
  StatusBar,
} from "react-native";
import { supabase } from "../lib/supabase";
import ViewShot, { captureRef } from "react-native-view-shot";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- Types ---

type Member = {
  user_id: string;
  profiles: {
    nickname: string | null;
    first_name: string | null;
    avatar_url: string | null;
  } | null;
};

type MealType = "breakfast" | "lunch" | "dinner";

type MealEntry = {
  id: string;
  week_id: string;
  day_index: number; // 0..6 (Mon..Sun)
  meal: MealType;
  title: string | null;
  note: string | null;
  cooked: boolean;
  cooked_by: string | null;
  dishes_cleaned: boolean;
  dishes_cleaned_by: string | null;
};

// --- Visual Constants ---

const COLORS = [
  { bg: "#E0Dbf0", text: "#1C1C1E", pillBorder: "#1C1C1E" }, // Mon - Purple
  { bg: "#E9F588", text: "#1C1C1E", pillBorder: "#1C1C1E" }, // Tue - Yellow
  { bg: "#3661D6", text: "#FFFFFF", pillBorder: "#FFFFFF" }, // Wed - Blue
  { bg: "#EE6B4D", text: "#FFFFFF", pillBorder: "#FFFFFF" }, // Thu - Orange
  { bg: "#D4C4FB", text: "#1C1C1E", pillBorder: "#1C1C1E" }, // Fri - Lavender
  { bg: "#F2F2F7", text: "#1C1C1E", pillBorder: "#1C1C1E" }, // Sat - Grey
  { bg: "#1C1C1E", text: "#FFFFFF", pillBorder: "#FFFFFF" }, // Sun - Dark
];

const getTheme = (dayIndex: number) => COLORS[dayIndex % COLORS.length];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// --- Helpers ---

function nameOf(m?: Member | null) {
  return m?.profiles?.nickname?.trim() || m?.profiles?.first_name?.trim() || "Member";
}

function initialsFromName(name: string) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// --- Components ---

function AvatarBubble({ uri, label, size = 30, inverse = false }: { uri?: string | null; label: string; size?: number, inverse?: boolean }) {
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

// --- Main Screen ---

export default function MealPrepScreen({
  spaceId,
  members,
  onBack,
}: {
  spaceId: string;
  members: Member[];
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const [weekId, setWeekId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [me, setMe] = useState("");

  // UI State for Accordion
  const [expandedDay, setExpandedDay] = useState<number | null>(null); 

  // Editing
  const [activeEntry, setActiveEntry] = useState<MealEntry | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  // Stats
  const [statsVisible, setStatsVisible] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  // Load Week
  const loadWeek = useCallback(async () => {
    try {
      setLoading(true);
      const { data: s } = await supabase.auth.getSession();
      if (s.session?.user) setMe(s.session.user.id);

      const monday = getMonday(new Date(currentDate));
      const mondayStr = formatDate(monday);

      let { data: existingWeeks, error: findErr } = await supabase
        .from("meal_weeks")
        .select("id")
        .eq("space_id", spaceId)
        .eq("week_start", mondayStr)
        .limit(1);

      if (findErr) throw findErr;

      let wId: string;

      if (existingWeeks && existingWeeks.length > 0) {
        wId = existingWeeks[0].id;
      } else {
        const { data: newWeek, error: createErr } = await supabase
          .from("meal_weeks")
          .insert({ space_id: spaceId, week_start: mondayStr })
          .select("id")
          .single();
        if (createErr) throw createErr;
        wId = newWeek.id;
      }

      setWeekId(wId);

      const { data: eData, error: eErr } = await supabase
        .from("meal_entries")
        .select("*")
        .eq("week_id", wId);

      if (eErr) throw eErr;
      setEntries((eData as MealEntry[]) ?? []);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [spaceId, currentDate]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    if (!weekId) return;
    const ch = supabase
      .channel(`meal_entries:${weekId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meal_entries", filter: `week_id=eq.${weekId}` },
        () => {
          supabase.from("meal_entries").select("*").eq("week_id", weekId).then(({ data }) => {
            if (data) setEntries(data as MealEntry[]);
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [weekId]);

  const changeWeek = (offset: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = new Date(currentDate);
    next.setDate(next.getDate() + offset * 7);
    setCurrentDate(next);
    setExpandedDay(null); // Reset expansion on week change
  };

  const toggleDay = (index: number) => {
    // Smoother animation config to avoid "jumpiness"
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setExpandedDay(expandedDay === index ? null : index);
  };

  const openEditor = (dayIndex: number, mealType: MealType) => {
    const existing = entries.find((e) => e.day_index === dayIndex && e.meal === mealType);
    if (existing) {
      setActiveEntry(existing);
      setEditTitle(existing.title || "");
      setEditNote(existing.note || "");
    } else {
      setActiveEntry({
        id: "new",
        week_id: weekId!,
        day_index: dayIndex,
        meal: mealType,
        title: "",
        note: "",
        cooked: false,
        cooked_by: null,
        dishes_cleaned: false,
        dishes_cleaned_by: null,
      });
      setEditTitle("");
      setEditNote("");
    }
  };

  const saveEntry = async () => {
    if (!activeEntry || !weekId) return;
    try {
      const payload = {
        week_id: weekId,
        day_index: activeEntry.day_index,
        meal: activeEntry.meal,
        title: editTitle.trim() || null,
        note: editNote.trim() || null,
        cooked: activeEntry.cooked,
        cooked_by: activeEntry.cooked_by,
        dishes_cleaned: activeEntry.dishes_cleaned,
        dishes_cleaned_by: activeEntry.dishes_cleaned_by,
      };

      const { error } = await supabase.from("meal_entries").upsert(
        { ...(activeEntry.id !== "new" ? { id: activeEntry.id } : {}), ...payload },
        { onConflict: "week_id,day_index,meal" }
      );

      if (error) throw error;
      setActiveEntry(null);
      loadWeek();
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    }
  };

  const cycleStatus = (currentStatus: boolean, currentBy: string | null, key: 'cooked' | 'cleaned') => {
    if (!activeEntry) return;
    const partner = members.find((m) => m.user_id !== me);
    const partnerId = partner?.user_id;

    let nextStatus = currentStatus;
    let nextBy = currentBy;

    if (!currentStatus) {
      nextStatus = true;
      nextBy = me;
    } else {
      if (nextBy === me && partnerId) nextBy = partnerId;
      else if (nextBy === partnerId) nextBy = "both";
      else if (nextBy === "both") { nextStatus = false; nextBy = null; }
      else { nextStatus = false; nextBy = null; }
    }
    
    if (key === 'cooked') {
        setActiveEntry({ ...activeEntry, cooked: nextStatus, cooked_by: nextBy });
    } else {
        setActiveEntry({ ...activeEntry, dishes_cleaned: nextStatus, dishes_cleaned_by: nextBy });
    }
  };

  const shareReportAsImage = async () => {
    try {
      setSharing(true);
      const uri = await captureRef(viewShotRef, { format: "png", quality: 0.9 });
      if (!(await RNShare.share({ url: uri }))) Alert.alert("Share cancelled");
    } catch (e: any) {
      Alert.alert("Error sharing", e.message);
    } finally {
      setSharing(false);
    }
  };

  const weekStats = useMemo(() => {
    const cooked = entries.filter((e) => e.cooked).length;
    const cleaned = entries.filter((e) => e.dishes_cleaned).length;
    
    const counts: Record<string, { count: number }> = {};
    entries.forEach((e) => {
      if (e.title) {
        const t = e.title.toLowerCase().trim();
        if (!counts[t]) counts[t] = { count: 0 };
        counts[t].count++;
      }
    });
    const dishes = Object.keys(counts).map((k) => ({ name: k, ...counts[k] })).sort((a, b) => b.count - a.count).slice(0, 5);
    return { cooked, cleaned, dishes };
  }, [entries]);

  const progressPercent = useMemo(() => {
    const totalSlots = 7 * 3; // 7 days * 3 meals
    const filledSlots = entries.filter(e => e.title && e.title.trim().length > 0).length;
    return Math.min(1, filledSlots / totalSlots);
  }, [entries]);

  const getEntry = (day: number, type: MealType) => entries.find((e) => e.day_index === day && e.meal === type);

  // --- Dates ---
  const mondayDate = getMonday(new Date(currentDate));
  const thisWeekStart = new Date(mondayDate);
  const thisWeekEnd = new Date(thisWeekStart); thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
  
  const getDayDate = (dayIdx: number) => {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + dayIdx);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
        
        {/* Pinned Top Controls (Progress + Stats) */}
        {/* Placed absolute at top: 120 to sit below Global Header */}
        <View style={styles.topControls}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4, alignItems: 'center'}}>
                <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                    <Text style={{fontSize: 12, fontWeight: '800', color: '#999', letterSpacing: 0.5}}>PREP PROGRESS</Text>
                    <Text style={{fontSize: 12, fontWeight: '800', color: '#000'}}>{Math.round(progressPercent * 100)}%</Text>
                </View>
                <Pressable onPress={() => setStatsVisible(true)} hitSlop={10} style={{padding: 4, backgroundColor: '#f0f0f0', borderRadius: 12}}>
                    <Text style={{fontSize: 16}}>📊</Text>
                </Pressable>
            </View>
            
            <View style={styles.progressBarContainer}>
                {/* Last Week Segment */}
                <Pressable 
                onPress={() => changeWeek(-1)} 
                style={({pressed}) => [styles.progressSegment, pressed && {opacity: 0.6}]}
                >
                <Text style={styles.progressTextInactive}>Last</Text>
                </Pressable>

                {/* This Week Segment (Active) */}
                <View style={styles.progressSegmentActive}>
                    {/* Background Progress Fill */}
                    <View style={{
                        position: 'absolute', 
                        left: 0, top: 0, bottom: 0, 
                        width: `${progressPercent * 100}%`, 
                        backgroundColor: '#e0e0e0', 
                        borderRadius: 16
                    }} />
                    
                    <Text style={styles.progressTextActive}>
                        {fmt(thisWeekStart)} - {fmt(thisWeekEnd)}
                    </Text>
                </View>

                {/* Next Week Segment */}
                <Pressable 
                onPress={() => changeWeek(1)} 
                style={({pressed}) => [styles.progressSegment, pressed && {opacity: 0.6}]}
                >
                <Text style={styles.progressTextInactive}>Next</Text>
                </Pressable>
            </View>
        </View>

        {/* STACKED CARDS LIST */}
        {loading && !entries.length ? (
            <ActivityIndicator size="large" color="#000" style={{marginTop: 200}} />
        ) : (
            <ScrollView 
              contentContainerStyle={{ 
                paddingHorizontal: 16, 
                paddingBottom: 150, 
                paddingTop: 220 // Push content down to clear global header + pinned progress bar
              }}
              showsVerticalScrollIndicator={false}
            >
            {DAY_NAMES.map((dayName, dayIdx) => {
                const theme = getTheme(dayIdx);
                const dayMeals = ["breakfast", "lunch", "dinner"] as const;
                const isExpanded = expandedDay === dayIdx;
                
                // STACK LOGIC
                const isFirst = dayIdx === 0;
                let marginTop = -50; 
                
                if (isFirst) {
                    marginTop = 0;
                } else if (expandedDay !== null) {
                    if (expandedDay === dayIdx) marginTop = 10;
                    else if (dayIdx > expandedDay) marginTop = 10;
                }

                return (
                <Pressable
                  key={dayIdx} 
                  onPress={() => toggleDay(dayIdx)}
                  style={[
                    styles.card, 
                    { 
                      backgroundColor: theme.bg,
                      marginTop: marginTop,
                      zIndex: dayIdx,
                      elevation: dayIdx,
                      minHeight: isExpanded ? 320 : 160,
                    }
                  ]}
                >
                    <View style={styles.cardHeaderRow}>
                      <Text style={[styles.dayHeader, { color: theme.text }]}>{dayName}</Text>
                      <View style={{alignItems: 'flex-end'}}>
                          <Text style={{fontSize: 18, fontWeight: '600', color: theme.text, opacity: 0.5}}>
                              {getDayDate(dayIdx)}
                          </Text>
                      </View>
                    </View>
                    
                    {!isExpanded && (
                       <View style={{flexDirection: 'row', gap: 6, marginTop: 12}}>
                         {dayMeals.map((mType, i) => {
                             const e = getEntry(dayIdx, mType);
                             if(e?.title) return <View key={i} style={{width: 8, height: 8, borderRadius: 4, backgroundColor: theme.text, opacity: 0.3}} />
                             return null;
                         })}
                       </View>
                    )}
                    
                    {isExpanded && (
                    <View style={{ gap: 10, marginTop: 30 }}>
                    {dayMeals.map((mType) => {
                        const entry = getEntry(dayIdx, mType);
                        const hasContent = !!entry?.title;

                        return (
                        <Pressable
                            key={mType}
                            onPress={() => openEditor(dayIdx, mType)}
                            style={{
                              backgroundColor: theme.text === "#FFFFFF" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.6)",
                              padding: 16,
                              borderRadius: 20,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                        >
                            <View style={{flex: 1}}>
                                <Text style={{ fontSize: 11, fontWeight: "800", opacity: 0.6, color: theme.text, textTransform: 'uppercase', marginBottom: 4 }}>{mType}</Text>
                                <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text, opacity: hasContent ? 1 : 0.4 }} numberOfLines={1}>
                                    {entry?.title || "Plan meal..."}
                                </Text>
                            </View>

                            {hasContent && (
                                <View style={{flexDirection: 'row', gap: -8}}>
                                    {entry.cooked && (
                                        <AvatarBubble 
                                            uri={memberMap.get(entry.cooked_by === 'both' ? me : entry.cooked_by!)?.profiles?.avatar_url} 
                                            label={entry.cooked_by === 'both' ? 'Both' : (nameOf(memberMap.get(entry.cooked_by!)))} 
                                            size={28}
                                            inverse={theme.text==="#FFFFFF"}
                                        />
                                    )}
                                    {entry.dishes_cleaned && (
                                        <View style={{width: 28, height: 28, borderRadius: 14, backgroundColor: theme.pillBorder, alignItems: 'center', justifyContent: 'center', marginLeft: entry.cooked ? 4 : 0}}>
                                            <Text style={{fontSize: 12, color: theme.bg}}>🫧</Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        </Pressable>
                        );
                    })}
                    </View>
                    )}
                </Pressable>
                );
            })}
            </ScrollView>
        )}

        {/* EDIT MODAL (Unchanged) */}
        <Modal visible={!!activeEntry} animationType="slide" presentationStyle="pageSheet">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
                <View style={styles.modalContent}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
                        <Text style={{ fontSize: 24, fontWeight: "800" }}>
                            {activeEntry ? `${DAY_NAMES[activeEntry.day_index]} ${activeEntry.meal}` : "Edit"}
                        </Text>
                        <Pressable onPress={() => setActiveEntry(null)} style={styles.closeBtn}>
                             <Text style={{fontSize: 16, fontWeight: 'bold'}}>✕</Text>
                        </Pressable>
                    </View>

                    <ScrollView>
                        <Text style={styles.label}>WHAT ARE WE EATING?</Text>
                        <TextInput
                            value={editTitle}
                            onChangeText={setEditTitle}
                            placeholder="e.g. Avocado Toast"
                            style={styles.largeInput}
                            autoFocus
                        />

                        <Text style={styles.label}>NOTES / INGREDIENTS</Text>
                        <TextInput
                            value={editNote}
                            onChangeText={setEditNote}
                            placeholder="Add details..."
                            multiline
                            style={styles.areaInput}
                        />

                        <Text style={styles.label}>STATUS</Text>
                        <View style={{flexDirection: 'row', gap: 12, marginBottom: 30}}>
                             <Pressable 
                                onPress={() => cycleStatus(activeEntry!.cooked, activeEntry!.cooked_by, 'cooked')}
                                style={[styles.statusToggle, activeEntry?.cooked && styles.statusToggleActive]}
                             >
                                 <Text style={[styles.statusText, activeEntry?.cooked && styles.statusTextActive]}>
                                     {activeEntry?.cooked ? `Cooked by ${activeEntry.cooked_by === 'both' ? 'Both' : nameOf(memberMap.get(activeEntry.cooked_by!))}` : "Mark Cooked"}
                                 </Text>
                             </Pressable>

                             <Pressable 
                                onPress={() => cycleStatus(activeEntry!.dishes_cleaned, activeEntry!.dishes_cleaned_by, 'cleaned')}
                                style={[styles.statusToggle, activeEntry?.dishes_cleaned && styles.statusToggleActive]}
                             >
                                 <Text style={[styles.statusText, activeEntry?.dishes_cleaned && styles.statusTextActive]}>
                                     {activeEntry?.dishes_cleaned ? `Cleaned by ${activeEntry.dishes_cleaned_by === 'both' ? 'Both' : nameOf(memberMap.get(activeEntry.dishes_cleaned_by!))}` : "Mark Cleaned"}
                                 </Text>
                             </Pressable>
                        </View>
                    </ScrollView>

                    <Pressable onPress={saveEntry} style={styles.saveBtn}>
                        <Text style={{ color: "white", fontWeight: "bold", fontSize: 18 }}>Save</Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>

        {/* STATS MODAL (Unchanged) */}
        <Modal visible={statsVisible} animationType="slide" transparent>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
                <View style={{ backgroundColor: "#fff", borderRadius: 32, overflow: 'hidden' }}>
                     <ViewShot ref={viewShotRef} options={{ format: "png", quality: 0.9 }} style={{ backgroundColor: "#fff", padding: 30 }}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                            <Text style={{ fontSize: 28, fontWeight: "900" }}>Weekly Report</Text>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#888" }}>{fmt(thisWeekStart)} - {fmt(thisWeekEnd)}</Text>
                        </View>

                        <View style={styles.statRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statVal}>{weekStats.cooked}</Text>
                                <Text style={styles.statLabel}>Meals Cooked</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statVal}>{weekStats.cleaned}</Text>
                                <Text style={styles.statLabel}>Dishes Done</Text>
                            </View>
                        </View>

                        <Text style={{ fontSize: 14, fontWeight: "800", marginTop: 20, marginBottom: 10, letterSpacing: 1, color: '#999' }}>TOP DISHES</Text>
                        {weekStats.dishes.length > 0 ? (
                            weekStats.dishes.map((d, i) => (
                                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                                    <Text style={{ fontWeight: "700", fontSize: 16 }}>{d.name}</Text>
                                    <Text style={{ fontWeight: "600", color: "#666" }}>x{d.count}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={{ color: "#aaa", fontStyle: "italic" }}>No meals recorded yet.</Text>
                        )}
                        
                        <View style={{marginTop: 30, alignItems: 'center'}}>
                            <Text style={{fontSize: 12, fontWeight: '900', color: '#ccc'}}>COUPLE APP • MEAL PREP</Text>
                        </View>
                     </ViewShot>

                     <View style={{ padding: 20, gap: 10 }}>
                        <Pressable onPress={shareReportAsImage} style={styles.shareBtn}>
                            {sharing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "bold" }}>Share Image</Text>}
                        </Pressable>
                        <Pressable onPress={() => setStatsVisible(false)} style={{ alignItems: "center", padding: 10 }}>
                            <Text style={{ color: "#666", fontWeight: "bold" }}>Close</Text>
                        </Pressable>
                     </View>
                </View>
            </View>
        </Modal>

      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
    // --- Top Controls Pinned ---
    topControls: {
        position: 'absolute',
        top: 120, // Below global header
        left: 0, 
        right: 0,
        zIndex: 50,
        paddingHorizontal: 20,
    },
    // --- Progress Bar Styles ---
    progressBarContainer: {
        flexDirection: 'row',
        backgroundColor: '#f2f2f2',
        borderRadius: 20,
        padding: 4,
        height: 48,
        alignItems: 'center'
    },
    progressSegment: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    progressSegmentActive: {
        flex: 2, 
        backgroundColor: '#fff',
        borderRadius: 16,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
        overflow: 'hidden'
    },
    progressTextInactive: {
        fontSize: 13,
        fontWeight: '600',
        color: '#999',
    },
    progressTextActive: {
        fontSize: 13,
        fontWeight: '800',
        color: '#000',
        zIndex: 2,
    },

    // --- Card Styles ---
    card: { 
        borderRadius: 28, 
        padding: 24, 
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 }, 
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 10,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    dayHeader: { fontSize: 34, fontWeight: "800", letterSpacing: -1.5 },
    
    // --- Modal ---
    modalContent: { flex: 1, backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 24 },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center" },
    label: { fontSize: 12, fontWeight: "800", color: "#999", marginBottom: 10, letterSpacing: 1, marginTop: 20 },
    largeInput: { fontSize: 28, fontWeight: "700", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10, marginBottom: 10 },
    areaInput: { fontSize: 18, backgroundColor: "#f9f9f9", borderRadius: 16, padding: 16, height: 100, textAlignVertical: "top" },
    
    statusToggle: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#eee", alignItems: "center", justifyContent: "center" },
    statusToggleActive: { backgroundColor: "#000", borderColor: "#000" },
    statusText: { fontWeight: "700", color: "#ccc" },
    statusTextActive: { color: "#fff" },

    saveBtn: { backgroundColor: "#000", height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 40 },
    
    // --- Stats ---
    statRow: { flexDirection: 'row', gap: 16 },
    statItem: { flex: 1, backgroundColor: '#f9f9f9', borderRadius: 20, padding: 20, alignItems: 'center' },
    statVal: { fontSize: 32, fontWeight: '900', color: '#000' },
    statLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginTop: 4 },
    shareBtn: { backgroundColor: "#000", height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" }
});