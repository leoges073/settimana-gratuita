import { useState, useEffect, useCallback, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Home, 
  Calendar, 
  Activity, 
  BookOpen, 
  Award, 
  ChevronLeft, 
  Play, 
  RotateCcw, 
  CheckCircle2,
  AlertTriangle,
  Plus
} from "lucide-react";
import { format, isSameDay, subDays, parseISO, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { 
  EXERCISES, 
  WEEKLY, 
  TEST_Q, 
  BADGES, 
  CAT_CFG, 
  type Exercise, 
  type UserStats, 
  type UserProfile,
  type DiaryEntry,
  type TrialInfo
} from "./constants";
import { cn, storage } from "./lib/utils";

type Screen = "registration" | "expired" | "welcome" | "breath" | "test" | "home" | "program" | "exercises" | "active" | "diary" | "badges";

export default function App() {
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(storage.get("sl_trial", null));
  const [screen, setScreen] = useState<Screen>(() => {
    const storedTrial = storage.get("sl_trial", null);
    if (!storedTrial) return "registration";
    
    const regDate = new Date(storedTrial.registrationDate);
    const now = new Date();
    const daysPassed = differenceInDays(now, regDate);
    
    if (daysPassed >= 7) return "expired";
    const profile = storage.get("sl_profile", null);
    return profile ? "home" : "welcome";
  });
  const [prevScreen, setPrevScreen] = useState<Screen | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(storage.get("sl_profile", null));
  const defaultStats: UserStats = {
    streak: 0,
    completed: 0,
    completedDates: [],
    completedSessions: {},
    lastDate: null,
    diaryEntries: [],
    unlockedBadges: [],
    notificationsEnabled: true
  };
  const [stats, setStats] = useState<UserStats>(() => {
    const stored = storage.get("sl_stats", defaultStats);
    return { ...defaultStats, ...stored };
  });
  const [currentExId, setCurrentExId] = useState<number | null>(null);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [sessionQueue, setSessionQueue] = useState<number[]>([]);
  const [testStep, setTestStep] = useState(0);
  const [testAnswers, setTestAnswers] = useState<UserProfile>({});
  const [pendingExId, setPendingExId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ title: string, body: string } | null>(null);

  useEffect(() => {
    if (trialInfo) {
      const regDate = new Date(trialInfo.registrationDate);
      const now = new Date();
      const daysPassed = differenceInDays(now, regDate);
      
      if (daysPassed >= 7) {
        setScreen("expired");
      } else if (profile && screen === "welcome") {
        setScreen("home");
      }
    } else {
      setScreen("registration");
    }
    
    // Notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Notification logic
  useEffect(() => {
    if (!stats.notificationsEnabled) return;

    const checkNotifications = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const today = format(now, "yyyy-MM-dd");
      const completedToday = stats.completedSessions[today] || [];

      // Check sessions
      const sessions = [
        { id: 'mattina', time: '09:00', title: '☀️ Sessione Mattutina', body: 'Inizia la giornata con 5 minuti per la tua schiena!' },
        { id: 'pomeriggio', time: '14:00', title: '🌤️ Sessione Pomeridiana', body: 'Fai una pausa! La tua schiena ti ringrazierà.' },
        { id: 'sera', time: '19:00', title: '🌙 Sessione Serale', body: 'Rilassa le tensioni prima di dormire.' }
      ];

      sessions.forEach(s => {
        const [h, m] = s.time.split(':').map(Number);
        if (hours === h && minutes === m && !completedToday.includes(s.id)) {
          // Trigger notification
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(s.title, { body: s.body, icon: '/logo.png' });
          } else {
            setNotification({ title: s.title, body: s.body });
          }
        }
      });
    };

    const interval = setInterval(checkNotifications, 60000); // Every minute
    return () => clearInterval(interval);
  }, [stats.notificationsEnabled, stats.completedSessions]);

  const navigateTo = (newScreen: Screen) => {
    setPrevScreen(screen);
    setScreen(newScreen);
  };

  const saveProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    storage.set("sl_profile", newProfile);
  };

  const saveTrial = (info: { name: string, email: string }) => {
    const newTrial: TrialInfo = {
      ...info,
      registrationDate: new Date().toISOString()
    };
    setTrialInfo(newTrial);
    storage.set("sl_trial", newTrial);
    setScreen("welcome");
  };

  const getRemainingDays = () => {
    if (!trialInfo) return 0;
    const regDate = new Date(trialInfo.registrationDate);
    const now = new Date();
    const daysPassed = differenceInDays(now, regDate);
    return Math.max(0, 7 - daysPassed);
  };

  const remainingDays = getRemainingDays();

  const updateStats = (newStats: UserStats) => {
    setStats(newStats);
    storage.set("sl_stats", newStats);
  };

  const completeExercise = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const newCompletedDates = [...stats.completedDates];
    let newStreak = stats.streak;

    if (!newCompletedDates.includes(today)) {
      newCompletedDates.push(today);
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
      if (stats.lastDate === yesterday) {
        newStreak += 1;
      } else if (stats.lastDate !== today) {
        newStreak = 1;
      }
    }

    // Check if there's more in the queue
    if (sessionQueue.length > 0) {
      const nextExId = sessionQueue[0];
      setSessionQueue(sessionQueue.slice(1));
      setCurrentExId(nextExId);
      // Stay on active screen for next exercise
      return;
    }

    // Update sessions if applicable
    const newCompletedSessions = { ...stats.completedSessions };
    if (currentSession) {
      const todaySessions = newCompletedSessions[today] || [];
      if (!todaySessions.includes(currentSession)) {
        todaySessions.push(currentSession);
        newCompletedSessions[today] = todaySessions;
      }
    }

    const newStats: UserStats = {
      ...stats,
      completed: stats.completed + 1,
      completedDates: newCompletedDates,
      completedSessions: newCompletedSessions,
      lastDate: today,
      streak: newStreak
    };

    // Check badges
    const newBadges = BADGES.filter(b => b.condition(newStats) && !stats.unlockedBadges.includes(b.id)).map(b => b.id);
    if (newBadges.length > 0) {
      newStats.unlockedBadges = [...stats.unlockedBadges, ...newBadges];
    }

    updateStats(newStats);
    setCurrentSession(null);
    setSessionQueue([]);
    navigateTo("home");
  };

  return (
    <div className="h-full w-full max-w-md mx-auto relative bg-slate-bg overflow-hidden flex flex-col">
      {/* Trial Banner */}
      {trialInfo && screen !== "expired" && screen !== "registration" && (
        <div className="bg-teal-primary text-white text-[10px] py-1.5 px-4 text-center font-bold tracking-wider uppercase z-[60]">
          Prova gratuita: {remainingDays} {remainingDays === 1 ? "giorno rimanente" : "giorni rimanenti"}
        </div>
      )}

      <AnimatePresence mode="wait">
        {screen === "registration" && (
          <RegistrationScreen onRegister={saveTrial} />
        )}
        {screen === "expired" && (
          <TrialExpiredScreen />
        )}
        {screen === "welcome" && (
          <WelcomeScreen onStart={() => navigateTo("test")} />
        )}
        {screen === "test" && (
          <TestScreen 
            step={testStep} 
            setStep={setTestStep} 
            answers={testAnswers} 
            setAnswers={setTestAnswers} 
            onFinish={(ans) => {
              saveProfile(ans);
              navigateTo("home");
            }} 
          />
        )}
        {screen === "breath" && (
          <BreathScreen 
            onFinish={() => {
              if (pendingExId) {
                setCurrentExId(pendingExId);
                setPendingExId(null);
                navigateTo("active");
              } else {
                navigateTo("home");
              }
            }} 
          />
        )}
        {screen === "home" && (
          <HomeScreen 
            stats={stats} 
            onStartExercise={(id, session, allIds) => {
              if (allIds && allIds.length > 1) {
                const idx = allIds.indexOf(id);
                setPendingExId(id);
                setSessionQueue(allIds.slice(idx + 1));
              } else {
                setPendingExId(id);
                setSessionQueue([]);
              }
              setCurrentSession(session || null);
              navigateTo("breath");
            }} 
            onNavigate={navigateTo}
            onToggleNotifications={() => {
              updateStats({ ...stats, notificationsEnabled: !stats.notificationsEnabled });
            }}
          />
        )}
        {screen === "program" && (
          <ProgramScreen 
            onBack={() => navigateTo("home")} 
            onSelectExercise={(id, session, allIds) => {
              if (allIds && allIds.length > 1) {
                const idx = allIds.indexOf(id);
                setCurrentExId(id);
                setSessionQueue(allIds.slice(idx + 1));
              } else {
                setCurrentExId(id);
                setSessionQueue([]);
              }
              setCurrentSession(session || null);
              navigateTo("active");
            }}
          />
        )}
        {screen === "exercises" && (
          <ExercisesScreen 
            onBack={() => navigateTo("home")} 
            onSelectExercise={(id) => {
              setCurrentExId(id);
              navigateTo("active");
            }}
          />
        )}
        {screen === "active" && currentExId && (
          <ActiveExerciseScreen 
            exercise={EXERCISES.find(e => e.id === currentExId)!} 
            onBack={() => navigateTo("exercises")} 
            onComplete={completeExercise}
            isLast={sessionQueue.length === 0}
          />
        )}
        {screen === "diary" && (
          <DiaryScreen 
            stats={stats} 
            onSave={(entry) => {
              const newStats = {
                ...stats,
                diaryEntries: [entry, ...stats.diaryEntries].slice(0, 30)
              };
              updateStats(newStats);
            }}
            onBack={() => navigateTo("home")}
          />
        )}
        {screen === "badges" && (
          <BadgesScreen 
            stats={stats} 
            onBack={() => navigateTo("home")}
          />
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      {["home", "program", "exercises", "diary", "badges"].includes(screen) && (
        <BottomNav active={screen} onNavigate={navigateTo} />
      )}

      {/* In-app notification */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-4 right-4 bg-white rounded-2xl p-4 card-shadow-md z-[100] border-l-4 border-teal-primary flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-teal-soft flex items-center justify-center text-xl shrink-0">
              🔔
            </div>
            <div className="flex-1">
              <p className="font-syne font-bold text-sm text-navy">{notification.title}</p>
              <p className="text-xs text-slate-text">{notification.body}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-slate-text p-1">
              <Plus className="w-5 h-5 rotate-45" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #1A2F4A 0%, #1E3A5F 60%, #0a2240 100%)" }}
    >
      {/* Particles */}
      {[...Array(8)].map((_, i) => (
        <div 
          key={i}
          className="animate-particle absolute rounded-full bg-teal-primary/50"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: `${Math.random() * 5 + 3}px`,
            height: `${Math.random() * 5 + 3}px`,
            animationDelay: `${Math.random() * 2}s`
          }}
        />
      ))}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center z-10">
        <div className="relative w-32 h-32 flex items-center justify-center mb-6 animate-logo-appear">
          <div className="absolute inset-0 border-[1.5px] border-teal-primary/35 rounded-full animate-ring-pulse" />
          <div className="absolute inset-[-12px] border-[1.5px] border-teal-primary/35 rounded-full animate-ring-pulse [animation-delay:0.5s]" />
          <div className="w-24 h-24 rounded-3xl bg-white flex items-center justify-center shadow-[0_8px_28px_rgba(0,168,150,0.4)] overflow-hidden">
            <img 
              src="/logo.png" 
              alt="SchienaLibera Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  e.currentTarget.style.display = 'none';
                  parent.innerHTML = '<span class="text-4xl">🧘</span>';
                  parent.className = "w-[72px] h-[72px] rounded-3xl bg-gradient-to-br from-teal-accent to-teal-primary flex items-center justify-center shadow-[0_8px_28px_rgba(0,168,150,0.4)]";
                }
              }}
            />
          </div>
        </div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="font-syne text-3xl font-extrabold mb-2 tracking-tight"
        >
          <span className="text-white">Schiena</span>
          <span className="text-teal-primary">Libera</span>
        </motion.div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mb-4"
        >
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-teal-primary bg-teal-primary/12 px-3.5 py-1 rounded-full border border-teal-primary/25">
            Protocollo Anti-Lombalgia
          </span>
        </motion.div>

        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="font-syne text-[1.7rem] font-extrabold text-white leading-[1.15] mb-3 flex flex-col"
        >
          <span>La tua schiena libera</span>
          <span>in <em className="text-amber-warn not-italic">7 giorni</em>.</span>
        </motion.h1>

        <motion.p 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="text-[0.85rem] text-white/55 mb-7"
        >
          12 esercizi guidati · 5 minuti al giorno · Zero attrezzatura
        </motion.p>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.3 }}
          className="flex items-center bg-white/6 border border-white/10 rounded-[18px] px-5 py-4 mb-8 w-full max-w-[300px]"
        >
          <div className="flex-1 text-center">
            <div className="font-syne text-2xl font-extrabold text-amber-warn leading-none">12</div>
            <div className="text-[10px] text-white/45 mt-1 uppercase tracking-wider">Esercizi</div>
          </div>
          <div className="w-px h-9 bg-white/12 mx-2" />
          <div className="flex-1 text-center">
            <div className="font-syne text-2xl font-extrabold text-amber-warn leading-none">5</div>
            <div className="text-[10px] text-white/45 mt-1 uppercase tracking-wider">Min/giorno</div>
          </div>
          <div className="w-px h-9 bg-white/12 mx-2" />
          <div className="flex-1 text-center">
            <div className="font-syne text-2xl font-extrabold text-amber-warn leading-none">7</div>
            <div className="text-[10px] text-white/45 mt-1 uppercase tracking-wider">Giorni</div>
          </div>
        </motion.div>

        <motion.button 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.5 }}
          whileTap={{ scale: 0.98 }}
          onClick={onStart}
          className="w-full max-w-[320px] py-4 rounded-[18px] font-syne font-bold text-[1.05rem] text-navy bg-amber-warn shadow-[0_8px_28px_rgba(245,166,35,0.4)] animate-cta-pulse mb-4"
        >
          Inizia il test personale →
        </motion.button>

        <motion.p 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.7 }}
          className="text-[0.75rem] text-white/28"
        >
          Smetti di sopportare.
        </motion.p>
      </div>
    </motion.div>
  );
}

