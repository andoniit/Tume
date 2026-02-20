import React, { useEffect, useRef, useState } from "react";
import { View, Animated, Pressable, StyleSheet } from "react-native";
import { GlassView } from 'expo-glass-effect'; // <-- Import GlassView
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

// Import your SVGs
import HomeIcon from '../../assets/icons/home.svg';
import TasksIcon from '../../assets/icons/tasks.svg';
import MealIcon from '../../assets/icons/cooking-pot.svg';
import NotesIcon from '../../assets/icons/notes.svg';

type ScreenKey = "home" | "tasks" | "notes" | "mealPrep" | "profileEdit" | "profileCreate";

const TABS: { id: ScreenKey; Icon: any; label: string }[] = [
  { id: 'home', Icon: HomeIcon, label: 'Home' },
  { id: 'tasks', Icon: TasksIcon, label: 'Tasks' },
  { id: 'mealPrep', Icon: MealIcon, label: 'Meals' },
  { id: 'notes', Icon: NotesIcon, label: 'Notes' }
];

interface FloatingNavBarProps {
  active: string;
  onChange: (key: ScreenKey) => void;
}

export default function FloatingNavBar({ active, onChange }: FloatingNavBarProps) {
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
        {/* Replace BlurView with the new Liquid GlassView */}
        <GlassView style={StyleSheet.absoluteFill} />
        
        <View style={[StyleSheet.absoluteFill, { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 40 }]} />

        {tabWidth > 0 && (
          <Animated.View style={[styles.navPill, { width: tabWidth, transform: [{ translateX }], overflow: 'hidden' }]}>
             <LinearGradient colors={['#8A73FF', '#6A4DFF']} style={StyleSheet.absoluteFill} />
             <LinearGradient colors={['rgba(255,255,255,0.5)', 'transparent']} locations={[0, 0.4]} style={StyleSheet.absoluteFill} />
             <View style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 30 }]} />
          </Animated.View>
        )}

        <View style={styles.navItemsRow}>
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
              <Pressable key={tab.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(tab.id as ScreenKey); }} style={styles.navItem}>
                <tab.Icon width={24} height={24} color={isActive ? '#ffffff' : '#8E8E93'} />
                {isActive && <Animated.Text style={styles.navLabel}>{tab.label}</Animated.Text>}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navWrapper: { position: 'absolute', bottom: 30, left: 24, right: 24, alignItems: 'center', zIndex: 100 },
  navContainer: { flexDirection: 'row', padding: 6, borderRadius: 40, height: 72, width: '100%', backgroundColor: 'transparent', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10, position: 'relative' },
  navPill: { position: 'absolute', top: 6, bottom: 6, left: 0, borderRadius: 30, zIndex: 0, shadowColor: '#7B61FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  navItemsRow: { flex: 1, flexDirection: 'row', zIndex: 1 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  navLabel: { color: '#fff', fontWeight: '800', fontSize: 14, marginLeft: 8 }
});