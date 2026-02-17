import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, Share } from "react-native";
import { supabase } from "../lib/supabase";

function generateInviteCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function HomeSetupScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [loading, setLoading] = useState(false);

  const [homeName, setHomeName] = useState("Our Home");
  const [inviteCode, setInviteCode] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const deepLink = useMemo(() => {
    const code = createdCode ?? inviteCode.trim();
    return code ? `tume://join?code=${code}` : "tume://join";
  }, [createdCode, inviteCode]);

  const shareInvite = async (code: string) => {
    const message =
      `🏡 Join my Tume Home!\n\n` +
      `Invite code: ${code}\n` +
      `If you have the app, you can also tap: ${`tume://join?code=${code}`}\n\n` +
      `Open Tume → Join Home → paste the code.`;

    await Share.share({ message });
  };

  const createHome = async () => {
  if (!homeName.trim()) return Alert.alert("Missing info", "Please enter a Home name.");

  try {
    setLoading(true);
    const code = generateInviteCode();

    const { data, error } = await supabase.rpc("create_home", {
      p_name: homeName.trim(),
      p_invite_code: code,
    });

    if (error) {
      const msg = error.message || "";
      if (msg.includes("ALREADY_IN_HOME")) {
        Alert.alert("Already in a Home", "You can only have one Home.");
        onDone(); // go to Home screen
        return;
      }
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.invite_code) throw new Error("Failed to create Home.");

    setCreatedCode(row.invite_code);
    Alert.alert("Home created ✅", `Invite code: ${row.invite_code}`);
  } catch (e: any) {
    Alert.alert("Create failed", e?.message ?? "Something went wrong.");
  } finally {
    setLoading(false);
  }
};

const joinHome = async () => {
  const code = inviteCode.trim().toUpperCase();
  if (!code) return Alert.alert("Missing info", "Please enter an invite code.");

  try {
    setLoading(true);
    const { error } = await supabase.rpc("join_home", { p_invite_code: code });

    if (error) {
      const msg = error.message || "";
      if (msg.includes("INVALID_INVITE_CODE")) throw new Error("That invite code is not valid.");
      if (msg.includes("ALREADY_IN_HOME")) {
        Alert.alert("Already in a Home", "You can only have one Home.");
        onDone();
        return;
      }
      throw error;
    }

    Alert.alert("Joined Home ✅", "You're in!");
    onDone(); // go to Home screen
  } catch (e: any) {
    Alert.alert("Join failed", e?.message ?? "Something went wrong.");
  } finally {
    setLoading(false);
  }
};

  const buttonStyle = {
    height: 52 as const,
    borderRadius: 14 as const,
    borderWidth: 1 as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    opacity: loading ? 0.6 : 1,
  };

  const inputStyle = {
    height: 48 as const,
    borderWidth: 1 as const,
    borderRadius: 12 as const,
    paddingHorizontal: 12 as const,
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "800" }}>Create your Home 🏡</Text>
      <Text style={{ opacity: 0.7 }}>Invite your partner to join with a code.</Text>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => setMode("create")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            alignItems: "center",
            opacity: mode === "create" ? 1 : 0.5,
          }}
        >
          <Text>Create</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("join")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            alignItems: "center",
            opacity: mode === "join" ? 1 : 0.5,
          }}
        >
          <Text>Join</Text>
        </Pressable>
      </View>

      {mode === "create" ? (
        <>
          <TextInput
            value={homeName}
            onChangeText={setHomeName}
            placeholder="Home name (e.g., Our Home)"
            style={inputStyle}
          />

          <Pressable onPress={createHome} disabled={loading} style={buttonStyle}>
            {loading ? <ActivityIndicator /> : <Text style={{ fontSize: 16 }}>Create Home</Text>}
          </Pressable>

          {createdCode && (
            <View style={{ gap: 10 }}>
              <View style={{ borderWidth: 1, borderRadius: 12, padding: 14 }}>
                <Text style={{ opacity: 0.7 }}>Invite code</Text>
                <Text style={{ fontSize: 22, fontWeight: "800", marginTop: 6 }}>{createdCode}</Text>
                <Text style={{ opacity: 0.6, marginTop: 6 }}>{deepLink}</Text>
              </View>

              <Pressable
                onPress={() => shareInvite(createdCode)}
                disabled={loading}
                style={buttonStyle}
              >
                <Text style={{ fontSize: 16 }}>Share Invite</Text>
              </Pressable>

              <Pressable
                onPress={onDone}
                disabled={loading}
                style={buttonStyle}
              >
                <Text style={{ fontSize: 16 }}>Continue</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <>
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="Enter invite code"
            autoCapitalize="characters"
            style={inputStyle}
          />

          <Pressable onPress={joinHome} disabled={loading} style={buttonStyle}>
            {loading ? <ActivityIndicator /> : <Text style={{ fontSize: 16 }}>Join Home</Text>}
          </Pressable>
        </>
      )}
    </View>
  );
}