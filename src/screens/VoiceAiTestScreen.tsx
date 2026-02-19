import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { Audio } from "expo-av";
import { supabase } from "../lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export default function VoiceAiTestScreen() {
  const recordingRef = useRef<Audio.Recording | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const [status, setStatus] = useState<string>("Idle");
  const [transcribeResult, setTranscribeResult] = useState<any>(null);
  const [actionResult, setActionResult] = useState<any>(null);

  const [spaceId, setSpaceId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        const userId = sessionData.session?.user?.id;
        if (!userId) return;

        // Get first space_id for this user
        const { data, error } = await supabase
          .from("space_members")
          .select("space_id")
          .eq("user_id", userId)
          .limit(1);

        if (error) throw error;
        const id = data?.[0]?.space_id ?? null;
        setSpaceId(id);
      } catch (e: any) {
        setStatus(`Space load error: ${e?.message ?? String(e)}`);
      }
    })();
  }, []);

  const startRecording = async () => {
    try {
      setTranscribeResult(null);
      setActionResult(null);
      setStatus("");

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Microphone permission is required.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      recordingRef.current = rec;

      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();

      setIsRecording(true);
      setStatus("Recording...");
    } catch (e: any) {
      setStatus(`Start error: ${e?.message ?? String(e)}`);
    }
  };

  const stopRecording = async () => {
    try {
      const rec = recordingRef.current;
      if (!rec) return;

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;

      setIsRecording(false);
      setAudioUri(uri ?? null);
      setStatus(uri ? `Saved: ${uri}` : "No URI produced");
    } catch (e: any) {
      setIsRecording(false);
      setStatus(`Stop error: ${e?.message ?? String(e)}`);
    }
  };

  async function getAccessToken() {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("No access_token. Are you logged in?");
    return accessToken;
  }

  const callTranscribe = async (): Promise<{ ok: boolean; text?: string; raw?: any }> => {
    setTranscribeResult(null);

    if (!SUPABASE_URL) {
      setStatus("Missing SUPABASE URL env (EXPO_PUBLIC_SUPABASE_URL).");
      return { ok: false };
    }
    if (!audioUri) {
      setStatus("Record something first.");
      return { ok: false };
    }

    const accessToken = await getAccessToken();

    setStatus("Uploading to ai_transcribe...");

    const fd = new FormData();
    fd.append("file", {
      uri: audioUri,
      name: "voice.m4a",
      type: "audio/m4a", // if needed: "audio/mp4"
    } as any);

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai_transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // do NOT set Content-Type for FormData in RN
      },
      body: fd,
    });

    const textRaw = await resp.text();
    let json: any = null;
    try {
      json = JSON.parse(textRaw);
    } catch {}

    const out = {
      http: resp.status,
      raw: textRaw,
      json,
    };
    setTranscribeResult(out);

    if (!resp.ok) {
      setStatus(`ai_transcribe failed: HTTP ${resp.status}`);
      return { ok: false, raw: out };
    }

    const transcript = json?.text ?? "";
    setStatus("✅ Transcribed!");
    return { ok: true, text: transcript, raw: out };
  };

  const callAction = async (text: string) => {
    setActionResult(null);

    if (!SUPABASE_URL) {
      setStatus("Missing SUPABASE URL env (EXPO_PUBLIC_SUPABASE_URL).");
      return;
    }
    if (!spaceId) {
      setStatus("No spaceId found. Join/create a space first (space_members).");
      return;
    }

    const accessToken = await getAccessToken();

    setStatus("Sending to ai_action...");

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai_action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ space_id: spaceId, text }),
    });

    const raw = await resp.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {}

    const out = { http: resp.status, raw, json };
    setActionResult(out);

    if (!resp.ok) {
      setStatus(`ai_action failed: HTTP ${resp.status}`);
      return;
    }

    setStatus("✅ Created! (task/note/meal)");
  };

  const transcribeOnly = async () => {
    try {
      setActionResult(null);
      const t = await callTranscribe();
      if (!t.ok) return;
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    }
  };

  const transcribeAndCreate = async () => {
    try {
      setActionResult(null);
      const t = await callTranscribe();
      if (!t.ok || !t.text) return;

      // If transcript is empty, don’t call ai_action
      const cleaned = t.text.trim();
      if (!cleaned) {
        setStatus("Transcribed text is empty. Try speaking louder/closer.");
        return;
      }

      await callAction(cleaned);
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 200 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        Voice → Transcribe → Create (ai_action)
      </Text>

      <Text style={{ marginBottom: 10, fontFamily: "Courier" }}>
        spaceId: {spaceId ?? "(not found yet)"}
      </Text>

      <View style={{ gap: 10 }}>
        <Pressable
          onPress={isRecording ? stopRecording : startRecording}
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: isRecording ? "#b91c1c" : "#111827",
          }}
        >
          <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>
            {isRecording ? "Stop Recording" : "Start Recording"}
          </Text>
        </Pressable>

        <Pressable
          onPress={transcribeOnly}
          disabled={!audioUri || isRecording}
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: !audioUri || isRecording ? "#9ca3af" : "#111827",
          }}
        >
          <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>
            Transcribe Only
          </Text>
        </Pressable>

        <Pressable
          onPress={transcribeAndCreate}
          disabled={!audioUri || isRecording}
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: !audioUri || isRecording ? "#9ca3af" : "#111827",
          }}
        >
          <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>
            Transcribe + Create Task/Note/Meal
          </Text>
        </Pressable>

        <Text style={{ marginTop: 6, fontFamily: "Courier" }}>
          {status || "Idle"}
        </Text>

        {transcribeResult && (
          <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 }}>
            <Text style={{ fontWeight: "700", marginBottom: 6 }}>ai_transcribe</Text>
            <Text style={{ fontFamily: "Courier", marginBottom: 8 }}>
              HTTP: {transcribeResult.http}
            </Text>
            <Text style={{ fontFamily: "Courier" }}>
              {transcribeResult.json?.text ?? transcribeResult.raw}
            </Text>
          </View>
        )}

        {actionResult && (
          <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 }}>
            <Text style={{ fontWeight: "700", marginBottom: 6 }}>ai_action</Text>
            <Text style={{ fontFamily: "Courier", marginBottom: 8 }}>
              HTTP: {actionResult.http}
            </Text>
            <Text style={{ fontFamily: "Courier" }}>
              {actionResult.json ? JSON.stringify(actionResult.json, null, 2) : actionResult.raw}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}