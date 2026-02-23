import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Image,
  Modal,
  StyleSheet,
  Animated,
  StatusBar,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/Swipeable";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "../lib/supabase";

// --- Types ---

type Member = {
  user_id: string;
  profiles: {
    nickname: string | null;
    first_name: string | null;
    avatar_url?: string | null;
  } | null;
};

type Task = {
  id: string;
  space_id: string;
  created_by: string;
  assigned_to: string;
  title: string;
  description: string | null;
  due_at: string | null;
  state: "pending" | "accepted" | "rejected";
  is_completed: boolean;

  group_id?: string | null;
  assigned_scope?: "single" | "both" | string;
};

// --- Visual Constants ---

const COLORS = [
  { bg: "#E0Dbf0", text: "#1C1C1E", pillBorder: "#1C1C1E", pillText: "#1C1C1E" }, // Light Purple
  { bg: "#E9F588", text: "#1C1C1E", pillBorder: "#1C1C1E", pillText: "#1C1C1E" }, // Acid Yellow
  { bg: "#3661D6", text: "#FFFFFF", pillBorder: "#FFFFFF", pillText: "#FFFFFF" }, // Deep Blue
  { bg: "#EE6B4D", text: "#FFFFFF", pillBorder: "#FFFFFF", pillText: "#FFFFFF" }, // Orange/Red
  { bg: "#D4C4FB", text: "#1C1C1E", pillBorder: "#1C1C1E", pillText: "#1C1C1E" }, // Lavender
];

const getTheme = (index: number) => COLORS[index % COLORS.length];

// --- Helpers ---

function labelName(m?: Member | null) {
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

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getBucket(dueAtISO: string | null) {
  if (!dueAtISO) return "No date";
  const due = new Date(dueAtISO);
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dueDay = startOfDay(due);

  if (dueDay < today) return "Past";
  if (isSameDay(dueDay, today)) return "Today";
  if (isSameDay(dueDay, tomorrow)) return "Tomorrow";
  if (dueDay >= dayAfter) return "Upcoming";
  return "Upcoming";
}

function uuidLike() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Components ---

function AvatarBubble({ uri, label, size = 34, inverse = false }: { uri?: string | null; label: string; size?: number, inverse?: boolean }) {
  const initials = useMemo(() => initialsFromName(label), [label]);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: inverse ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.1)",
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

function AvatarStack({
  left,
  right,
  size = 34,
  inverse = false
}: {
  left: { uri?: string | null; label: string };
  right: { uri?: string | null; label: string };
  size?: number;
  inverse?: boolean;
}) {
  return (
    <View style={{ width: size + 14, height: size }}>
      <View style={{ position: "absolute", left: 0, zIndex: 2 }}>
        <AvatarBubble uri={left.uri} label={left.label} size={size} inverse={inverse} />
      </View>
      <View style={{ position: "absolute", left: 14, zIndex: 1 }}>
        <AvatarBubble uri={right.uri} label={right.label} size={size} inverse={inverse} />
      </View>
    </View>
  );
}

function PickerModal({
  visible,
  mode,
  value,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  mode: "date" | "time";
  value: Date;
  onCancel: () => void;
  onConfirm: (val: Date) => void;
}) {
  const [temp, setTemp] = useState<Date>(value);
  useEffect(() => {
    if (visible) setTemp(value);
  }, [visible, value]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable onPress={onCancel} style={styles.modalOverlay}>
        <Pressable style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {mode === "date" ? "Select date" : "Select time"}
          </Text>
          <DateTimePicker
            value={temp}
            mode={mode}
            display={Platform.OS === "ios" ? (mode === "date" ? "inline" : "spinner") : "spinner"}
            onChange={(_, d) => { if (d) setTemp(d); }}
            textColor="#000"
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable onPress={onCancel} style={[styles.modalBtn, { backgroundColor: "#f0f0f0" }]}>
              <Text style={{ fontWeight: "700" }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(temp)} style={[styles.modalBtn, { backgroundColor: "#000" }]}>
              <Text style={{ fontWeight: "700", color: "#fff" }}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SwipeRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const swipeRef = useRef<Swipeable | null>(null);
  const renderRightActions = () => (
    <View style={{ justifyContent: "center", alignItems: "center", paddingLeft: 12 }}>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onDelete();
        }}
        style={styles.deleteAction}
      >
        <Text style={{ color: "white", fontWeight: "900", fontSize: 12 }}>DELETE</Text>
      </Pressable>
    </View>
  );
  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} rightThreshold={40} friction={2}>
      {children}
    </Swipeable>
  );
}

