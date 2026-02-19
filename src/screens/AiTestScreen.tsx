import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

const FN_NAME = "ai_action";

export default function AiTestScreen({
  spaceId,
  onBack,
}: {
  spaceId: string;
  onBack: () => void;
}) {
  const [prompt, setPrompt] = useState(
    "Create a task: Buy groceries tomorrow 6pm for both"
  );
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");

  const url = useMemo(() => process.env.EXPO_PUBLIC_SUPABASE_URL ?? "", []);
  const anonKey = useMemo(
    () => process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    []
  );

  function append(s: string) {
    setLog((prev) => (prev ? `${prev}\n${s}` : s));
  }

  async function run() {
    try {
      setBusy(true);
      setLog("");

      append(`SUPABASE URL: ${url}`);
      append(`ANON KEY exists: ${!!anonKey}`);
      append(`Function: ${FN_NAME}`);
      append(`spaceId: ${spaceId}`);

      if (!spaceId) {
        Alert.alert("Missing spaceId", "spaceId is undefined.");
        return;
      }
      if (!url || !anonKey) {
        Alert.alert(
          "Missing env",
          "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing."
        );
        return;
      }

      // session
      const { data: sessionData, error: sessErr } =
        await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const session = sessionData.session;
      append(`Has session: ${!!session}`);
      append(`Has access_token: ${!!session?.access_token}`);

      if (!session?.access_token) {
        Alert.alert("Not signed in", "Login first.");
        return;
      }

      // ✅ Direct fetch to see real body (invoke() hides useful details sometimes)
      const fnUrl = `${url}/functions/v1/${FN_NAME}`;

      append(`Calling: ${fnUrl}`);
      append(`Auth header starts with: Bearer ${session.access_token.slice(0, 10)}...`);

      const r = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // BOTH are important:
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ space_id: spaceId, text: prompt }),
      });

      const text = await r.text();
      append(`HTTP: ${r.status}`);
      append(`Raw response: ${text}`);

      if (!r.ok) {
        Alert.alert("Edge Function failed", `HTTP ${r.status}\n${text}`);
        return;
      }

      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // ok - already printed raw text
      }

      append("✅ OK");
      if (json) append(JSON.stringify(json, null, 2));

      Alert.alert("Success", "Edge function call worked ✅");
    } catch (e: any) {
      append(`ERROR: ${e?.message ?? String(e)}`);
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={onBack} style={styles.btnSmall}>
          <Text style={styles.btnSmallText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>AI Test</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Prompt</Text>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          style={styles.input}
          multiline
          placeholder="Try: Add dinner pasta tonight cooked by me dishes by both"
          placeholderTextColor="#777"
        />

        <Pressable
          onPress={run}
          disabled={busy}
          style={[styles.btn, busy && { opacity: 0.6 }]}
        >
          <Text style={styles.btnText}>
            {busy ? "Testing..." : "Test Edge Function"}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.logBox} contentContainerStyle={{ padding: 12 }}>
        <Text style={styles.logText}>{log || "Logs will appear here..."}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", paddingTop: 60 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#000" },
  btnSmall: {
    borderWidth: 2,
    borderColor: "#000",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  btnSmallText: { fontWeight: "800", color: "#000" },

  card: {
    margin: 16,
    borderWidth: 2,
    borderColor: "#000",
    borderRadius: 18,
    padding: 14,
  },
  label: { fontWeight: "900", color: "#000", marginBottom: 8 },
  input: {
    borderWidth: 2,
    borderColor: "#000",
    borderRadius: 14,
    padding: 12,
    minHeight: 90,
    color: "#000",
  },

  btn: {
    marginTop: 12,
    backgroundColor: "#000",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "900" },

  logBox: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#000",
    borderRadius: 18,
  },
  logText: { color: "#000", fontFamily: "Menlo", fontSize: 12 },
});