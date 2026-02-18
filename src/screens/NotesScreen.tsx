import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from "react-native";
import { supabase } from "../lib/supabase";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/Swipeable";

// --- Types ---

type Member = {
  user_id: string;
  profiles: {
    nickname: string | null;
    first_name: string | null;
    avatar_url: string | null;
  } | null;
};

type NoteRow = {
  id: string;
  space_id: string;
  owner_id: string;
  visibility: "shared" | "personal";
  title: string;
  content: string | null;
  is_checklist: boolean;
  updated_at: string;
};

type ItemRow = {
  id: string;
  note_id: string;
  text: string;
  is_done: boolean;
  position: number;
  updated_at: string;
};

type DraftItem = {
  id: string;
  text: string;
  is_done: boolean;
  position: number;
  isLocal?: boolean;
};

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

// --- Visual Constants ---

const COLORS = [
  { bg: "#E0Dbf0", text: "#1C1C1E", pillBorder: "#1C1C1E", pillText: "#1C1C1E" }, // Light Purple
  { bg: "#E9F588", text: "#1C1C1E", pillBorder: "#1C1C1E", pillText: "#1C1C1E" }, // Acid Yellow
  { bg: "#3661D6", text: "#FFFFFF", pillBorder: "#FFFFFF", pillText: "#FFFFFF" }, // Deep Blue
  { bg: "#EE6B4D", text: "#FFFFFF", pillBorder: "#FFFFFF", pillText: "#FFFFFF" }, // Orange/Red
  { bg: "#D4C4FB", text: "#1C1C1E", pillBorder: "#1C1C1E", pillText: "#1C1C1E" }, // Lavender
];

const getTheme = (index: number) => COLORS[index % COLORS.length];

// --- Components ---

