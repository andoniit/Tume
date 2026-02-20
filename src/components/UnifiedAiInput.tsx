import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
  Easing,
  Alert,
  Keyboard,
  ScrollView
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { supabase } from "../lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Pre-created Prompts for Autocomplete ---
const SUGGESTED_PROMPTS = [
  "Create a task buy groceries tomorrow and assign to me",
  "Add a task: pay rent on Monday assigned to both",
  "Remind my partner to book dentist appointment",
  "Task: pick up parcel at 6 pm tomorrow",
  "Create a shared note called Meal prep ideas",
  "Make a personal checklist: laundry, emails, workout",
  "Set dinner on Friday: Pasta. Cooked by me",
  "Add lunch on Monday: Salad bowls",
  "Plan dinner for tomorrow: Tacos",
];

interface UnifiedAiInputProps {
  spaceId?: string;
  onComplete: () => Promise<void> | void;
}

export default function UnifiedAiInput({ spaceId, onComplete }: UnifiedAiInputProps) {
  const [aiInputText, setAiInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [aiStatus, setAiStatus] = useState("What's on your mind?");
  const [spokenText, setSpokenText] = useState("");
  
  // Suggestion State
  const [isFocused, setIsFocused] = useState(false);
  const [filteredPrompts, setFilteredPrompts] = useState<string[]>(SUGGESTED_PROMPTS.slice(0, 4));
  
  const recordingRef = useRef<Audio.Recording | null>(null);

  // --- Animation Refs ---
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const statusTranslateY = useRef(new Animated.Value(0)).current;
  const inputScale = useRef(new Animated.Value(1)).current;
  
  const spokenOpacity = useRef(new Animated.Value(0)).current;
  const spokenTranslateY = useRef(new Animated.Value(-15)).current;

  const suggestionsOpacity = useRef(new Animated.Value(0)).current;
  const suggestionsTranslateY = useRef(new Animated.Value(10)).current;

  // --- Continuous Background Rotation ---
  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 5000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // --- Dynamic Feedback Animations ---
  const animateStatus = useCallback((newText: string) => {
    Animated.parallel([
      Animated.timing(statusOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(statusTranslateY, { toValue: 5, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setAiStatus(newText);
      Animated.parallel([
        Animated.timing(statusOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(statusTranslateY, { toValue: 0, friction: 5, useNativeDriver: true }),
      ]).start();
    });
  }, [statusOpacity, statusTranslateY]);

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true }).start();
  }, [pulseAnim]);

  // --- Suggestions & Typing Handlers ---
  const handleTextChange = (text: string) => {
    setAiInputText(text);
    if (text.trim().length === 0) {
      // Show random mix if empty
      setFilteredPrompts(SUGGESTED_PROMPTS.slice(0, 4));
    } else {
      // Filter based on input
      const lowerText = text.toLowerCase();
      const matches = SUGGESTED_PROMPTS.filter(p => p.toLowerCase().includes(lowerText));
      setFilteredPrompts(matches.slice(0, 4)); // Show top 4 matches
    }
  };

  const showSuggestions = () => {
    setIsFocused(true);
    Animated.parallel([
      Animated.timing(suggestionsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(suggestionsTranslateY, { toValue: 0, friction: 6, useNativeDriver: true })
    ]).start();
  };

  const hideSuggestions = () => {
    Animated.parallel([
      Animated.timing(suggestionsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(suggestionsTranslateY, { toValue: 10, duration: 200, useNativeDriver: true })
    ]).start(() => setIsFocused(false));
  };

  const handleSuggestionPress = (prompt: string) => {
    setAiInputText(prompt);
    Haptics.selectionAsync();
    // Keep it focused so they can edit, or they can just press send
  };

  const showSpokenText = () => {
    Animated.parallel([
      Animated.timing(spokenOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(spokenTranslateY, { toValue: 0, friction: 6, useNativeDriver: true })
    ]).start();
  };

  const hideSpokenText = () => {
    Animated.parallel([
      Animated.timing(spokenOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(spokenTranslateY, { toValue: -15, duration: 300, useNativeDriver: true })
    ]).start(() => setSpokenText(""));
  };

  // ==========================================
  // --- DIRECT SUPABASE FETCH LOGIC ---
  // ==========================================

  async function getAccessToken() {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;
    return sessionData.session?.access_token;
  }

  const handleTextSubmit = async () => {
    if (!aiInputText.trim() || !spaceId) return;
    
    const textPrompt = aiInputText.trim();
    setAiInputText(""); 
    hideSpokenText(); 
    hideSuggestions();
    Keyboard.dismiss();
    animateStatus("Thinking and organizing...");
    startPulse();

    try {
      const accessToken = await getAccessToken();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai_action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ space_id: spaceId, text: textPrompt }),
      });

      if (!resp.ok) throw new Error();

      stopPulse();
      animateStatus("All set! Added to your space ✨");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      await onComplete();
      setTimeout(() => animateStatus("What's next?"), 3500);
    } catch (err) {
      stopPulse();
      animateStatus("Oops, something went wrong. Let's try again.");
      setTimeout(() => animateStatus("What's on your mind?"), 3500);
    }
  };

  const handleRecordPressIn = async () => {
    try {
      hideSpokenText();
      hideSuggestions();
      Keyboard.dismiss();

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Microphone permission is required.");
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      recordingRef.current = rec;

      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();

      setIsRecording(true);
      animateStatus("Listening to you... (Release to send)");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      startPulse();
      Animated.spring(inputScale, { toValue: 1.02, friction: 4, useNativeDriver: true }).start();
    } catch (err) {
      animateStatus("Hmm, the mic isn't working right now.");
    }
  };

  const handleRecordPressOut = async () => {
    if (!isRecording || !spaceId) return;
    setIsRecording(false);
    Animated.spring(inputScale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    
    try {
      animateStatus("Understanding your voice...");
      const rec = recordingRef.current;
      if (!rec) return;
      
      await rec.stopAndUnloadAsync();
      const audioUri = rec.getURI();
      recordingRef.current = null;

      const accessToken = await getAccessToken();
      const fd = new FormData();
      fd.append("file", { uri: audioUri, name: "voice.m4a", type: "audio/m4a" } as any);

      const transcribeResp = await fetch(`${SUPABASE_URL}/functions/v1/ai_transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY! },
        body: fd,
      });

      const textRaw = await transcribeResp.text();
      let transcribeJson: any = null;
      try { transcribeJson = JSON.parse(textRaw); } catch {}

      const transcript = transcribeJson?.text ?? "";
      const cleaned = transcript.trim();
      
      if (!cleaned) {
        stopPulse();
        animateStatus("I didn't quite catch that. Speak a bit louder?");
        setTimeout(() => animateStatus("What's on your mind?"), 3500);
        return;
      }

      setSpokenText(cleaned);
      showSpokenText();

      animateStatus("Organizing your space...");
      const actionResp = await fetch(`${SUPABASE_URL}/functions/v1/ai_action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ space_id: spaceId, text: cleaned }),
      });

      if (!actionResp.ok) throw new Error();

      stopPulse();
      animateStatus("All set! Added to your space ✨");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      await onComplete(); 

      setTimeout(() => {
        hideSpokenText();
        animateStatus("What's next?");
      }, 4000);

    } catch (err) {
      stopPulse();
      animateStatus("Oops, I hit a snag. Let's try again.");
      setTimeout(() => {
        hideSpokenText();
        animateStatus("What's on your mind?");
      }, 4000);
    }
  };

  return (
    <View style={styles.aiSectionContainer}>
      <Animated.Text style={[
        styles.aiStatusText,
        { opacity: statusOpacity, transform: [{ translateY: statusTranslateY }] }
      ]}>
        {aiStatus}
      </Animated.Text>

      {/* Dynamic Suggestions (Autocomplete Chips) */}
      {(isFocused || filteredPrompts.length > 0) && (
        <Animated.View style={{
          opacity: suggestionsOpacity,
          transform: [{ translateY: suggestionsTranslateY }],
          marginBottom: 12,
          display: isFocused ? 'flex' : 'none'
        }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
            {filteredPrompts.map((prompt, index) => (
              <Pressable 
                key={index} 
                style={styles.suggestionChip}
                onPress={() => handleSuggestionPress(prompt)}
              >
                <Text style={styles.suggestionText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      )}
      
      <Animated.View style={[
        styles.aiInputWrapper,
        { transform: [{ scale: pulseAnim }, { scale: inputScale }] }
      ]}>
        <Animated.View style={[
          styles.gradientBorder, 
          { transform: [{ rotate: spin }] }, 
          isRecording ? { opacity: 0.9 } : { opacity: 0.3 }
        ]}>
          <LinearGradient
            colors={['#00F2FE', '#7B61FF', '#FF5A36', '#00F2FE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.aiInputInner}>
          <TextInput
            style={styles.aiTextInput}
            placeholder="Type or hold mic to speak..."
            placeholderTextColor="#9ca3af"
            value={aiInputText}
            onChangeText={handleTextChange}
            onFocus={showSuggestions}
            onBlur={hideSuggestions}
            onSubmitEditing={handleTextSubmit}
            returnKeyType="send"
            editable={!isRecording}
          />
          
          {aiInputText.length > 0 ? (
            <Pressable style={styles.actionAIBtn} onPress={handleTextSubmit}>
              <Text style={styles.sendIcon}>↗</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.actionAIBtn, isRecording ? styles.actionBtnRecording : null]}
              onPressIn={handleRecordPressIn}
              onPressOut={handleRecordPressOut}
            >
              <Text style={styles.micIcon}>{isRecording ? "⦿" : "🎤"}</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      {spokenText !== "" && (
        <Animated.View style={[
          styles.spokenTextContainer,
          { opacity: spokenOpacity, transform: [{ translateY: spokenTranslateY }] }
        ]}>
          <Text style={styles.spokenTextLabel}>You said:</Text>
          <Text style={styles.spokenTextValue}>"{spokenText}"</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  aiSectionContainer: { 
    marginBottom: 20, 
    marginTop: 10,
    paddingHorizontal: 4,
    position: 'relative',
    zIndex: 10
  },
  aiStatusText: { 
    fontSize: 13, 
    color: '#7B61FF', 
    marginBottom: 10, 
    marginLeft: 16, 
    fontWeight: '700', 
    letterSpacing: 0.5 
  },
  // --- New Suggestion Chip Styles ---
  suggestionChip: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
  },
  // ---------------------------------
  aiInputWrapper: { 
    height: 64, 
    width: '100%', 
    borderRadius: 32, 
    justifyContent: 'center', 
    alignItems: 'center', 
    overflow: 'hidden', 
    backgroundColor: '#ffffff', 
    shadowColor: '#7B61FF', 
    shadowOpacity: 0.15, 
    shadowRadius: 20, 
    shadowOffset: { width: 0, height: 8 }, 
    elevation: 8,
    zIndex: 2 
  },
  gradientBorder: { 
    position: 'absolute', 
    width: SCREEN_WIDTH * 1.5, 
    height: SCREEN_WIDTH * 1.5, 
  },
  aiInputInner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    width: '98%', 
    height: '90%', 
    backgroundColor: '#ffffff', 
    borderRadius: 30, 
    paddingLeft: 22, 
    paddingRight: 8,
    zIndex: 3 
  },
  aiTextInput: { 
    flex: 1, 
    height: '100%', 
    fontSize: 16, 
    color: '#111827', 
    fontWeight: '500' 
  },
  actionAIBtn: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#f3f4f6', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  actionBtnRecording: { 
    backgroundColor: '#FF5A36',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sendIcon: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: '#7B61FF' 
  },
  micIcon: { 
    fontSize: 20,
    color: '#fff' 
  },
  spokenTextContainer: {
    marginTop: 16,
    marginHorizontal: 12,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    zIndex: 1
  },
  spokenTextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  spokenTextValue: {
    fontSize: 15,
    color: '#334155',
    fontStyle: 'italic',
    lineHeight: 22
  }
});