// --- Main Screen ---

export default function TasksScreen({
  spaceId,
  members,
  onBack,
}: {
  spaceId: string;
  members: Member[];
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"shared" | "requests" | "create">("shared");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [me, setMe] = useState("");

  // Create form
  const [assignMode, setAssignMode] = useState<"me" | "partner" | "both">("me");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  // optional date/time
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [pickedTime, setPickedTime] = useState<Date | null>(null);

  // popup picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [pickerValue, setPickerValue] = useState<Date>(new Date());

  // --- Animation Refs ---
  const fabAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  const partner = useMemo(() => {
    if (!me) return null;
    return members.find((m) => m.user_id !== me) || null;
  }, [members, me]);

  const meMember = useMemo(() => (me ? memberMap.get(me) || null : null), [me, memberMap]);
  const partnerMember = useMemo(() => (partner ? memberMap.get(partner.user_id) || partner : null), [partner, memberMap]);

  // --- Effects ---

  useEffect(() => {
    // Show FAB only when not in 'create' mode
    const shouldShow = tab !== 'create';
    
    Animated.spring(fabAnim, {
      toValue: shouldShow ? 1 : 0,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [tab]);

  const load = async () => {
    try {
      setLoading(true);
      const { data: s, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;

      const user = s.session?.user;
      if (!user) throw new Error("No session");
      setMe(user.id);

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks((data as any) ?? []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [spaceId]);

  const buildDueAt = () => {
    if (!pickedDate && !pickedTime) return null;
    const base = pickedDate ? new Date(pickedDate) : new Date();
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    if (pickedTime) d.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
    else d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  const openDatePicker = () => {
    setPickerMode("date");
    setPickerValue(pickedDate ?? new Date());
    setPickerVisible(true);
  };

  const openTimePicker = () => {
    setPickerMode("time");
    setPickerValue(pickedTime ?? new Date());
    setPickerVisible(true);
  };

  const createTask = async () => {
    const t = title.trim();
    if (!t) return Alert.alert("Missing info", "Title is required.");

    try {
      setLoading(true);
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) throw new Error("No session");

      const dueAt = buildDueAt();
      const meId = user.id;
      const partnerId = partner?.user_id;

      if ((assignMode === "partner" || assignMode === "both") && !partnerId) {
        throw new Error("Partner has not joined yet.");
      }

      let payload: any = {
        space_id: spaceId,
        created_by: meId,
        title: t,
        description: desc.trim() || null,
        due_at: dueAt,
        group_id: null,
      };

      if (assignMode === "me") {
        payload = { ...payload, assigned_to: meId, state: "accepted", assigned_scope: "single" };
      } else if (assignMode === "partner") {
        payload = { ...payload, assigned_to: partnerId, state: "pending", assigned_scope: "single" };
      } else if (assignMode === "both") {
        payload = { ...payload, assigned_to: partnerId, state: "pending", assigned_scope: "both", group_id: uuidLike() };
      }

      const { error } = await supabase.from("tasks").insert(payload);
      if (error) throw error;

      setTitle("");
      setDesc("");
      setPickedDate(null);
      setPickedTime(null);
      setTab("shared");
      await load();
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const approveTask = async (taskId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc("accept_task", { p_task_id: taskId });
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert("Approve failed", e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const rejectTask = async (taskId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc("reject_task", { p_task_id: taskId });
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert("Reject failed", e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (task: Task) => {
    if (task.state !== "accepted") {
      Alert.alert("Approval pending", "This task is waiting for approval.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    Alert.alert("Delete task?", "This will remove the task permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            const { error } = await supabase.from("tasks").delete().eq("id", taskId);
            if (error) throw error;
            await load();
          } catch (e: any) {
            Alert.alert("Delete failed", e?.message ?? "Something went wrong.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const shared = tasks.filter((t) => t.state === "accepted" || (t.state === "pending" && t.created_by === me));
  const requests = tasks.filter((t) => t.state === "pending" && t.assigned_to === me);

  const grouped = useMemo(() => {
    const buckets: Record<string, Task[]> = {
      Today: [],
      Tomorrow: [],
      Upcoming: [],
      Past: [],
      "No date": [],
    };
    for (const t of shared) buckets[getBucket(t.due_at)].push(t);
    return buckets;
  }, [shared]);

  const dateLabel = pickedDate ? pickedDate.toDateString() : "Pick date";
  const timeLabel = pickedTime
    ? pickedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Pick time";

  if (loading && !tasks.length) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // Common Scroll Content
  const renderContent = () => {
      if(tab === "create") {
          return (
             <ScrollView 
                contentContainerStyle={{ padding: 24, paddingBottom: 150, paddingTop: 130 }}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                )}
                scrollEventThrottle={16}
             >
                 <View style={styles.formCard}>
                    <Text style={styles.formHeader}>New Task</Text>

                    <View>
                        <Text style={styles.label}>ASSIGN TO</Text>
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            {[{ id: 'me', label: 'Me' }, { id: 'partner', label: 'Partner' }, { id: 'both', label: 'Both' }].map((opt) => (
                                <Pressable
                                    key={opt.id}
                                    onPress={() => opt.id !== 'me' && !partner ? null : setAssignMode(opt.id as any)}
                                    style={[styles.selectBtn, assignMode === opt.id && styles.selectBtnActive, (opt.id !== 'me' && !partner) && {opacity: 0.5}]}
                                >
                                    <Text style={[styles.selectText, assignMode === opt.id && styles.selectTextActive]}>{opt.label.toUpperCase()}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <View>
                        <Text style={styles.label}>DETAILS</Text>
                        <TextInput
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Task Title"
                            style={styles.input}
                            placeholderTextColor="#aaa"
                        />
                        <TextInput
                            value={desc}
                            onChangeText={setDesc}
                            placeholder="Description (optional)"
                            multiline
                            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                            placeholderTextColor="#aaa"
                        />
                    </View>

                    <View>
                        <Text style={styles.label}>DUE DATE</Text>
                        <View style={{flexDirection: 'row', gap: 10}}>
                            <Pressable onPress={openDatePicker} style={styles.dateBtn}>
                                <Text style={{fontWeight: '600'}}>{dateLabel}</Text>
                            </Pressable>
                            <Pressable onPress={openTimePicker} style={styles.dateBtn}>
                                <Text style={{fontWeight: '600'}}>{timeLabel}</Text>
                            </Pressable>
                        </View>
                        {(pickedDate || pickedTime) && (
                            <Pressable onPress={() => {setPickedDate(null); setPickedTime(null)}} style={{marginTop: 10}}>
                                <Text style={{color: '#ff3b30', fontWeight: '600', fontSize: 12}}>Clear Date & Time</Text>
                            </Pressable>
                        )}
                    </View>

                    <Pressable onPress={createTask} style={styles.createBtn}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Task</Text>}
                    </Pressable>
                    
                    <Pressable onPress={() => setTab('shared')} style={{alignItems: 'center'}}>
                        <Text style={{color: '#999', fontWeight: '600'}}>Cancel</Text>
                    </Pressable>
                </View>
           </ScrollView>
          );
      }

      if(tab === 'requests') {
          return (
             <Animated.ScrollView 
               contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 180, gap: 16 }}
               onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                )}
                scrollEventThrottle={16}
             >
                {requests.length === 0 ? (
                <View style={{padding: 40, alignItems: 'center'}}>
                    <Text style={{color: '#ccc', fontSize: 18, fontWeight: '600'}}>No pending requests</Text>
                </View>
                ) : (
                requests.map((t, i) => (
                    <View key={t.id} style={[styles.card, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' }]}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10}}>
                            <Text style={{fontSize: 20, fontWeight: '800'}}>{t.title}</Text>
                            <AvatarBubble uri={memberMap.get(t.created_by)?.profiles?.avatar_url} label={labelName(memberMap.get(t.created_by))} size={28} />
                    </View>
                    {t.description ? <Text style={{color: '#666', marginBottom: 16}}>{t.description}</Text> : null}
                    
                    <View style={{flexDirection: 'row', gap: 12}}>
                        <Pressable onPress={() => approveTask(t.id)} style={[styles.actionBtn, {backgroundColor: '#000'}]}>
                            <Text style={{color: '#fff', fontWeight: 'bold'}}>Accept</Text>
                        </Pressable>
                        <Pressable onPress={() => rejectTask(t.id)} style={[styles.actionBtn, {backgroundColor: '#f2f2f2'}]}>
                            <Text style={{color: '#000', fontWeight: 'bold'}}>Reject</Text>
                        </Pressable>
                    </View>
                    </View>
                ))
                )}
          </Animated.ScrollView>
          );
      }

      // Shared List
      return (
        <Animated.ScrollView 
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 180, gap: 24 }}
            onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: false }
            )}
            scrollEventThrottle={16}
        >
            {Object.entries(grouped).map(([bucket, list]) => {
                if(list.length === 0) return null;
                return (
                    <View key={bucket} style={{ gap: 12 }}>
                        <Text style={styles.bucketTitle}>{bucket}</Text>
                        {list.map((t, index) => {
                            const scope = (t.assigned_scope ?? "single") as string;
                            const isBoth = scope === "both";
                            const assignedMember = memberMap.get(t.assigned_to) || null;
                            const theme = getTheme(t.id.charCodeAt(0));
                            const isPending = t.state !== "accepted";

                            return (
                            <SwipeRow key={t.id} onDelete={() => deleteTask(t.id)}>
                                <Pressable
                                onPress={() => toggleComplete(t)}
                                style={[
                                    styles.card,
                                    { backgroundColor: theme.bg }
                                ]}
                                >
                                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                    <View style={{flex: 1, marginRight: 10}}>
                                        <Text style={[styles.cardTitle, { color: theme.text, textDecorationLine: t.is_completed ? 'line-through' : 'none', opacity: t.is_completed ? 0.5 : 1 }]}>
                                            {t.title}
                                        </Text>
                                        {t.description ? <Text style={{ color: theme.text, opacity: 0.7, marginTop: 4 }} numberOfLines={2}>{t.description}</Text> : null}
                                    </View>
                                    
                                    {/* Checkbox Circle */}
                                    <View style={{
                                        width: 32, height: 32, borderRadius: 16, 
                                        borderWidth: 2, borderColor: theme.pillBorder,
                                        backgroundColor: t.is_completed ? theme.pillBorder : 'transparent',
                                        alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {t.is_completed && <Text style={{color: theme.bg, fontWeight: 'bold'}}>✓</Text>}
                                    </View>
                                </View>

                                <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 20 }}>
                                    {/* Metadata Pills */}
                                    <View style={{ gap: 6 }}>
                                        {t.due_at && (
                                            <View style={[styles.cardPill, { borderColor: theme.pillBorder }]}>
                                                <Text style={{ color: theme.pillText, fontSize: 11, fontWeight: "700" }}>
                                                    {new Date(t.due_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}
                                                </Text>
                                            </View>
                                        )}
                                        {isPending && (
                                            <View style={[styles.cardPill, { backgroundColor: 'rgba(0,0,0,0.1)', borderColor: 'transparent' }]}>
                                                <Text style={{ color: theme.text, fontSize: 11, fontWeight: "800" }}>PENDING</Text>
                                            </View>
                                        )}
                                    </View>
                                    
                                    {/* Avatar */}
                                    <View>
                                    {isBoth && meMember && partnerMember ? (
                                        <AvatarStack
                                            left={{ uri: meMember.profiles?.avatar_url ?? null, label: labelName(meMember) }}
                                            right={{ uri: partnerMember.profiles?.avatar_url ?? null, label: labelName(partnerMember) }}
                                            inverse={theme.text === '#FFFFFF'}
                                        />
                                        ) : (
                                        <AvatarBubble
                                            uri={assignedMember?.profiles?.avatar_url ?? null}
                                            label={labelName(assignedMember)}
                                            size={34}
                                            inverse={theme.text === '#FFFFFF'}
                                        />
                                    )}
                                    </View>
                                </View>
                                </Pressable>
                            </SwipeRow>
                            );
                        })}
                    </View>
                );
            })}
            {Object.values(grouped).every(l => l.length === 0) && (
                <View style={{padding: 40, alignItems: 'center'}}>
                    <Text style={{color: '#ccc', fontSize: 18, fontWeight: '600'}}>No tasks</Text>
                </View>
            )}
        </Animated.ScrollView>
      );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#fff', position: 'relative' }}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

        {/* Tabs Pinned Top (Below Main Header) */}
        {tab !== 'create' && (
            <View style={styles.topTabsBar}>
            {([
                { id: "shared", label: "Shared" },
                { id: "requests", label: `Requests${requests.length ? ` (${requests.length})` : ""}` }
            ] as const).map((tItem) => {
                const isActive = tab === tItem.id;
                return (
                <Pressable
                    key={tItem.id}
                    onPress={() => setTab(tItem.id as any)}
                    style={[styles.pill, isActive && styles.pillActive]}
                >
                    <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{tItem.label}</Text>
                </Pressable>
                );
            })}
            </View>
        )}

        {/* popup picker */}
        <PickerModal
          visible={pickerVisible}
          mode={pickerMode}
          value={pickerValue}
          onCancel={() => setPickerVisible(false)}
          onConfirm={(val) => {
            setPickerVisible(false);
            if (pickerMode === "date") setPickedDate(val);
            else setPickedTime(val);
          }}
        />

        {/* Content */}
        <View style={{ flex: 1 }}>
             {renderContent()}
        </View>

        {/* --- LIQUID BUBBLE FAB --- */}
        <Animated.View
          style={[
            styles.fabContainer,
            {
              transform: [
                { scale: fabAnim }, 
                {
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0], 
                  }),
                },
              ],
              opacity: fabAnim,
            },
          ]}
        >
          <Pressable
            onPress={() => setTab("create")}
            style={({ pressed }) => [
              styles.fabButton,
              pressed && { transform: [{ scale: 0.9 }] },
            ]}
          >
            <Text style={styles.fabIcon}>+</Text>
          </Pressable>
        </Animated.View>

      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
    centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
    
    // Top Tabs Bar
    topTabsBar: {
        position: 'absolute',
        top: 140, // Clear the main header height
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        zIndex: 50,
        flexDirection: 'row',
        gap: 12
    },
    pill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 1, borderColor: "transparent" },
    pillActive: { backgroundColor: "#000", borderColor: "#000" },
    pillText: { fontWeight: "700", color: "#888", fontSize: 13 },
    pillTextActive: { color: "#fff" },

    bucketTitle: { fontSize: 13, fontWeight: "800", opacity: 0.4, letterSpacing: 1, marginLeft: 4, marginBottom: 4 },
    
    card: { borderRadius: 32, padding: 24, justifyContent: 'space-between', minHeight: 140 },
    cardTitle: { fontSize: 22, fontWeight: "800", lineHeight: 28 },
    cardPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
    
    deleteAction: { height: 80, width: 80, borderRadius: 40, backgroundColor: "#ff3b30", alignItems: "center", justifyContent: "center" },

    // Form
    formCard: { backgroundColor: "#FAFAFA", borderRadius: 32, padding: 30, gap: 24 },
    formHeader: { fontSize: 24, fontWeight: "800", marginBottom: 10 },
    label: { fontSize: 12, fontWeight: '700', color: '#999', marginBottom: 10, letterSpacing: 1 },
    input: { backgroundColor: '#fff', padding: 16, borderRadius: 16, fontSize: 16, fontWeight: '600', marginBottom: 10 },
    selectBtn: { flex: 1, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fff', alignItems: 'center' },
    selectBtnActive: { borderColor: '#000', backgroundColor: '#000' },
    selectText: { fontWeight: '700', fontSize: 12, color: '#999' },
    selectTextActive: { color: '#fff' },
    dateBtn: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 16, alignItems: 'center' },
    createBtn: { backgroundColor: '#000', height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: {width:0, height:4} },
    createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    // Request Card
    actionBtn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end", padding: 10 },
    modalContent: { backgroundColor: "white", borderRadius: 24, padding: 24, gap: 16, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: "800", textAlign: 'center' },
    modalBtn: { flex: 1, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },

    // FAB Styles
    fabContainer: {
        position: 'absolute',
        bottom: 110, // Sits above the HomeGate nav bar
        right: 24,
        zIndex: 100,
    },
    fabButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FF5A36', // Matches orange nav color
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#FF5A36",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    fabIcon: {
        fontSize: 32,
        color: 'white',
        fontWeight: '400',
        marginTop: -4,
        marginLeft: 2
    }
});