import React, { useMemo } from "react";
import { View, Animated, StyleSheet, Pressable, Image, Text } from "react-native";
import { BlurView } from 'expo-blur';

type ScreenKey = "home" | "tasks" | "notes" | "mealPrep" | "profileEdit" | "profileCreate";
type Profile = { id: string; avatar_url: string | null; /* ... other fields ... */ };

interface GlobalHeaderProps {
  screen: ScreenKey;
  prevScreen: ScreenKey;
  scrollY: Animated.Value;
  headerStateAnim: Animated.Value;
  profile: Profile | null;
  myName: string;
  onOpenProfile: () => void;
}

// Helper for Avatar (You can also move this to its own file later!)
function initialsFromName(name: string) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function AvatarBubble({ uri, label, size = 40, inverse = false }: { uri?: string | null; label: string; size?: number, inverse?: boolean }) {
  const initials = useMemo(() => initialsFromName(label), [label]);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: inverse ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.1)", overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: inverse ? "rgba(255,255,255,0.2)" : "white" }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : <Text style={{ fontWeight: "900", fontSize: size * 0.4, color: inverse ? "#fff" : "#000" }}>{initials}</Text>}
    </View>
  );
}

export default function GlobalHeader({ screen, prevScreen, scrollY, headerStateAnim, profile, myName, onOpenProfile }: GlobalHeaderProps) {
  
  const getPageTitle = () => {
    const activeScreen = screen === 'profileEdit' ? prevScreen : screen;
    switch(activeScreen) {
        case 'tasks': return "Tasks";
        case 'notes': return "Notes";
        case 'mealPrep': return "Meals";
        default: return "";
    }
  };

  // Animations
  const headerBlurOpacity = scrollY.interpolate({ inputRange: [0, 50], outputRange: [0, 1], extrapolate: 'clamp' });
  const logoScale = headerStateAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const logoTranslateY = headerStateAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -36] });
  const logoTranslateX = headerStateAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -26] });
  const titleTranslateY = headerStateAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 2] });
  const titleOpacity = headerStateAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });

  return (
    <Animated.View style={styles.headerWrapper}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: screen === 'home' ? headerBlurOpacity : 1 }]}>
            <BlurView intensity={100} tint="systemThickMaterialLight" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.7)' }]} />
        </Animated.View>
        
        <View style={styles.headerContainer}>
            <View style={styles.headerTextContainer}>
                <Animated.Text style={[styles.logoText, { transform: [{ scale: logoScale }, { translateY: logoTranslateY }, { translateX: logoTranslateX }] }]}>
                    tume.
                </Animated.Text>
                <Animated.Text style={[styles.pageTitle, { opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }]}>
                    {getPageTitle()}
                </Animated.Text>
            </View>

            <Pressable onPress={onOpenProfile} hitSlop={20}>
               <AvatarBubble uri={profile?.avatar_url} label={myName} size={48} />
            </Pressable>
        </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, height: 130, justifyContent: 'flex-end', paddingBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 24, paddingBottom: 6 },
  headerTextContainer: { flex: 1, height: 60, justifyContent: 'flex-end', position: 'relative' },
  logoText: { fontSize: 46, fontWeight: '900', letterSpacing: -2, color: '#000', position: 'absolute', bottom: 0, left: 0 },
  pageTitle: { fontSize: 40, fontWeight: '800', color: '#000', position: 'absolute', bottom: -10, left: 0 },
});