function BreathScreen({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState(0);
  const [count, setCount] = useState<number | string>("");
  const [progress, setProgress] = useState(0);

  const phases = [
    { label: "Preparati...", sub: "Rilassa le spalle · Piedi piatti a terra", count: "", dur: 2000, expand: false, emoji: "🧘" },
    { label: "Inspira", sub: "Lentamente dal naso", count: 4, dur: 4000, expand: true, emoji: "🌬️" },
    { label: "Tieni", sub: "Trattieni il respiro", count: 2, dur: 2000, expand: true, emoji: "✨" },
    { label: "Espira", sub: "Lentamente dalla bocca", count: 6, dur: 6000, expand: false, emoji: "😮‍💨" },
    { label: "Perfetto", sub: "Sei pronto per iniziare", count: "✓", dur: 1500, expand: false, emoji: "💚" },
  ];

  useEffect(() => {
    let currentPhase = 0;
    let timer: any;
    let countdownInterval: any;

    const runPhase = (idx: number) => {
      const p = phases[idx];
      setPhase(idx);
      setCount(p.count);

      if (typeof p.count === "number") {
        let c = p.count;
        countdownInterval = setInterval(() => {
          c -= 1;
          if (c >= 0) setCount(c);
          if (c <= 0) clearInterval(countdownInterval);
        }, 1000);
      }

      timer = setTimeout(() => {
        clearInterval(countdownInterval);
        if (idx < phases.length - 1) {
          runPhase(idx + 1);
        } else {
          onFinish();
        }
      }, p.dur);
    };

    runPhase(0);

    const totalDur = phases.reduce((a, p) => a + p.dur, 0);
    const start = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / totalDur, 1));
    }, 50);

    return () => {
      clearTimeout(timer);
      clearInterval(countdownInterval);
      clearInterval(progressInterval);
    };
  }, []);

  const current = phases[phase];
  const circ = 452.39;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-between px-6 py-10"
      style={{ background: "linear-gradient(160deg, #1A2F4A 0%, #1E3A5F 60%, #0a2240 100%)" }}
    >
      <div className="text-center pt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-teal-primary">Prima di iniziare</p>
        <h2 className="font-syne text-2xl font-bold text-white">Un respiro.</h2>
      </div>

      <div className="relative w-40 h-40 flex items-center justify-center">
        <motion.div 
          animate={{ scale: current.expand ? 1.15 : 1 }}
          transition={{ duration: current.dur / 1000, ease: "easeInOut" }}
          className="absolute w-40 h-40 border-[1.5px] border-teal-primary/25 rounded-full opacity-30"
        />
        <motion.div 
          animate={{ scale: current.expand ? 1.1 : 1 }}
          transition={{ duration: current.dur / 1000, ease: "easeInOut" }}
          className="absolute w-36 h-36 border-[1.5px] border-teal-primary/25 rounded-full opacity-60"
        />
        <motion.div 
          animate={{ scale: current.expand ? 1.12 : 1 }}
          transition={{ duration: current.dur / 1000, ease: "easeInOut" }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-accent to-teal-primary flex items-center justify-center shadow-[0_0_40px_rgba(0,168,150,0.4)] z-10"
        >
          <span className="text-3xl">{current.emoji}</span>
        </motion.div>

        <svg className="absolute inset-0 -rotate-90" width="160" height="160">
          <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle 
            cx="80" cy="80" r="72" fill="none" stroke="#00A896" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-100 ease-linear"
          />
        </svg>
      </div>

      <div className="text-center min-h-[80px]">
        <p className="font-syne text-xl font-bold text-white mb-2">{current.label}</p>
        <p className="font-syne text-5xl font-bold text-amber-warn">{count}</p>
        <p className="text-sm mt-2 text-white/50">{current.sub}</p>
      </div>

      <button 
        onClick={onFinish}
        className="text-sm py-2 px-6 rounded-full text-white/40 border border-white/15 bg-transparent"
      >
        Salta
      </button>
    </motion.div>
  );
}

