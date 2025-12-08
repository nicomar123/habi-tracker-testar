
import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  SafeAreaView, 
  StatusBar,
  Platform,
  Alert,
  Modal,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  KeyboardAvoidingView,
  Animated,
  Easing,
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { CameraView } from 'expo-camera';

// --- TYPER ---

type Mode = 'stopwatch' | 'timer';
type FilterType = 'today' | 'week' | 'month' | 'all';
type ChartType = 'bar' | 'distribution';
type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

interface Habit {
  id: string;
  name: string;
  category?: string; 
  color: string;
  selectedMode: Mode; 
  timerDuration: number; 
  timerInput: string;    
  elapsed: number;       
  isRunning: boolean;
  streak: number; 
  lastLogDate: string; 
}

interface HistoryItem {
  id: string;
  habitName: string;
  duration: number;
  mode: Mode | 'manual' | 'adjustment'; 
  timestampStr: string; 
  timestampMs: number;  
  color: string;
}

interface Goal {
  habitId: string;
  targetMinutes: number;
  period: GoalPeriod;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

// --- USER DATA STRUCTURE ---
interface UserData {
  auth: {
    username: string;
    password: string;
    fullName: string;
    age: string;
    email: string;
  };
  data: {
    habits: Habit[];
    history: HistoryItem[];
    goals: Goal[];
    themeId: string;
  };
}

// Simulerad databas (i minnet)
const USERS_DB: Record<string, UserData> = {};

// --- TEMAN ---

interface Theme {
  id: string;
  name: string;
  colors: {
    background: string;
    cardBg: string; // Används som fallback
    textPrimary: string;
    textSecondary: string;
    border: string;
    tabBarBg: string;
    headerBg: string;
    iconDefault: string;
    modalBg: string;
  };
}

const THEMES: Theme[] = [
  {
    id: 'light',
    name: 'Standard (Ljus)',
    colors: {
      background: '#f5f7fa',
      cardBg: '#ffffff',
      textPrimary: '#2c3e50',
      textSecondary: '#7f8c8d',
      border: '#eee',
      tabBarBg: '#ffffff',
      headerBg: '#ffffff',
      iconDefault: '#95a5a6',
      modalBg: '#ffffff',
    }
  },
  {
    id: 'dark',
    name: 'Cyberpunk (Mörk)',
    colors: {
      background: '#121212',
      cardBg: '#1e1e1e',
      textPrimary: '#ecf0f1',
      textSecondary: '#bdc3c7',
      border: '#333',
      tabBarBg: '#1e1e1e',
      headerBg: '#1e1e1e',
      iconDefault: '#555',
      modalBg: '#2c2c2c',
    }
  },
  {
    id: 'retro',
    name: 'Retro (Pastell)',
    colors: {
      background: '#fbf8f1',
      cardBg: '#fff0f5', 
      textPrimary: '#5e4b56',
      textSecondary: '#9c8994',
      border: '#e6dce3',
      tabBarBg: '#fff0f5',
      headerBg: '#fff0f5',
      iconDefault: '#d4c1cc',
      modalBg: '#fff0f5',
    }
  }
];

const COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f', '#e67e22', '#1abc9c', '#34495e',
];

// --- ONBOARDING DATA ---
const ONBOARDING_SLIDES = [
  {
    id: '1',
    title: 'Spåra Vanor',
    desc: 'Skapa rutiner som håller i längden. Vi hjälper dig att minnas.',
    icon: 'checkmark-done-circle',
    color: '#3498db',
    bgColor: '#e8f4fd'
  },
  {
    id: '2',
    title: 'Håll Fokus',
    desc: 'Använd vår timer för att jobba ostört och effektivt.',
    icon: 'hourglass',
    color: '#e74c3c',
    bgColor: '#fdecec'
  },
  {
    id: '3',
    title: 'Nå dina mål',
    desc: 'Samla statistik och se hur du utvecklas över tid!',
    icon: 'trending-up',
    color: '#f1c40f',
    bgColor: '#fef9e6'
  }
];

// --- UTILS ---

// Funktion för att göra en färg ljusare (för bakgrunden) eller mörkare
// Positive percent lightens, negative darkens.
const adjustColor = (color: string, amount: number) => {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

// Bättre metod för pastell/opacity mixning med vitt/svart
const tintColor = (hex: string, opacity: number, themeId: string) => {
    // Ta bort #
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Mixa med vitt (för ljust tema) eller mörkgrått (för mörkt tema)
    const mixR = themeId === 'dark' ? 30 : 255;
    const mixG = themeId === 'dark' ? 30 : 255;
    const mixB = themeId === 'dark' ? 30 : 255;

    const newR = Math.round(r * (1 - opacity) + mixR * opacity);
    const newG = Math.round(g * (1 - opacity) + mixG * opacity);
    const newB = Math.round(b * (1 - opacity) + mixB * opacity);

    return `rgb(${newR}, ${newG}, ${newB})`;
};

// Generera en färg baserat på text (för kategorier)
const getCategoryColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
}