function AvatarBubble({
  uri,
  label,
  size = 34,
  inverse = false,
}: {
  uri?: string | null;
  label: string;
  size?: number;
  inverse?: boolean;
}) {
  const initials = useMemo(() => initialsFromName(label), [label]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: inverse ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.1)",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: inverse ? "rgba(255,255,255,0.2)" : "white",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontWeight: "900", color: inverse ? "white" : "black", fontSize: size * 0.4 }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

function AvatarStack({
  left,
  right,
  size = 32,
  inverse = false,
}: {
  left: { uri?: string | null; label: string };
  right?: { uri?: string | null; label: string } | null;
  size?: number;
  inverse?: boolean;
}) {
  if (!right) return <AvatarBubble uri={left.uri} label={left.label} size={size} inverse={inverse} />;

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
        style={{
          height: 80,
          width: 80,
          borderRadius: 40,
          backgroundColor: "#ff3b30",
          alignItems: "center",
          justifyContent: "center",
        }}
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

export default function NotesScreen({
  spaceId,
  members,
  onBack,
}: {
  spaceId: string;
  members: Member[];
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"shared" | "personal" | "create">("shared");

  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [me, setMe] = useState<string>("");

  const [openNote, setOpenNote] = useState<NoteRow | null>(null);

  // editor state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);

  // checklist draft
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // create
  const [createTitle, setCreateTitle] = useState("");
  const [createVisibility, setCreateVisibility] = useState<"shared" | "personal">("shared");
  const [createType, setCreateType] = useState<"text" | "checklist">("text");

  // --- Animation Ref for FAB ---
  const fabAnim = useRef(new Animated.Value(0)).current;

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  const meMember = useMemo(() => (me ? memberMap.get(me) || null : null), [me, memberMap]);
  const partnerMember = useMemo(() => {
    if (!me) return null;
    return members.find((m) => m.user_id !== me) || null;
  }, [members, me]);

  const defaults = useMemo(
    () => new Set(["Movies to Watch", "Holiday Location", "Personal Note"]),
    []
  );

  // --- Effects for FAB Animation ---
  useEffect(() => {
    // Show FAB only when not in 'create' mode and no note is open
    const shouldShow = !openNote && tab !== 'create';
    
    Animated.spring(fabAnim, {
      toValue: shouldShow ? 1 : 0,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [openNote, tab]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const { data: s, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;
      const user = s.session?.user;
      if (!user) throw new Error("No session");
      setMe(user.id);

      await supabase.rpc("ensure_default_notes", { p_space_id: spaceId });

      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("space_id", spaceId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setNotes((data as any) ?? []);
    } catch (e: any) {
      Alert.alert("Notes", e?.message ?? "Failed to load notes.");
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (noteId: string) => {
    const { data, error } = await supabase
      .from("note_items")
      .select("*")
      .eq("note_id", noteId)
      .order("position", { ascending: true });

    if (error) throw error;

    const rows: ItemRow[] = ((data as any) ?? []) as ItemRow[];
    setDraftItems(
      rows.map((r) => ({
        id: r.id,
        text: r.text,
        is_done: r.is_done,
        position: r.position,
        isLocal: false,
      }))
    );
    setDeletedIds(new Set());
  };

  useEffect(() => {
    loadNotes();
    const channel = supabase
      .channel(`notes:${spaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes", filter: `space_id=eq.${spaceId}` },
        (payload) => {
          const changed = payload.new as any;
          if (openNote?.id && changed?.id === openNote.id) {
            if (dirty) setRemoteChanged(true);
            else {
              loadNotes().then(async () => {
                const { data } = await supabase.from("notes").select("*").eq("id", openNote.id).single();
                const n = data as any as NoteRow;
                setOpenNote(n);
                setEditTitle(n.title);
                setEditContent(n.content ?? "");
              });
            }
          } else {
            loadNotes();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [spaceId, openNote?.id, dirty]);

  useEffect(() => {
    if (!openNote?.id || !openNote.is_checklist) return;
    const ch = supabase
      .channel(`note_items:${openNote.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "note_items", filter: `note_id=eq.${openNote.id}` },
        () => {
          if (dirty) setRemoteChanged(true);
          else loadItems(openNote.id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [openNote?.id, openNote?.is_checklist, dirty]);

  const open = async (n: NoteRow) => {
    setOpenNote(n);
    setEditTitle(n.title);
    setEditContent(n.content ?? "");
    setDirty(false);
    setRemoteChanged(false);
    if (n.is_checklist) {
      await loadItems(n.id);
    } else {
      setDraftItems([]);
      setDeletedIds(new Set());
    }
  };

  const confirmDeleteNote = async (n: NoteRow) => {
    if (defaults.has(n.title)) {
      Alert.alert("Not allowed", "Default notes cannot be deleted.");
      return;
    }
    Alert.alert("Delete note?", "This will permanently delete this note.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await supabase.from("notes").delete().eq("id", n.id);
            if (openNote?.id === n.id) setOpenNote(null);
            await loadNotes();
          } catch (e: any) {
            Alert.alert("Error", e.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const saveOpenNote = async () => {
    if (!openNote) return;
    try {
      setLoading(true);
      const nextTitle = editTitle.trim() || openNote.title;

      if (openNote.is_checklist) {
        await supabase.from("notes").update({ title: nextTitle }).eq("id", openNote.id);
        const deleteList = Array.from(deletedIds).filter((id) => !id.startsWith("local-"));
        if (deleteList.length) await supabase.from("note_items").delete().in("id", deleteList);

        const toInsert = draftItems.filter((it) => it.id.startsWith("local-")).map((it) => ({
          note_id: openNote.id,
          text: it.text,
          is_done: it.is_done,
          position: it.position,
        }));
        if (toInsert.length) await supabase.from("note_items").insert(toInsert);

        const toUpsert = draftItems.filter((it) => !it.id.startsWith("local-")).map((it) => ({
          id: it.id,
          note_id: openNote.id,
          text: it.text,
          is_done: it.is_done,
          position: it.position,
        }));
        if (toUpsert.length) await supabase.from("note_items").upsert(toUpsert, { onConflict: "id" });
      } else {
        await supabase.from("notes").update({ title: nextTitle, content: editContent }).eq("id", openNote.id);
      }
      setDirty(false);
      setOpenNote(null);
      await loadNotes();
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const addChecklistItemDraft = () => {
    const maxPos = draftItems.length ? Math.max(...draftItems.map((i) => i.position)) : -1;
    setDraftItems([...draftItems, {
      id: `local-${Date.now()}`,
      text: "",
      is_done: false,
      position: maxPos + 1,
      isLocal: true,
    }]);
    setDirty(true);
  };

  const updateDraftItem = (id: string, patch: Partial<DraftItem>) => {
    setDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    setDirty(true);
  };

  const deleteDraftItem = (id: string) => {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
    if (!id.startsWith("local-")) setDeletedIds((prev) => new Set(prev).add(id));
    setDirty(true);
  };

  const createNote = async () => {
    if (!createTitle.trim()) return Alert.alert("Required", "Please add a title");
    try {
      setLoading(true);
      const isChecklist = createType === "checklist";
      const { data } = await supabase
        .from("notes")
        .insert({
          space_id: spaceId,
          owner_id: me,
          visibility: createVisibility,
          title: createTitle.trim(),
          is_checklist: isChecklist,
          content: isChecklist ? null : "",
        })
        .select()
        .single();
      
      setCreateTitle("");
      setTab(createVisibility === "personal" ? "personal" : "shared");
      await loadNotes();
      if (data) open(data as any);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const list = tab === "shared" ? notes.filter(n => n.visibility === "shared") : notes.filter(n => n.visibility === "personal");

  if (loading && !notes.length) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9F9F9" }}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // --- EDITOR VIEW (Clean White) ---
  if (openNote) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Adjusted padding to sit below global header */}
        <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: 130 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 20 }}>
            <Pressable onPress={() => setOpenNote(null)} style={styles.iconBtn}>
              <Text style={{ fontSize: 24 }}>←</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
               {openNote.visibility === 'shared' && <AvatarStack left={{ uri: meMember?.profiles?.avatar_url, label: nameOf(meMember) }} right={partnerMember ? { uri: partnerMember.profiles?.avatar_url, label: nameOf(partnerMember) } : null} />}
              <Pressable onPress={saveOpenNote} style={[styles.pillBtn, { backgroundColor: dirty ? "#000" : "#f0f0f0" }]}>
                <Text style={{ color: dirty ? "#fff" : "#aaa", fontWeight: "700" }}>Save</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ paddingHorizontal: 24, flex: 1 }}>
            <TextInput
              value={editTitle}
              onChangeText={(t) => { setEditTitle(t); setDirty(true); }}
              placeholder="Title"
              style={{ fontSize: 32, fontWeight: "800", marginBottom: 20, color: "#000" }}
              multiline
            />

            {openNote.is_checklist ? (
              <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                 <Pressable onPress={addChecklistItemDraft} style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><Text style={{color:'white', fontWeight:'bold'}}>+</Text></View>
                    <Text style={{ fontWeight: 'bold', color: '#666'}}>Add Item</Text>
                 </Pressable>
                {draftItems.map((it) => (
                  <View key={it.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 }}>
                    <Pressable
                      onPress={() => updateDraftItem(it.id, { is_done: !it.is_done })}
                      style={{
                        width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: it.is_done ? "#000" : "#ddd",
                        backgroundColor: it.is_done ? "#000" : "transparent", alignItems: "center", justifyContent: "center"
                      }}
                    >
                      {it.is_done && <Text style={{ color: "white", fontSize: 14 }}>✓</Text>}
                    </Pressable>
                    <TextInput
                      value={it.text}
                      onChangeText={(t) => updateDraftItem(it.id, { text: t })}
                      placeholder="To do..."
                      style={{ flex: 1, fontSize: 18, fontWeight: "500", textDecorationLine: it.is_done ? 'line-through' : 'none', color: it.is_done ? '#aaa' : '#000' }}
                    />
                    <Pressable onPress={() => deleteDraftItem(it.id)} hitSlop={10}>
                       <Text style={{color: '#ccc', fontSize: 18}}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <TextInput
                value={editContent}
                onChangeText={(t) => { setEditContent(t); setDirty(true); }}
                placeholder="Start typing..."
                multiline
                style={{ fontSize: 18, lineHeight: 28, color: "#333", flex: 1, textAlignVertical: "top" }}
              />
            )}
          </View>
        </View>
      </GestureHandlerRootView>
    );
  }

  // --- MAIN LIST VIEW ---
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        
        {/* Pinned Tabs (Below Global Header) */}
        {tab !== "create" && (
           <View style={styles.topTabsBar}>
             {["shared", "personal"].map((t) => {
               const isActive = tab === t;
               return (
                 <Pressable
                   key={t}
                   onPress={() => setTab(t as any)}
                   style={{
                     paddingVertical: 8,
                     paddingHorizontal: 16,
                     borderRadius: 20,
                     backgroundColor: isActive ? "#000" : "#f4f4f4",
                     borderWidth: 1,
                     borderColor: isActive ? "#000" : "#f4f4f4"
                   }}
                 >
                  <Text style={{ fontWeight: "700", color: isActive ? "#fff" : "#888", textTransform: "capitalize" }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                 </Pressable>
               );
             })}
           </View>
        )}

        {/* Content Area */}
        {tab === "create" ? (
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 140, paddingBottom: 150 }}>
            <View style={{ backgroundColor: "#FAFAFA", borderRadius: 32, padding: 30, gap: 20 }}>
               <Text style={{ fontSize: 24, fontWeight: "800" }}>New Collection</Text>
               
               <View>
                 <Text style={styles.label}>TITLE</Text>
                 <TextInput 
                   value={createTitle} 
                   onChangeText={setCreateTitle} 
                   style={styles.input} 
                   placeholder="e.g. Groceries" 
                   autoFocus
                 />
               </View>

               <View>
                 <Text style={styles.label}>VISIBILITY</Text>
                 <View style={{flexDirection: 'row', gap: 10}}>
                    {['shared', 'personal'].map(v => (
                        <Pressable 
                          key={v}
                          onPress={() => setCreateVisibility(v as any)}
                          style={[styles.selectBtn, createVisibility === v && styles.selectBtnActive]}
                        >
                            <Text style={[styles.selectText, createVisibility === v && styles.selectTextActive]}>{v.toUpperCase()}</Text>
                        </Pressable>
                    ))}
                 </View>
               </View>

               <View>
                 <Text style={styles.label}>TYPE</Text>
                 <View style={{flexDirection: 'row', gap: 10}}>
                    {['text', 'checklist'].map(v => (
                        <Pressable 
                          key={v}
                          onPress={() => setCreateType(v as any)}
                          style={[styles.selectBtn, createType === v && styles.selectBtnActive]}
                        >
                            <Text style={[styles.selectText, createType === v && styles.selectTextActive]}>{v.toUpperCase()}</Text>
                        </Pressable>
                    ))}
                 </View>
               </View>

               <Pressable onPress={createNote} style={styles.createBtn}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 16}}>Create Collection</Text>}
               </Pressable>
               
               <Pressable onPress={() => setTab("shared")} style={{alignItems: 'center', padding: 10}}>
                   <Text style={{fontWeight: 'bold', color: '#888'}}>Cancel</Text>
               </Pressable>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 180, paddingBottom: 150, gap: 16 }}>
            {list.length === 0 ? (
                <View style={{padding: 40, alignItems: 'center'}}>
                    <Text style={{color: '#ccc', fontSize: 18, fontWeight: '600'}}>No notes found</Text>
                </View>
            ) : null}

            {list.map((n, index) => {
              const theme = getTheme(index);
              const isShared = n.visibility === "shared";
              const canDelete = !defaults.has(n.title);

              const Card = (
                <Pressable
                  onPress={() => open(n)}
                  style={{
                    backgroundColor: theme.bg,
                    borderRadius: 32,
                    padding: 24,
                    minHeight: 180,
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text 
                      style={{ fontSize: 32, fontWeight: "800", color: theme.text, flex: 1, lineHeight: 36, letterSpacing: -0.5 }} 
                      numberOfLines={2}
                    >
                      {n.title}
                    </Text>
                    {/* Arrow Icon Circle */}
                    <View style={{
                        width: 40, height: 40, borderRadius: 20, 
                        borderWidth: 1, borderColor: theme.pillBorder, 
                        alignItems: 'center', justifyContent: 'center',
                        opacity: 0.4
                    }}>
                        <Text style={{color: theme.text, fontSize: 18, fontWeight: 'bold'}}>→</Text>
                    </View>
                  </View>

                  <View style={{flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'}}>
                    {/* Pills */}
                    <View style={{gap: 8}}>
                        <View style={{
                            borderWidth: 1, 
                            borderColor: theme.pillBorder, 
                            borderRadius: 20, 
                            paddingHorizontal: 12, 
                            paddingVertical: 6,
                            alignSelf: 'flex-start'
                        }}>
                            <Text style={{color: theme.pillText, fontSize: 12, fontWeight: '600'}}>
                                {n.is_checklist ? "Checklist" : "Text Note"}
                            </Text>
                        </View>
                        {isShared && (
                             <View style={{
                                borderWidth: 1, 
                                borderColor: theme.pillBorder, 
                                borderRadius: 20, 
                                paddingHorizontal: 12, 
                                paddingVertical: 6,
                                alignSelf: 'flex-start'
                            }}>
                                <Text style={{color: theme.pillText, fontSize: 12, fontWeight: '600'}}>
                                    {isShared ? "Shared" : "Private"}
                                </Text>
                            </View>
                        )}
                    </View>
                    
                    {/* Avatar or Info */}
                    <View>
                        {isShared ? (
                            <AvatarStack 
                                left={{ uri: meMember?.profiles?.avatar_url, label: nameOf(meMember) }}
                                right={partnerMember ? { uri: partnerMember.profiles?.avatar_url, label: nameOf(partnerMember) } : null}
                                size={36}
                                inverse={theme.text === '#FFFFFF'}
                            />
                        ) : (
                            <Text style={{color: theme.text, opacity: 0.6, fontWeight: '600', fontSize: 12}}>
                                Updated {new Date(n.updated_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                            </Text>
                        )}
                    </View>
                  </View>
                </Pressable>
              );

              if (!canDelete) return <View key={n.id}>{Card}</View>;

              return (
                <View key={n.id} style={{borderRadius: 32, overflow: 'hidden'}}>
                     <SwipeRow onDelete={() => confirmDeleteNote(n)}>{Card}</SwipeRow>
                </View>
              );
            })}
          </ScrollView>
        )}

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
    iconBtn: {
        width: 40, height: 40, justifyContent: 'center',
    },
    pillBtn: {
        paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    },
    label: {
        fontSize: 12, fontWeight: '700', color: '#999', marginBottom: 8, letterSpacing: 1
    },
    input: {
        fontSize: 18, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 8
    },
    selectBtn: {
        flex: 1, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fff', alignItems: 'center'
    },
    selectBtnActive: {
        borderColor: '#000', backgroundColor: '#000'
    },
    selectText: {
        fontWeight: '700', fontSize: 12, color: '#999'
    },
    selectTextActive: {
        color: '#fff'
    },
    createBtn: {
        backgroundColor: '#000', height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: {width:0, height:4}
    },
    
    // Top Tabs Pinned
    topTabsBar: {
        position: 'absolute',
        top: 120, 
        left: 0, 
        right: 0,
        zIndex: 50,
        paddingHorizontal: 24,
        flexDirection: "row", 
        gap: 12
    },

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
        backgroundColor: '#FF5A36', 
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