function TestScreen({ step, setStep, answers, setAnswers, onFinish }: { 
  step: number, 
  setStep: (s: number) => void, 
  answers: UserProfile, 
  setAnswers: (a: UserProfile) => void,
  onFinish: (ans: UserProfile) => void
}) {
  const q = TEST_Q[step];
  const pct = Math.round(((step + 1) / TEST_Q.length) * 100);

  const handleSelect = (idx: number) => {
    setAnswers({ ...answers, [q.key]: idx });
  };

  const handleNext = () => {
    if (answers[q.key] === undefined) return;
    if (step < TEST_Q.length - 1) {
      setStep(step + 1);
    } else {
      onFinish(answers);
    }
  };

  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      className="flex-1 px-5 pt-8 pb-6 flex flex-col bg-slate-bg"
    >
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 bg-teal-soft">
          <span className="text-2xl">🧘</span>
        </div>
        <h1 className="font-syne text-2xl font-bold text-navy">SchienaLibera</h1>
        <p className="text-sm mt-1 text-slate-text">Scopriamo il tuo profilo personale</p>
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-[10px] mb-2 text-slate-text font-bold uppercase tracking-wider">
          <span>Domanda {step + 1} di {TEST_Q.length}</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#E5EEF2] overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            className="h-full rounded-full bg-gradient-to-r from-teal-primary to-teal-accent"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <h2 className="font-syne text-lg font-bold mb-5 text-navy">{q.q}</h2>
        <div className="space-y-3 flex-1">
          {q.opts.map((o, i) => (
            <button 
              key={i}
              onClick={() => handleSelect(i)}
              className={cn(
                "w-full text-left p-4 rounded-xl border-2 text-sm transition-all",
                answers[q.key] === i 
                  ? "border-teal-primary bg-teal-soft text-teal-primary" 
                  : "border-[#E5EEF2] bg-white text-navy"
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        {step > 0 && (
          <button 
            onClick={() => setStep(step - 1)}
            className="flex-1 py-3 rounded-xl border border-[#E5EEF2] text-slate-text font-semibold text-sm"
          >
            Indietro
          </button>
        )}
        <button 
          onClick={handleNext}
          disabled={answers[q.key] === undefined}
          className={cn(
            "flex-1 py-3 rounded-xl font-bold text-sm text-white transition-opacity",
            answers[q.key] === undefined ? "opacity-50" : "opacity-100 bg-teal-primary"
          )}
        >
          {step < TEST_Q.length - 1 ? "Avanti" : "Concludi"}
        </button>
      </div>
    </motion.div>
  );
}

function HomeScreen({ stats, onStartExercise, onNavigate, onToggleNotifications }: { 
  stats: UserStats, 
  onStartExercise: (id: number, session?: string, allIds?: number[]) => void,
  onNavigate: (s: Screen) => void,
  onToggleNotifications: () => void
}) {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const todayData = getTodaySessions(stats.streak);
  const completedToday = stats.completedSessions[today] || [];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 px-5 pt-6 pb-24 overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-slate-text capitalize">
            {format(now, "EEEE d MMMM", { locale: it })}
          </p>
          <h1 className="font-syne text-xl font-bold text-navy">Ciao! 👋</h1>
          <p className="text-xs text-slate-text mt-0.5">Come stai oggi?</p>
        </div>
        <button 
          onClick={onToggleNotifications}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            stats.notificationsEnabled ? "bg-teal-soft text-teal-primary" : "bg-slate-200 text-slate-400"
          )}
        >
          <span className="text-lg">{stats.notificationsEnabled ? "🔔" : "🔕"}</span>
        </button>
      </div>

      {/* Week strip */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
        {[...Array(7)].map((_, i) => {
          const d = subDays(now, 6 - i);
          const ds = format(d, "yyyy-MM-dd");
          const done = stats.completedDates.includes(ds);
          const isToday = i === 6;
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
              <span className="text-[10px] text-slate-text uppercase font-bold">
                {format(d, "eee", { locale: it })}
              </span>
              <div 
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-syne font-bold card-shadow",
                  isToday ? "bg-teal-primary text-white" : done ? "bg-teal-light text-teal-accent" : "bg-white text-slate-text"
                )}
              >
                {done ? "✓" : format(d, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily Sessions */}
      <div className="mb-6">
        <h2 className="font-syne text-sm font-bold text-navy mb-3 uppercase tracking-wider">Programma di Oggi</h2>
        <div className="space-y-3">
          <SessionCard 
            title="Mattina" 
            time="09:00" 
            icon="☀️" 
            exIds={todayData.mattina} 
            isDone={completedToday.includes('mattina')}
            onStart={() => onStartExercise(todayData.mattina[0], 'mattina', todayData.mattina)}
          />
          <SessionCard 
            title="Pomeriggio" 
            time="14:00" 
            icon="🌤️" 
            exIds={todayData.pomeriggio} 
            isDone={completedToday.includes('pomeriggio')}
            onStart={() => onStartExercise(todayData.pomeriggio[0], 'pomeriggio', todayData.pomeriggio)}
          />
          <SessionCard 
            title="Sera" 
            time="19:00" 
            icon="🌙" 
            exIds={todayData.sera} 
            isDone={completedToday.includes('sera')}
            onStart={() => onStartExercise(todayData.sera[0], 'sera', todayData.sera)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 card-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-soft">
              <span className="text-base">🔥</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-text">Streak</span>
          </div>
          <p className="font-syne font-bold text-2xl text-navy">{stats.streak}</p>
          <p className="text-[10px] text-slate-text">giorni di fila</p>
        </div>
        <div className="bg-white rounded-2xl p-4 card-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-light">
              <span className="text-base">🏆</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-text">Completati</span>
          </div>
          <p className="font-syne font-bold text-2xl text-navy">{stats.completed}</p>
          <p className="text-[10px] text-slate-text">esercizi totali</p>
        </div>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3">
        <QuickNavButton 
          icon="📅" 
          title="Programma" 
          desc="Piano 4 settimane" 
          onClick={() => onNavigate("program")} 
        />
        <QuickNavButton 
          icon="🏃" 
          title="Esercizi" 
          desc="12 movimenti" 
          onClick={() => onNavigate("exercises")} 
        />
        <QuickNavButton 
          icon="📖" 
          title="Diario" 
          desc="Traccia il dolore" 
          onClick={() => onNavigate("diary")} 
          color="amber"
        />
        <QuickNavButton 
          icon="🏅" 
          title="Badge" 
          desc="I tuoi traguardi" 
          onClick={() => onNavigate("badges")} 
          color="amber"
        />
      </div>
    </motion.div>
  );
}

function SessionCard({ title, time, icon, exIds, isDone, onStart }: { 
  title: string, 
  time: string, 
  icon: string, 
  exIds: number[], 
  isDone: boolean,
  onStart: () => void
}) {
  const exercises = exIds.map(id => EXERCISES.find(e => e.id === id)).filter(Boolean);
  const totalDuration = exercises.reduce((acc, e) => acc + (e?.duration || 0), 0);
  const totalMin = Math.ceil(totalDuration / 60);
  
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      onClick={!isDone ? onStart : undefined}
      className={cn(
        "bg-white rounded-2xl p-4 card-shadow flex items-center gap-3 transition-all",
        isDone ? "opacity-60 grayscale" : "cursor-pointer"
      )}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-teal-soft">
        {isDone ? "✅" : icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-primary">{time} · {totalMin} min</p>
          {isDone && <span className="text-[9px] font-bold text-teal-accent uppercase">Completata</span>}
        </div>
        <p className="font-syne font-bold text-sm text-navy">{title}</p>
        <p className="text-[10px] text-slate-text">
          {exercises.map(e => e?.name).join(' · ')}
        </p>
      </div>
      {!isDone && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-teal-primary">
          <Play className="w-4 h-4 text-white fill-white ml-0.5" />
        </div>
      )}
    </motion.div>
  );
}

function QuickNavButton({ icon, title, desc, onClick, color = "teal" }: { 
  icon: string, 
  title: string, 
  desc: string, 
  onClick: () => void,
  color?: "teal" | "amber"
}) {
  return (
    <motion.button 
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-2xl p-4 card-shadow text-left"
    >
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center mb-2",
        color === "teal" ? "bg-teal-soft" : "bg-amber-light"
      )}>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="font-syne font-bold text-sm text-navy">{title}</p>
      <p className="text-[10px] text-slate-text">{desc}</p>
    </motion.button>
  );
}

function ProgramScreen({ onBack, onSelectExercise }: { onBack: () => void, onSelectExercise: (id: number, session?: string, allIds?: number[]) => void }) {
  const [currentWeek, setCurrentWeek] = useState(0);
  const week = WEEKLY[currentWeek];

  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex-1 px-5 pt-6 pb-24 overflow-y-auto bg-slate-bg"
    >
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white card-shadow flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-navy" />
        </button>
        <div>
          <h1 className="font-syne text-lg font-bold text-navy">Programma Mensile</h1>
          <p className="text-xs text-slate-text">4 settimane progressive</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
        {WEEKLY.map((w, i) => (
          <button 
            key={i}
            onClick={() => setCurrentWeek(i)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
              currentWeek === i ? "bg-teal-primary text-white" : "bg-white text-slate-text card-shadow"
            )}
          >
            Sett. {i + 1}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-4 card-shadow mb-4">
        <p className="font-syne font-bold text-sm text-navy">{week.title}</p>
        <p className="text-xs text-slate-text mt-1">{week.desc}</p>
      </div>

      <div className="space-y-3">
        {week.days.map((day, i) => (
          <div key={i} className={cn("bg-white rounded-2xl p-4 card-shadow", day.rest && "opacity-60")}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-syne font-bold text-sm text-navy">{day.label}</p>
              {!day.rest && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-soft text-teal-primary uppercase">
                  ≈15 min totali
                </span>
              )}
            </div>
            {day.rest ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-bg">
                  <span className="text-lg">😴</span>
                </div>
                <p className="text-xs text-slate-text">Riposo — recupero attivo</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(['mattina', 'pomeriggio', 'sera'] as const).map(sessionKey => {
                  const ids = day.sessions[sessionKey];
                  if (ids.length === 0) return null;
                  return (
                    <div key={sessionKey} className="border-l-2 border-teal-primary/20 pl-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-teal-primary mb-1">{sessionKey}</p>
                      <div className="space-y-2">
                        {ids.map(id => {
                          const e = EXERCISES.find(ex => ex.id === id)!;
                          return (
                            <div key={id} onClick={() => onSelectExercise(id, sessionKey, ids)} className="flex items-center gap-2 cursor-pointer group">
                              <span className="text-base group-hover:scale-110 transition-transform">{e.emoji}</span>
                              <span className="text-xs text-navy group-hover:text-teal-primary transition-colors">{e.name}</span>
                              <span className="text-[10px] text-slate-text ml-auto">{e.duration}s</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ExercisesScreen({ onBack, onSelectExercise }: { onBack: () => void, onSelectExercise: (id: number) => void }) {
  const [filter, setFilter] = useState<"all" | "seduto" | "piedi">("all");
  const filtered = filter === "all" ? EXERCISES : EXERCISES.filter(e => e.position === filter);

  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex-1 px-5 pt-6 pb-24 overflow-y-auto bg-slate-bg"
    >
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white card-shadow flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-navy" />
        </button>
        <div>
          <h1 className="font-syne text-lg font-bold text-navy">Tutti gli Esercizi</h1>
          <p className="text-xs text-slate-text">12 movimenti · Da scrivania</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
        <FilterButton active={filter === "all"} label="Tutti" onClick={() => setFilter("all")} />
        <FilterButton active={filter === "seduto"} label="🪑 Seduto" onClick={() => setFilter("seduto")} />
        <FilterButton active={filter === "piedi"} label="🧍 In piedi" onClick={() => setFilter("piedi")} />
      </div>

      <div className="space-y-3">
        {filtered.map(e => {
          const cat = CAT_CFG[e.category];
          return (
            <motion.div 
              key={e.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectExercise(e.id)}
              className="bg-white rounded-2xl p-4 card-shadow cursor-pointer flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-teal-soft">
                {e.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-syne font-bold text-sm truncate text-navy">{e.name}</p>
                  {e.videoId && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-light text-teal-accent uppercase">
                      ▶ Video
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-text truncate">{e.zone}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase" style={{ background: cat.color, color: cat.text }}>
                    {cat.label}
                  </span>
                  <span className="text-[10px] text-slate-text">⏱ {e.duration}s</span>
                </div>
              </div>
              <span className="text-slate-text">›</span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
        active ? "bg-teal-primary text-white" : "bg-white text-slate-text card-shadow"
      )}
    >
      {label}
    </button>
  );
}

function ActiveExerciseScreen({ exercise, onBack, onComplete, isLast }: { 
  exercise: Exercise, 
  onBack: () => void, 
  onComplete: () => void,
  isLast: boolean
}) {
  const [seconds, setSeconds] = useState(exercise.duration);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds(s => s - 1);
      }, 1000);
    } else if (seconds === 0) {
      setIsActive(false);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const resetTimer = () => {
    setIsActive(false);
    setSeconds(exercise.duration);
  };

  const circ = 326.73;
  const progress = seconds / exercise.duration;

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex-1 px-5 pt-6 pb-6 overflow-y-auto bg-slate-bg"
    >
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white card-shadow flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-navy" />
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-text">
          {exercise.position === "seduto" ? "🪑 Seduto" : "🧍 In piedi"}
        </span>
        <div className="w-9" />
      </div>

      <div className="mb-5">
        {exercise.videoId ? (
          <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-2xl bg-black">
            <iframe 
              src={`https://www.youtube.com/embed/${exercise.videoId}?rel=0&modestbranding=1`}
              className="absolute top-0 left-0 w-full h-full border-0"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        ) : (
          <div className="h-44 bg-gradient-to-br from-teal-soft to-teal-light rounded-2xl flex flex-col items-center justify-center gap-2">
            <span className="text-5xl">{exercise.emoji}</span>
            <p className="text-xs font-bold text-teal-accent">Video disponibile a breve</p>
          </div>
        )}
      </div>

      <h2 className="font-syne text-xl font-bold text-navy mb-1">{exercise.name}</h2>
      <p className="text-xs text-slate-text mb-4">{exercise.zone}</p>

      <div className="flex justify-center mb-5">
        <div className="relative w-36 h-36">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#EEF8F7" strokeWidth="8" />
            <motion.circle 
              cx="60" cy="60" r="52" fill="none" stroke="#00A896" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circ}
              animate={{ strokeDashoffset: circ * (1 - progress) }}
              transition={{ duration: 1, ease: "linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-syne text-3xl font-bold text-navy">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
            <span className="text-[10px] text-slate-text uppercase font-bold tracking-wider">secondi</span>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-4 mb-5">
        <button 
          onClick={() => setIsActive(!isActive)}
          className="px-8 py-3 rounded-xl text-white font-bold text-sm bg-teal-primary flex items-center gap-2 shadow-lg shadow-teal-primary/20"
        >
          {isActive ? "Pausa" : "Inizia"}
        </button>
        <button 
          onClick={resetTimer}
          className="px-4 py-3 rounded-xl bg-white card-shadow text-slate-text"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
        <p className="font-syne font-bold text-sm mb-2 text-navy">Come fare</p>
        <ol className="space-y-2 text-xs text-slate-text list-decimal list-inside">
          {exercise.instructions.map((inst, i) => (
            <li key={i} className="leading-relaxed">{inst}</li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl p-4 mb-3 bg-amber-light">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-warn mb-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Attenzione
        </p>
        <p className="text-[10px] text-amber-warn/80 leading-relaxed">{exercise.warning}</p>
      </div>

      <button 
        onClick={onComplete}
        className="w-full py-4 rounded-2xl font-syne font-bold text-white text-base bg-teal-primary shadow-[0_4px_16px_rgba(0,168,150,0.3)]"
      >
        {isLast ? "✓ Sessione Completata" : "Prossimo Esercizio →"}
      </button>
    </motion.div>
  );
}

function DiaryScreen({ stats, onSave, onBack }: { stats: UserStats, onSave: (e: DiaryEntry) => void, onBack: () => void }) {
  const [pain, setPain] = useState(5);
  const [notes, setNotes] = useState("");

  const painLabels = ['', 'Quasi zero', 'Leggero', 'Leggero', 'Moderato', 'Moderato', 'Intenso', 'Intenso', 'Forte', 'Forte', 'Insopportabile'];

  const handleSave = () => {
    onSave({
      date: format(new Date(), "d/M/yyyy"),
      pain,
      notes
    });
    setNotes("");
    alert("✓ Voce salvata!");
  };

  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex-1 px-5 pt-6 pb-24 overflow-y-auto bg-slate-bg"
    >
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white card-shadow flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-navy" />
        </button>
        <h1 className="font-syne text-lg font-bold text-navy">Diario del Dolore</h1>
      </div>

      <div className="bg-white rounded-2xl p-5 card-shadow mb-4">
        <p className="font-syne font-bold text-sm mb-1 text-navy">Come stai adesso?</p>
        <p className="text-[10px] text-slate-text mb-4">1 = nessun dolore · 10 = insopportabile</p>
        
        <div className="flex justify-between mb-2">
          <span className="text-2xl font-syne font-bold text-teal-primary">{pain}</span>
          <span className="text-[10px] font-bold text-slate-text uppercase tracking-wider self-end">{painLabels[pain]}</span>
        </div>

        <input 
          type="range" min="1" max="10" value={pain} 
          onChange={(e) => setPain(parseInt(e.target.value))}
          className="w-full mb-4 accent-teal-primary"
        />

        <textarea 
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note opzionali (dove senti il dolore, cosa hai fatto oggi...)"
          className="w-full rounded-xl p-3 text-xs border border-[#E5EEF2] text-navy h-20 outline-none focus:border-teal-primary transition-colors resize-none"
        />

        <button 
          onClick={handleSave}
          className="w-full mt-3 py-3 rounded-xl font-bold text-white text-sm bg-teal-primary"
        >
          Salva voce
        </button>
      </div>

      <p className="font-syne font-bold text-sm mb-3 text-navy">Ultime voci</p>
      <div className="space-y-3">
        {stats.diaryEntries.length === 0 ? (
          <p className="text-xs text-slate-text text-center py-4">Nessuna voce ancora. Inizia a tracciare il tuo dolore.</p>
        ) : (
          stats.diaryEntries.map((e, i) => {
            const color = e.pain <= 3 ? "#166534" : e.pain <= 6 ? "#854D0E" : "#991B1B";
            const bg = e.pain <= 3 ? "#DCFCE7" : e.pain <= 6 ? "#FEF9C3" : "#FEE2E2";
            return (
              <div key={i} className="bg-white rounded-2xl p-4 card-shadow flex items-start gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-syne font-bold text-sm flex-shrink-0"
                  style={{ background: bg, color: color }}
                >
                  {e.pain}/10
                </div>
                <div>
                  <p className="text-[10px] font-bold text-navy">{e.date}</p>
                  {e.notes && <p className="text-xs text-slate-text mt-1">{e.notes}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

function BadgesScreen({ stats, onBack }: { stats: UserStats, onBack: () => void }) {
  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex-1 px-5 pt-6 pb-24 overflow-y-auto bg-slate-bg"
    >
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white card-shadow flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-navy" />
        </button>
        <h1 className="font-syne text-lg font-bold text-navy">I tuoi Badge</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {BADGES.map(b => {
          const unlocked = stats.unlockedBadges.includes(b.id);
          return (
            <div key={b.id} className={cn("bg-white rounded-2xl p-4 card-shadow text-center transition-opacity", !unlocked && "opacity-40")}>
              <div className="text-3xl mb-2">{b.emoji}</div>
              <p className="font-syne font-bold text-sm text-navy">{b.name}</p>
              <p className="text-[10px] text-slate-text mt-1">{b.desc}</p>
              <p className={cn("text-[10px] mt-2 font-bold uppercase tracking-wider", unlocked ? "text-teal-primary" : "text-slate-text")}>
                {unlocked ? "✓ Sbloccato" : "Bloccato"}
              </p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function BottomNav({ active, onNavigate }: { active: Screen, onNavigate: (s: Screen) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-[#E5EEF2] px-4 py-2 flex justify-around z-50">
      <NavButton active={active === "home"} icon={<Home className="w-5 h-5" />} label="Home" onClick={() => onNavigate("home")} />
      <NavButton active={active === "program"} icon={<Calendar className="w-5 h-5" />} label="Programma" onClick={() => onNavigate("program")} />
      <NavButton active={active === "exercises"} icon={<Activity className="w-5 h-5" />} label="Esercizi" onClick={() => onNavigate("exercises")} />
      <NavButton active={active === "diary"} icon={<BookOpen className="w-5 h-5" />} label="Diario" onClick={() => onNavigate("diary")} />
      <NavButton active={active === "badges"} icon={<Award className="w-5 h-5" />} label="Badge" onClick={() => onNavigate("badges")} />
    </nav>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 py-1 px-3 transition-colors relative",
        active ? "text-teal-primary" : "text-slate-text"
      )}
    >
      {icon}
      <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-dot"
          className="absolute -bottom-1 w-1 h-1 rounded-full bg-teal-primary"
        />
      )}
    </button>
  );
}

// --- HELPERS ---

function getTodaySessions(streak: number) {
  const dow = new Date().getDay(); // 0=dom
  const weekIdx = Math.min(streak > 0 ? Math.floor(streak / 7) : 0, 3);
  const week = WEEKLY[weekIdx];
  const dayMap = [6, 0, 1, 2, 3, 4, 5]; // Sun=6 in our array
  const dayData = week.days[dayMap[dow]];
  if (!dayData || dayData.rest) return { mattina: [1], pomeriggio: [2], sera: [3] };
  return dayData.sessions;
}

// ===============================================================
// Trial Screens
// ===============================================================

function RegistrationScreen({ onRegister }: { onRegister: (info: { name: string, email: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name && email) {
      onRegister({ name, email });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col p-8 justify-center bg-slate-bg"
    >
      <div className="mb-12 text-center">
        <div className="w-20 h-20 bg-teal-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Activity className="w-10 h-10 text-teal-primary" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Benvenuto su Schiena Libera</h1>
        <p className="text-slate-500">Inizia il tuo percorso di benessere oggi stesso. Registrati per attivare la tua prova gratuita di 7 giorni.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">Nome Completo</label>
          <input 
            type="text" 
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-14 px-5 rounded-2xl bg-white border border-slate-200 focus:border-teal-primary focus:ring-2 focus:ring-teal-primary/20 outline-none transition-all text-slate-900"
            placeholder="Esempio: Mario Rossi"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">Email</label>
          <input 
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-14 px-5 rounded-2xl bg-white border border-slate-200 focus:border-teal-primary focus:ring-2 focus:ring-teal-primary/20 outline-none transition-all text-slate-900"
            placeholder="esempio@email.com"
          />
        </div>
        <button 
          type="submit"
          className="w-full h-14 bg-teal-primary text-white font-bold rounded-2xl shadow-lg shadow-teal-primary/30 hover:bg-teal-accent transition-all active:scale-[0.98] mt-4"
        >
          Attiva Prova Gratuita
        </button>
      </form>
      
      <p className="mt-8 text-center text-xs text-slate-400">
        Nessuna carta di credito richiesta. <br />
        Al termine dei 7 giorni potrai scegliere se continuare.
      </p>
    </motion.div>
  );
}

function TrialExpiredScreen() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col p-8 justify-center bg-slate-bg text-center"
    >
      <div className="mb-10">
        <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8">
          <AlertTriangle className="w-12 h-12 text-rose-500" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Periodo di prova terminato</h1>
        <p className="text-slate-600 leading-relaxed">
          Speriamo che questi 7 giorni ti abbiano aiutato a sentire i primi benefici per la tua schiena. 
          Per continuare il tuo percorso e sbloccare tutti gli esercizi, passa al piano completo.
        </p>
      </div>

      <div className="space-y-4">
        <a 
          href="https://www.schienalibera.com/ordine"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-full h-16 bg-teal-primary text-white font-bold rounded-2xl shadow-xl shadow-teal-primary/30 hover:bg-teal-accent transition-all active:scale-[0.98]"
        >
          Accedi al piano completo
        </a>
        <p className="text-sm text-slate-400">
          Hai già acquistato? Contatta il supporto.
        </p>
      </div>
    </motion.div>
  );
}