// --- APP KOMPONENT ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null); 
  const [isSignUpMode, setIsSignUpMode] = useState(true); 
  const [activeSlide, setActiveSlide] = useState(0);
  
  // Auth fields
  const [authName, setAuthName] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authAge, setAuthAge] = useState('');

  const [currentTab, setCurrentTab] = useState<'tracker' | 'stats' | 'goals' | 'settings'>('tracker');
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitCategory, setNewHabitCategory] = useState(''); 
  const [newHabitColor, setNewHabitColor] = useState(COLORS[0]);

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualHabitId, setManualHabitId] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustHabitName, setAdjustHabitName] = useState('');
  const [adjustHabitColor, setAdjustHabitColor] = useState('');
  const [adjustMinutes, setAdjustMinutes] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalHabitId, setGoalHabitId] = useState<string | null>(null);
  const [goalTarget, setGoalTarget] = useState('');
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('daily');
  const [goalStartDate, setGoalStartDate] = useState('');
  const [goalEndDate, setGoalEndDate] = useState('');

  const [statsFilter, setStatsFilter] = useState<FilterType>('all');
  const [chartType, setChartType] = useState<ChartType>('bar');

  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const isDraggingRef = useRef(false);
  const theme = currentTheme.colors;

  const existingCategories = React.useMemo(() => {
    const cats = habits.map(h => h.category).filter(c => c && c.trim() !== '');
    return Array.from(new Set(cats));
  }, [habits]);

  // --- PERSISTENCE EFFECT ---
  useEffect(() => {
    if (currentUser && isLoggedIn && USERS_DB[currentUser]) {
      USERS_DB[currentUser].data = {
        habits: habits,
        history: history,
        goals: goals,
        themeId: currentTheme.id
      };
    }
  }, [habits, history, goals, currentTheme, currentUser, isLoggedIn]);

  // --- ANIMATION EFFECT ---
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim]);

  // --- HELPERS ---
  const getTodayString = useCallback(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }, []);

  const formatTime = (s: number) => {
    const abs = Math.abs(s);
    const hrs = Math.floor(abs/3600);
    const mins = Math.floor((abs%3600)/60);
    const secs = abs%60;
    const t = hrs>0?`${hrs}:${mins<10?'0':''}${mins}:${secs<10?'0':''}${secs}`:`${mins<10?'0':''}${mins}:${secs<10?'0':''}${secs}`;
    return s<0?`-${t}`:t;
  };

  const saveSession = useCallback((name: string, duration: number, mode: Mode | 'manual' | 'adjustment', color: string, timestamp?: number) => {
    if (duration === 0) return;
    const dateStr = getTodayString();
    setHabits(prev => prev.map(h => {
      if (h.name === name && duration > 0) {
         const newStreak = h.lastLogDate === dateStr ? h.streak : h.streak + 1;
         return { ...h, streak: newStreak, lastLogDate: dateStr };
      }
      return h;
    }));
    setHistory(prev => [{
      id: Date.now().toString() + Math.random(),
      habitName: name,
      duration,
      mode,
      timestampStr: new Date(timestamp || Date.now()).toLocaleString(),
      timestampMs: timestamp || Date.now(),
      color,
    }, ...prev]);
  }, [getTodayString]);

  // --- AUTH LOGIC ---
  const handleSignUp = () => {
    const username = authName.trim().toLowerCase();
    const password = authPass.trim();
    if (!username || !password) { Alert.alert("Fel", "Fyll i både användarnamn och lösenord."); return; }
    if (USERS_DB[username]) { Alert.alert("Upptaget", "Användarnamnet är redan upptaget."); return; }
    USERS_DB[username] = {
      auth: { username, password, fullName: authFullName, age: authAge, email: authEmail },
      data: { habits: [], history: [], goals: [], themeId: 'light' }
    };
    loadUserAndLogin(username);
  };

  const handleLogin = () => {
    const username = authName.trim().toLowerCase();
    const password = authPass.trim();
    const user = USERS_DB[username];
    if (user && user.auth.password === password) { loadUserAndLogin(username); } 
    else { Alert.alert("Fel inloggning", "Fel användarnamn eller lösenord."); }
  };

  const loadUserAndLogin = (username: string) => {
    const user = USERS_DB[username];
    if (!user) return;
    setHabits(user.data.habits || []);
    setHistory(user.data.history || []);
    setGoals(user.data.goals || []);
    const savedTheme = THEMES.find(t => t.id === user.data.themeId) || THEMES[0];
    setCurrentTheme(savedTheme);
    setCurrentUser(username);
    setIsLoggedIn(true);
    setCurrentTab('tracker');
    Keyboard.dismiss();
  };

  const handleLogout = () => {
    if (currentUser && USERS_DB[currentUser]) { USERS_DB[currentUser].data = { habits, history, goals, themeId: currentTheme.id }; }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setHabits([]); setHistory([]); setGoals([]); setCurrentTheme(THEMES[0]);
    setAuthName(''); setAuthPass(''); setAuthEmail(''); setAuthFullName(''); setAuthAge('');
  };

  // --- TIMER LOGIC ---
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      if (isDraggingRef.current) return;
      setHabits(currentHabits => {
        const isAnyRunning = currentHabits.some(h => h.isRunning);
        if (!isAnyRunning) return currentHabits;
        return currentHabits.map(habit => {
          if (habit.isRunning) {
            if (habit.selectedMode === 'timer') {
              const totalTime = habit.elapsed + 1;
              if (totalTime >= habit.timerDuration) { return { ...habit, isRunning: false, elapsed: 0 }; }
              return { ...habit, elapsed: totalTime };
            }
            return { ...habit, elapsed: habit.elapsed + 1 };
          }
          return habit;
        });
      });
    }, 1000);
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []); 

  const addNewHabit = () => {
    if (!newHabitName.trim()) { Alert.alert("Fel", "Ange ett namn"); return; }
    setShowAddModal(false);
    setTimeout(() => {
      const newHabit: Habit = {
        id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
        name: newHabitName.trim(),
        category: newHabitCategory.trim(),
        color: newHabitColor,
        selectedMode: 'stopwatch',
        timerDuration: 60,
        timerInput: '1',
        elapsed: 0,
        isRunning: false,
        streak: 0,
        lastLogDate: ''
      };
      setHabits(prev => [newHabit, ...prev]);
      setNewHabitName('');
      setNewHabitCategory('');
    }, 100);
  };

  const toggleRunHabit = useCallback((id: string) => {
    setHabits(prev => prev.map(h => {
      if (h.id === id) {
        if (h.isRunning) {
          saveSession(h.name, h.elapsed, h.selectedMode, h.color);
          return { ...h, isRunning: false, elapsed: 0 };
        } else {
          let duration = h.timerDuration;
          if (h.selectedMode === 'timer') {
            const mins = parseInt(h.timerInput) || 1;
            duration = mins * 60;
          }
          return { ...h, isRunning: true, timerDuration: duration };
        }
      }
      return h;
    }));
  }, [saveSession]);

  const deleteHabit = useCallback((id: string) => {
    Alert.alert("Radera", "Ta bort vana?", [
      { text: "Nej", style: "cancel" },
      { text: "Ja", style: "destructive", onPress: () => {
        setHabits(prev => prev.filter(h => h.id !== id));
        setGoals(prev => prev.filter(g => g.habitId !== id));
      }}
    ]);
  }, []);

  const incrementTimer = useCallback((id: string) => {
    setHabits(prev => prev.map(h => h.id===id ? {...h, timerInput: (parseInt(h.timerInput)+1).toString()} : h));
  }, []);
  
  const decrementTimer = useCallback((id: string) => {
    setHabits(prev => prev.map(h => h.id===id ? {...h, timerInput: Math.max(1, parseInt(h.timerInput)-1).toString()} : h));
  }, []);

  const switchMode = useCallback((id: string, newMode: Mode) => {
    setHabits(prev => prev.map(h => h.id===id ? {...h, selectedMode:newMode, elapsed:0, isRunning:false} : h));
  }, []);

  const saveManualLog = () => {
    const habit = habits.find(h => h.id === manualHabitId);
    if (!habit) return;
    const mins = parseInt(manualMinutes);
    if (isNaN(mins) || mins <= 0) { Alert.alert("Fel", "Ange ett giltigt antal minuter"); return; }
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(manualDate)) { Alert.alert("Fel datum", "Använd ÅÅÅÅ-MM-DD"); return; }
    const [y, m, d] = manualDate.split('-').map(Number);
    const logDate = new Date(y, m - 1, d);
    saveSession(habit.name, mins * 60, 'manual', habit.color, logDate.getTime());
    setShowManualModal(false);
  };

  const openAdjustModal = (name: string, color: string) => {
    setAdjustHabitName(name); setAdjustHabitColor(color); setAdjustMinutes(''); setAdjustType('add');
    setShowAdjustModal(true);
  };

  const saveAdjustment = () => {
    const mins = parseInt(adjustMinutes);
    if (!isNaN(mins) && mins > 0) {
      const seconds = mins * 60;
      saveSession(adjustHabitName, adjustType==='add'?seconds:-seconds, 'adjustment', adjustHabitColor);
    }
    setShowAdjustModal(false);
  };

  const openGoalModal = (habitId: string) => {
    setGoalHabitId(habitId);
    const existing = goals.find(g => g.habitId === habitId);
    if (existing) {
      setGoalTarget(existing.targetMinutes.toString());
      setGoalPeriod(existing.period);
      setGoalStartDate(existing.startDate || getTodayString());
      setGoalEndDate(existing.endDate || getTodayString());
    } else {
      setGoalTarget('');
      setGoalPeriod('daily');
      setGoalStartDate(getTodayString());
      setGoalEndDate(getTodayString());
    }
    setShowGoalModal(true);
  };

  const saveGoal = () => {
    if (!goalHabitId) return;
    const mins = parseInt(goalTarget);
    if (!isNaN(mins) && mins > 0) {
      if (goalPeriod === 'custom' && (!goalStartDate || !goalEndDate)) {
          Alert.alert("Fel", "Ange start- och slutdatum för perioden.");
          return;
      }
      setGoals(prev => {
        const filtered = prev.filter(g => g.habitId !== goalHabitId);
        return [...filtered, { habitId: goalHabitId, targetMinutes: mins, period: goalPeriod, startDate: goalStartDate, endDate: goalEndDate }];
      });
    }
    setShowGoalModal(false);
  };

  const getGoalProgress = (habitId: string, goal: Goal) => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    const filtered = history.filter(item => {
      const habit = habits.find(h => h.id === habitId);
      if (item.habitName !== habit?.name) return false;
      
      if (goal.period === 'daily') return item.timestampMs >= new Date().setHours(0,0,0,0);
      if (goal.period === 'weekly') return (now - item.timestampMs) < (7 * oneDay);
      if (goal.period === 'monthly') return (now - item.timestampMs) < (30 * oneDay);
      if (goal.period === 'custom' && goal.startDate && goal.endDate) {
          const start = new Date(goal.startDate).getTime();
          // Lägg till en dag på slutet för att inkludera hela slutdatumet
          const end = new Date(goal.endDate).getTime() + oneDay; 
          return item.timestampMs >= start && item.timestampMs < end;
      }
      return false;
    });
    
    const total = filtered.reduce((acc, curr) => acc + curr.duration, 0);
    return Math.floor(total / 60);
  };

  const getFilteredHistory = () => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    return history.filter(item => {
      if (statsFilter === 'all') return true;
      if (statsFilter === 'today') return item.timestampMs >= new Date().setHours(0,0,0,0);
      if (statsFilter === 'week') return (now - item.timestampMs) < (7 * oneDay);
      if (statsFilter === 'month') return (now - item.timestampMs) < (30 * oneDay);
      return true;
    });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = Math.round(event.nativeEvent.contentOffset.x / slideSize);
    if (index !== activeSlide) setActiveSlide(index);
  };

  // --- RENDER TRACKER ---

  const renderHabitItem = useCallback(({ item, drag, isActive }: RenderItemParams<Habit>) => {
    const isTimer = item.selectedMode === 'timer';
    let displayTime = formatTime(item.elapsed);
    if (isTimer && !item.isRunning) displayTime = "";
    else if (isTimer && item.isRunning) displayTime = formatTime(Math.max(0, item.timerDuration - item.elapsed));

    // Skapa pastellbakgrund: 85-90% vit (eller svart för dark mode) mixad med färgen
    const cardBackgroundColor = tintColor(item.color, 0.9, currentTheme.id);
    const categoryColor = item.category ? getCategoryColor(item.category) : '#ccc';

    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          activeOpacity={1}
          disabled={isActive}
          style={[
            styles.habitCard, 
            { backgroundColor: isActive ? '#f0f0f0' : cardBackgroundColor }
          ]}
        >
          <View style={styles.cardHeader}>
            <View>
              <Text style={[styles.habitName, { color: item.color }]}>{item.name}</Text>
              {item.category ? (
                  <View style={{
                      backgroundColor: categoryColor, 
                      alignSelf: 'flex-start', 
                      paddingHorizontal: 8, 
                      paddingVertical: 3, 
                      borderRadius: 12, 
                      marginTop: 4, 
                      marginBottom: 2
                  }}>
                    <Text style={{fontSize: 10, color: '#fff', fontWeight: 'bold'}}>{item.category}</Text>
                  </View>
              ) : null}
              <View style={{flexDirection:'row', alignItems:'center', marginTop:2}}>
                <Ionicons name="flame" size={14} color={item.streak > 0 ? "#e67e22" : "#aaa"} />
                <Text style={{fontSize:12, color: theme.textSecondary, marginLeft:4}}>{item.streak} dagar</Text>
              </View>
            </View>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <TouchableOpacity onPress={() => deleteHabit(item.id)} style={{padding:8}}>
                  <Ionicons name="trash-outline" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
            </View>
          </View>

          {/* Mode Switcher - Uses a transparent white or dark overlay to look integrated */}
          <View style={[styles.modeSwitcherContainer, { backgroundColor: 'rgba(0,0,0,0.05)' }]}>
            <TouchableOpacity style={[styles.modeTab, !isTimer && {backgroundColor: item.color}]} onPress={() => switchMode(item.id, 'stopwatch')}>
              <Text style={[styles.modeTabText, !isTimer ? {color:'#fff'} : {color: item.color}]}>Tidtagarur</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeTab, isTimer && {backgroundColor: item.color}]} onPress={() => switchMode(item.id, 'timer')}>
              <Text style={[styles.modeTabText, isTimer ? {color:'#fff'} : {color: item.color}]}>Timer</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.timerDisplayContainer}>
            {isTimer && !item.isRunning ? (
              <View style={styles.timerControlContainer}>
                <TouchableOpacity onPress={() => decrementTimer(item.id)} style={[styles.arrowButton, {borderColor: item.color, backgroundColor: 'rgba(255,255,255,0.5)'}]}><Ionicons name="chevron-down" size={24} color={item.color} /></TouchableOpacity>
                <View style={{alignItems:'center'}}>
                  <Text style={[styles.timerValueText, {color:item.color}]}>{item.timerInput}</Text>
                  <Text style={{color:theme.textSecondary}}>min</Text>
                </View>
                <TouchableOpacity onPress={() => incrementTimer(item.id)} style={[styles.arrowButton, {borderColor: item.color, backgroundColor: 'rgba(255,255,255,0.5)'}]}><Ionicons name="chevron-up" size={24} color={item.color} /></TouchableOpacity>
              </View>
            ) : (
              <Text style={[styles.timerDisplay, { color: theme.textPrimary }]}>{displayTime}</Text>
            )}
          </View>

          {isTimer && item.isRunning && (
            <View style={[styles.progressBarBg, { backgroundColor: 'rgba(0,0,0,0.1)' }]}>
              <View style={[styles.progressBarFill, { backgroundColor: item.color, width: '100%' }]} />
            </View>
          )}

          {/* Action Button - Strong color */}
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: item.isRunning ? '#e74c3c' : item.color }]} onPress={() => toggleRunHabit(item.id)}>
            <Text style={styles.actionButtonText}>{item.isRunning ? "AVSLUTA" : "STARTA"}</Text>
          </TouchableOpacity>

          {!item.isRunning && (
            <TouchableOpacity style={{alignItems:'center', marginTop:10}} onPress={() => { setManualHabitId(item.id); setManualDate(getTodayString()); setShowManualModal(true); }}>
              <Text style={{color:theme.textSecondary, fontSize:12, textDecorationLine:'underline'}}>Logga manuellt</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [currentTheme, theme, deleteHabit, switchMode, decrementTimer, incrementTimer, toggleRunHabit, getTodayString]); 

  const renderTrackerView = () => (
    <View style={{flex: 1}}>
      <DraggableFlatList
        data={habits}
        onDragBegin={() => { isDraggingRef.current = true; }}
        onDragEnd={({ data }) => { setHabits(data); isDraggingRef.current = false; }}
        keyExtractor={(item) => item.id}
        renderItem={renderHabitItem}
        extraData={habits} 
        containerStyle={{ flex: 1 }}
        contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 100, paddingTop: 20}}
        style={{ flex: 1 }}
        removeClippedSubviews={false} 
        activationDistance={20}
        ListEmptyComponent={
          <Text style={{textAlign:'center', color:theme.textSecondary, marginTop:50}}>Inga vanor än. Tryck på + för att skapa!</Text>
        }
      />
      <TouchableOpacity style={[styles.fab, {backgroundColor: theme.textPrimary}]} onPress={() => setShowAddModal(true)}>
        <Ionicons name="add" size={32} color={theme.background} />
      </TouchableOpacity>
    </View>
  );

  const renderStatsView = () => {
    const filteredHistory = getFilteredHistory();
    const statsMap: {[key: string]: {seconds: number, color: string}} = {};
    let grandTotalSeconds = 0;
    filteredHistory.forEach(item => {
      if (statsMap[item.habitName]) { statsMap[item.habitName].seconds += item.duration; } 
      else { statsMap[item.habitName] = { seconds: item.duration, color: item.color }; }
      grandTotalSeconds += item.duration;
    });
    const data = Object.keys(statsMap).map(key => ({ name: key, totalSeconds: statsMap[key].seconds, color: statsMap[key].color })).sort((a, b) => b.totalSeconds - a.totalSeconds);
    const maxVal = data.length > 0 ? Math.max(1, data[0].totalSeconds) : 1;

    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={{paddingBottom:100}}>
        <Text style={[styles.sectionTitle, {color:theme.textPrimary}]}>Filtrera</Text>
        <View style={styles.filterContainer}>
          {(['today', 'week', 'month', 'all'] as FilterType[]).map(f => (
            <TouchableOpacity key={f} onPress={() => setStatsFilter(f)} style={[styles.filterBtn, statsFilter===f && {backgroundColor:theme.textPrimary}]}><Text style={{color: statsFilter===f?theme.background : theme.textSecondary}}>{f==='today'?'Idag':f==='week'?'Vecka':f==='month'?'Månad':'Alla'}</Text></TouchableOpacity>
          ))}
        </View>
        <View style={styles.chartHeader}>
           <Text style={[styles.sectionTitle, {color:theme.textPrimary}]}>Statistik</Text>
           <View style={{flexDirection:'row', gap:10}}>
             <TouchableOpacity onPress={() => setChartType('bar')}><Ionicons name="bar-chart" size={24} color={chartType==='bar'?theme.textPrimary:theme.iconDefault}/></TouchableOpacity>
             <TouchableOpacity onPress={() => setChartType('distribution')}><Ionicons name="pie-chart" size={24} color={chartType==='distribution'?theme.textPrimary:theme.iconDefault}/></TouchableOpacity>
           </View>
        </View>
        {data.length === 0 ? <Text style={{color:theme.textSecondary, textAlign:'center', margin:20}}>Ingen data.</Text> : (
          <View style={[styles.chartContainer, {backgroundColor:theme.cardBg}]}>
             {chartType === 'bar' && data.map((item) => (
               <View key={item.name} style={{marginBottom:15}}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:5}}>
                    <Text style={{color:theme.textPrimary, fontWeight:'600'}}>{item.name}</Text>
                    <TouchableOpacity onPress={() => openAdjustModal(item.name, item.color)}><Ionicons name="pencil" size={16} color={theme.textSecondary} /></TouchableOpacity>
                  </View>
                  <View style={{flexDirection:'row', alignItems:'center'}}>
                    <View style={{height:10, borderRadius:5, backgroundColor:item.color, width: `${Math.max(2, (item.totalSeconds/maxVal)*75)}%`, marginRight:10}} />
                    <Text style={{color:theme.textSecondary, fontSize:12}}>{formatTime(item.totalSeconds)}</Text>
                  </View>
               </View>
             ))}
             {chartType === 'distribution' && (
               <View>
                 <Text style={{color:theme.textPrimary, marginBottom:10}}>Totalt: {formatTime(grandTotalSeconds)}</Text>
                 <View style={{flexDirection:'row', height:30, borderRadius:15, overflow:'hidden', width:'100%'}}>{data.map((item, idx) => (<View key={idx} style={{width:`${(item.totalSeconds/grandTotalSeconds)*100}%`, backgroundColor:item.color}} />))}</View>
               </View>
             )}
          </View>
        )}
        <Text style={[styles.sectionTitle, {color:theme.textPrimary, marginTop:20}]}>Historik</Text>
        {filteredHistory.map(h => (
          <View key={h.id} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:theme.border}}>
             <Text style={{color:theme.textPrimary}}>{h.habitName}</Text>
             <Text style={{color:theme.textPrimary}}>{formatTime(h.duration)}</Text>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderGoalsView = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={{paddingBottom:100}}>
      <Text style={[styles.sectionTitle, {color:theme.textPrimary}]}>Mål</Text>
      {habits.length === 0 && <Text style={{color:theme.textSecondary}}>Lägg till vanor först.</Text>}
      {habits.map(habit => {
        const goal = goals.find(g => g.habitId === habit.id);
        const progress = goal ? getGoalProgress(habit.id, goal) : 0;
        const target = goal ? goal.targetMinutes : 1;
        const percent = Math.min(1, progress / target);
        
        // Custom Goal Text
        let periodText = 'dag';
        if (goal) {
            if (goal.period === 'weekly') periodText = 'vecka';
            if (goal.period === 'monthly') periodText = 'månad';
            if (goal.period === 'custom') periodText = `${goal.startDate} - ${goal.endDate}`;
        }

        return (
          <View key={habit.id} style={[styles.habitCard, {backgroundColor: tintColor(habit.color, 0.9, currentTheme.id)}]}>
             <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <View>
                    <Text style={[styles.habitName, {color:habit.color, fontSize:18}]}>{habit.name}</Text>
                    {habit.category ? <Text style={{fontSize: 10, color: theme.textSecondary}}>{habit.category}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => openGoalModal(habit.id)} style={{backgroundColor:habit.color, paddingHorizontal:10, paddingVertical:5, borderRadius:8}}>
                   <Text style={{color:'#fff', fontSize:12, fontWeight:'bold'}}>{goal ? "Ändra" : "Sätt Mål"}</Text>
                </TouchableOpacity>
             </View>
             {goal && (
               <>
                 <Text style={{color:theme.textSecondary, fontSize:12, marginBottom:5}}>Mål: {goal.targetMinutes} min / {periodText}</Text>
                 <View style={{height:10, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius:5, overflow:'hidden'}}>
                    <View style={{height:'100%', width:`${percent*100}%`, backgroundColor: percent < 0.33 ? '#e74c3c' : percent < 0.66 ? '#e67e22' : '#2ecc71'}} />
                 </View>
                 <Text style={{color:theme.textPrimary, fontWeight:'bold', marginTop:5, textAlign:'right'}}>{progress} min ({Math.round(percent*100)}%)</Text>
               </>
             )}
          </View>
        );
      })}
    </ScrollView>
  );

  const renderSettingsView = () => (
    <ScrollView style={styles.scrollView}>
      <Text style={[styles.sectionTitle, {color:theme.textPrimary}]}>Tema</Text>
      {THEMES.map(t => (
        <TouchableOpacity key={t.id} onPress={() => setCurrentTheme(t)} style={[styles.themeCard, {borderColor: theme.border, backgroundColor: theme.cardBg, borderWidth: currentTheme.id===t.id?2:1}]}>
           <View style={[styles.colorPreview, {backgroundColor: t.colors.background}]} />
           <Text style={{color:theme.textPrimary, fontWeight:'bold', marginLeft:10}}>{t.name}</Text>
           {currentTheme.id===t.id && <Ionicons name="checkmark" size={20} color={theme.textPrimary} style={{marginLeft:'auto'}} />}
        </TouchableOpacity>
      ))}
      <Text style={[styles.sectionTitle, {color:theme.textPrimary, marginTop:20}]}>Konto</Text>
      <View style={{backgroundColor: theme.cardBg, padding: 15, borderRadius: 12, marginBottom: 10}}>
        <Text style={{color: theme.textSecondary, fontSize: 12, textTransform: 'uppercase'}}>Inloggad som</Text>
        <Text style={{color: theme.textPrimary, fontSize: 16, fontWeight: 'bold'}}>{currentUser}</Text>
        {USERS_DB[currentUser || '']?.auth.fullName ? <Text style={{color: theme.textSecondary}}>{USERS_DB[currentUser || '']?.auth.fullName}</Text> : null}
      </View>
      <TouchableOpacity onPress={handleLogout} style={[styles.actionButton, {backgroundColor: '#e74c3c', marginTop: 10}]}>
         <Text style={styles.actionButtonText}>Logga Ut</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderSignUpView = () => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const cardWidth = Math.min(screenWidth - 40, 350); 
    const isSmallScreen = screenHeight < 700;
    const carouselHeight = isSmallScreen ? 280 : 340; 
    const iconSize = isSmallScreen ? 65 : 90;
    const circleSize = isSmallScreen ? 130 : 180;
    const inputHeight = 42; 
    
    // Hämta färgen från den aktiva sliden
    const activeColor = ONBOARDING_SLIDES[activeSlide].color;

    return (
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1, backgroundColor: theme.background}}
      >
        <ScrollView 
          contentContainerStyle={{flexGrow: 1, justifyContent: 'center', alignItems: 'center'}}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.headerTitle, {fontSize: 26, marginBottom: 15, color: theme.textPrimary}]}>
            Habit & Focus
          </Text>
          <View style={{
              width: cardWidth, 
              backgroundColor: theme.cardBg, 
              borderRadius: 24, 
              shadowColor: '#000', 
              shadowOpacity: 0.15, 
              shadowRadius: 15, 
              shadowOffset: {width: 0, height: 5},
              elevation: 10,
              overflow: 'hidden'
          }}>
            <View style={{height: carouselHeight}}>
              <ScrollView 
                horizontal 
                pagingEnabled 
                showsHorizontalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                snapToInterval={cardWidth} 
                decelerationRate="fast"
                contentContainerStyle={{width: cardWidth * ONBOARDING_SLIDES.length}}
              >
                {ONBOARDING_SLIDES.map((slide) => (
                  <View key={slide.id} style={{width: cardWidth, height: carouselHeight, alignItems: 'center'}}>
                    <View style={{
                      width: cardWidth - 24, 
                      height: '60%', 
                      marginTop: 12,
                      backgroundColor: slide.bgColor, 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      borderRadius: 24,
                      marginBottom: 10
                    }}>
                      <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
                          <View style={{
                            width: circleSize,
                            height: circleSize,
                            borderRadius: circleSize / 2,
                            backgroundColor: 'white',
                            alignItems: 'center',
                            justifyContent: 'center',
                            shadowColor: "#000",
                            shadowOpacity: 0.1,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 4 },
                            elevation: 5
                          }}>
                             <Ionicons name={slide.icon as any} size={iconSize} color={slide.color} />
                          </View>
                      </Animated.View>
                    </View>
                    <View style={{paddingHorizontal: 15, alignItems: 'center', flex: 1, justifyContent: 'flex-start', paddingTop: 25}}>
                      <Text style={{fontSize: 20, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 4, textAlign: 'center'}}>
                          {slide.title}
                      </Text>
                      <Text style={{fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 18}} numberOfLines={2}>
                        {slide.desc}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={{position: 'absolute', top: '65%', width: '100%', flexDirection: 'row', justifyContent: 'center'}}>
                {ONBOARDING_SLIDES.map((_, i) => (
                  <View key={i} style={{width: 6, height: 6, borderRadius: 3, backgroundColor: i === activeSlide ? theme.textPrimary : 'rgba(0,0,0,0.1)', marginHorizontal: 3}} />
                ))}
              </View>
            </View>

            <View style={{padding: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border}}>
               <Text style={[styles.sectionTitle, {color: theme.textPrimary, textAlign: 'center', fontSize: 18, marginBottom: 10}]}>
                  {isSignUpMode ? "Skapa konto" : "Välkommen tillbaka"}
                </Text>
                <View style={{gap: 8}}>
                  {isSignUpMode && (
                    <>
                      <TextInput 
                          style={[styles.input, {marginBottom: 0, height: inputHeight, paddingVertical: 5, backgroundColor: theme.background, borderColor: activeColor, borderWidth: 2, color: theme.textPrimary}]} 
                          placeholder="För- & Efternamn" 
                          placeholderTextColor={theme.textSecondary}
                          value={authFullName}
                          onChangeText={setAuthFullName}
                          autoCapitalize="words"
                      />
                      <TextInput 
                          style={[styles.input, {marginBottom: 0, height: inputHeight, paddingVertical: 5, backgroundColor: theme.background, borderColor: activeColor, borderWidth: 2, color: theme.textPrimary}]} 
                          placeholder="Ålder" 
                          placeholderTextColor={theme.textSecondary}
                          value={authAge}
                          onChangeText={setAuthAge}
                          keyboardType="numeric"
                      />
                      <TextInput 
                          style={[styles.input, {marginBottom: 0, height: inputHeight, paddingVertical: 5, backgroundColor: theme.background, borderColor: activeColor, borderWidth: 2, color: theme.textPrimary}]} 
                          placeholder="E-postadress" 
                          placeholderTextColor={theme.textSecondary}
                          value={authEmail}
                          onChangeText={setAuthEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                      />
                    </>
                  )}
                  <TextInput 
                      style={[styles.input, {marginBottom: 0, height: inputHeight, paddingVertical: 5, backgroundColor: theme.background, borderColor: activeColor, borderWidth: 2, color: theme.textPrimary}]} 
                      placeholder="Användarnamn" 
                      placeholderTextColor={theme.textSecondary}
                      value={authName}
                      onChangeText={setAuthName}
                      autoCapitalize="none"
                  />
                  <TextInput 
                      style={[styles.input, {marginBottom: 0, height: inputHeight, paddingVertical: 5, backgroundColor: theme.background, borderColor: activeColor, borderWidth: 2, color: theme.textPrimary}]} 
                      placeholder="Lösenord" 
                      placeholderTextColor={theme.textSecondary}
                      secureTextEntry
                      value={authPass}
                      onChangeText={setAuthPass}
                  />
                </View>
                <TouchableOpacity 
                  style={[styles.actionButton, {backgroundColor: ONBOARDING_SLIDES[activeSlide].color, marginTop: 12, padding: 10}]} 
                  onPress={() => {
                    Keyboard.dismiss();
                    if (isSignUpMode) { handleSignUp(); } else { handleLogin(); }
                  }}
                >
                  <Text style={styles.actionButtonText}>{isSignUpMode ? "Börja Nu" : "Logga In"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsSignUpMode(!isSignUpMode)} style={{marginTop: 10, alignItems: 'center'}}>
                  <Text style={{color: theme.textSecondary, fontSize: 13}}>
                    {isSignUpMode ? "Har du redan ett konto? " : "Ny här? "}
                    <Text style={{fontWeight: 'bold', color: theme.textPrimary}}>
                        {isSignUpMode ? "Logga in" : "Skapa konto"}
                    </Text>
                  </Text>
                </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={currentTheme.id==='dark'?'light-content':'dark-content'} />
      { !isLoggedIn ? (
        <SafeAreaView style={{flex: 1}}>
          {renderSignUpView()}
        </SafeAreaView>
      ) : (
        <>
          <SafeAreaView style={{flex:0, backgroundColor:theme.headerBg}} />
          <SafeAreaView style={{flex:1, backgroundColor:theme.tabBarBg}}>
            <View style={{flex:1, backgroundColor:theme.background}}>
              <View style={[styles.header, {backgroundColor:theme.headerBg, borderBottomColor:theme.border}]}>
                <Text style={[styles.headerTitle, {color:theme.textPrimary}]}>
                  {currentTab === 'tracker' ? 'Min Habit Tracker' : 
                    currentTab === 'stats' ? 'Statistik' : 
                    currentTab === 'goals' ? 'Mål' : 'Inställningar'}
                </Text>
              </View>
              <View style={{flex:1}}>
                {currentTab === 'tracker' && renderTrackerView()}
                {currentTab === 'stats' && renderStatsView()}
                {currentTab === 'goals' && renderGoalsView()}
                {currentTab === 'settings' && renderSettingsView()}
              </View>
              <View style={[styles.tabBar, {backgroundColor:theme.tabBarBg, borderTopColor:theme.border}]}>
                {['tracker', 'stats', 'goals', 'settings'].map(tab => (
                  <TouchableOpacity key={tab} style={styles.tabItem} onPress={() => setCurrentTab(tab as any)}>
                    <Ionicons name={tab==='tracker'?'list':tab==='stats'?'pie-chart':tab==='goals'?'trophy':'settings'} size={24} color={currentTab===tab?theme.textPrimary:theme.iconDefault} />
                    <Text style={[styles.tabText, {color:currentTab===tab?theme.textPrimary:theme.iconDefault}]}>{tab==='tracker'?'Spåra':tab==='stats'?'Statistik':tab==='goals'?'Mål':'Inställningar'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </SafeAreaView>

          {/* ADD HABIT MODAL */}
          <Modal visible={showAddModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, {backgroundColor:theme.modalBg}]}>
                    <Text style={[styles.modalTitle, {color:theme.textPrimary}]}>Ny Vana</Text>
                    <TextInput 
                        style={[styles.input, {color:theme.textPrimary, borderColor:theme.border}]} 
                        placeholder="Namn" 
                        placeholderTextColor={theme.textSecondary} 
                        value={newHabitName} 
                        onChangeText={setNewHabitName}
                    />
                    <TextInput 
                        style={[styles.input, {color:theme.textPrimary, borderColor:theme.border, marginBottom: 5}]} 
                        placeholder="Kategori (t.ex. Hälsa)" 
                        placeholderTextColor={theme.textSecondary} 
                        value={newHabitCategory} 
                        onChangeText={setNewHabitCategory}
                    />
                    {existingCategories.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15, maxHeight: 40}}>
                            {existingCategories.map((cat, index) => (
                                <TouchableOpacity 
                                    key={index} 
                                    onPress={() => setNewHabitCategory(cat || '')}
                                    style={{
                                        backgroundColor: getCategoryColor(cat || ''), 
                                        paddingHorizontal: 10, 
                                        paddingVertical: 5, 
                                        borderRadius: 15, 
                                        marginRight: 8
                                    }}
                                >
                                    <Text style={{color: '#fff', fontSize: 12, fontWeight:'bold'}}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                    <View style={styles.colorGrid}>
                        {COLORS.map(c => <TouchableOpacity key={c} onPress={() => setNewHabitColor(c)} style={[styles.colorCircle, {backgroundColor:c}, newHabitColor===c && styles.colorSelected]} />)}
                    </View>
                    <View style={styles.modalButtons}>
                        <TouchableOpacity onPress={() => setShowAddModal(false)}><Text style={{color:theme.textSecondary}}>Avbryt</Text></TouchableOpacity>
                        <TouchableOpacity onPress={addNewHabit}><Text style={{color:theme.textPrimary, fontWeight:'bold'}}>Spara</Text></TouchableOpacity>
                    </View>
                </View>
            </View>
          </Modal>

          <Modal visible={showManualModal} transparent animationType="slide"><View style={styles.modalOverlay}><View style={[styles.modalContent, {backgroundColor:theme.modalBg}]}><Text style={[styles.modalTitle, {color:theme.textPrimary}]}>Logga Manuellt</Text><TextInput style={[styles.input, {color:theme.textPrimary, borderColor:theme.border}]} value={manualDate} onChangeText={setManualDate} placeholder="Datum (ÅÅÅÅ-MM-DD)" placeholderTextColor={theme.textSecondary}/><TextInput style={[styles.input, {color:theme.textPrimary, borderColor:theme.border}]} value={manualMinutes} onChangeText={setManualMinutes} placeholder="Min" keyboardType="numeric" placeholderTextColor={theme.textSecondary}/><View style={styles.modalButtons}><TouchableOpacity onPress={() => setShowManualModal(false)}><Text style={{color:theme.textSecondary}}>Avbryt</Text></TouchableOpacity><TouchableOpacity onPress={saveManualLog}><Text style={{color:theme.textPrimary, fontWeight:'bold'}}>Spara</Text></TouchableOpacity></View></View></View></Modal>
          <Modal visible={showAdjustModal} transparent animationType="slide"><View style={styles.modalOverlay}><View style={[styles.modalContent, {backgroundColor:theme.modalBg}]}><Text style={[styles.modalTitle, {color:theme.textPrimary}]}>Justera</Text><TextInput style={[styles.input, {color:theme.textPrimary, borderColor:theme.border}]} value={adjustMinutes} onChangeText={setAdjustMinutes} placeholder="Minuter" keyboardType="numeric" placeholderTextColor={theme.textSecondary}/><View style={styles.modalButtons}><TouchableOpacity onPress={() => setShowAdjustModal(false)}><Text style={{color:theme.textSecondary}}>Avbryt</Text></TouchableOpacity><TouchableOpacity onPress={saveAdjustment}><Text style={{color:theme.textPrimary, fontWeight:'bold'}}>Spara</Text></TouchableOpacity></View></View></View></Modal>
          
          {/* GOAL MODAL UPDATED */}
          <Modal visible={showGoalModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, {backgroundColor:theme.modalBg}]}>
                    <Text style={[styles.modalTitle, {color:theme.textPrimary}]}>Sätt Mål</Text>
                    
                    <View style={{flexDirection: 'row', marginBottom: 15, backgroundColor: currentTheme.id==='dark'?'#333':'#f0f0f0', borderRadius: 8, padding: 2}}>
                        {(['daily', 'weekly', 'monthly', 'custom'] as GoalPeriod[]).map(p => (
                            <TouchableOpacity 
                                key={p} 
                                onPress={() => setGoalPeriod(p)} 
                                style={{
                                    flex: 1, 
                                    paddingVertical: 8, 
                                    alignItems: 'center', 
                                    borderRadius: 6,
                                    backgroundColor: goalPeriod === p ? theme.cardBg : 'transparent',
                                    shadowColor: goalPeriod === p ? '#000' : 'transparent',
                                    shadowOpacity: goalPeriod === p ? 0.1 : 0,
                                    shadowRadius: 2,
                                    elevation: goalPeriod === p ? 2 : 0
                                }}
                            >
                                <Text style={{fontSize: 10, fontWeight: goalPeriod === p ? 'bold' : 'normal', color: theme.textPrimary}}>
                                    {p === 'daily' ? 'Dag' : p === 'weekly' ? 'Vecka' : p === 'monthly' ? 'Månad' : 'Period'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Custom Date Range Inputs */}
                    {goalPeriod === 'custom' && (
                        <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                             <View style={{flex: 1}}>
                                <Text style={{fontSize: 10, color: theme.textSecondary, marginBottom: 4}}>Start (YYYY-MM-DD)</Text>
                                <TextInput 
                                    style={[styles.input, {color:theme.textPrimary, borderColor:theme.border, marginBottom: 0}]} 
                                    value={goalStartDate} 
                                    onChangeText={setGoalStartDate} 
                                    placeholder="2024-01-01" 
                                    placeholderTextColor={theme.textSecondary}
                                />
                             </View>
                             <View style={{flex: 1}}>
                                <Text style={{fontSize: 10, color: theme.textSecondary, marginBottom: 4}}>Slut (YYYY-MM-DD)</Text>
                                <TextInput 
                                    style={[styles.input, {color:theme.textPrimary, borderColor:theme.border, marginBottom: 0}]} 
                                    value={goalEndDate} 
                                    onChangeText={setGoalEndDate} 
                                    placeholder="2024-01-10" 
                                    placeholderTextColor={theme.textSecondary}
                                />
                             </View>
                        </View>
                    )}

                    <TextInput 
                        style={[styles.input, {color:theme.textPrimary, borderColor:theme.border}]} 
                        value={goalTarget} 
                        onChangeText={setGoalTarget} 
                        placeholder="Mål (minuter)" 
                        keyboardType="numeric" 
                        placeholderTextColor={theme.textSecondary}
                    />
                    
                    <View style={styles.modalButtons}>
                        <TouchableOpacity onPress={() => setShowGoalModal(false)}><Text style={{color:theme.textSecondary}}>Avbryt</Text></TouchableOpacity>
                        <TouchableOpacity onPress={saveGoal}><Text style={{color:theme.textPrimary, fontWeight:'bold'}}>Spara</Text></TouchableOpacity>
                    </View>
                </View>
            </View>
          </Modal>
        </>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 15, alignItems:'center', borderBottomWidth:1 },
  headerTitle: { fontSize:18, fontWeight:'bold' },
  scrollView: { padding:20 },
  tabBar: { flexDirection:'row', height:60, alignItems:'center', borderTopWidth:1 },
  tabItem: { flex:1, alignItems:'center', justifyContent:'center' },
  tabText: { fontSize:10, marginTop:4 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 9999, 
  },
  habitCard: { borderRadius:16, padding:15, marginBottom:15, elevation:2, shadowColor:'#000', shadowOpacity:0.1, shadowOffset:{width:0, height:2} },
  cardHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 },
  habitName: { fontSize:20, fontWeight:'bold' },
  modeSwitcherContainer: { flexDirection:'row', borderRadius:8, padding:2, marginBottom:15 },
  modeTab: { flex:1, alignItems:'center', padding:8, borderRadius:6 },
  modeTabText: { fontSize:12, fontWeight:'600', color:'#7f8c8d' },
  timerDisplayContainer: { alignItems:'center', marginVertical:10 },
  timerDisplay: { fontSize:40, fontWeight:'300', fontVariant:['tabular-nums'] },
  timerControlContainer: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', width:'100%', paddingHorizontal:20 },
  arrowButton: { width:40, height:40, borderRadius:20, borderWidth:2, alignItems:'center', justifyContent:'center' },
  timerValueText: { fontSize:30, fontWeight:'bold' },
  actionButton: { padding:15, borderRadius:12, alignItems:'center' },
  actionButtonText: { color:'#fff', fontWeight:'bold', fontSize:16 },
  progressBarBg: { height:4, borderRadius:2, marginBottom:10, overflow:'hidden' },
  progressBarFill: { height:'100%' },
  sectionTitle: { fontSize:18, fontWeight:'bold', marginBottom:15 },
  themeCard: { flexDirection:'row', padding:15, borderRadius:12, borderWidth:1, marginBottom:10, alignItems:'center' },
  colorPreview: { width:30, height:30, borderRadius:15 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:20 },
  modalContent: { padding:25, borderRadius:20 },
  modalTitle: { fontSize:20, fontWeight:'bold', marginBottom:20, textAlign:'center' },
  input: { borderWidth:1, padding:12, borderRadius:8, marginBottom:15, fontSize:16 },
  colorGrid: { flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:20, justifyContent:'center' },
  colorCircle: { width:36, height:36, borderRadius:18 },
  colorSelected: { borderWidth:3, borderColor:'#333' },
  modalButtons: { flexDirection:'row', justifyContent:'space-between', gap:10, marginTop:15 },
  filterContainer: { flexDirection:'row', marginBottom:20, backgroundColor:'#f0f0f0', borderRadius:8, padding:2 },
  filterBtn: { flex:1, padding:8, alignItems:'center', borderRadius:6 },
  chartHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15 },
  chartContainer: { padding:15, borderRadius:12 },
});
