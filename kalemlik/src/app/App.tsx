import {lazy, Suspense, useEffect} from 'react';
import {match, navigate, useLocation} from './router';
import {sessionExpired, useSession} from './session';
import {Shell} from './Shell';
import {ConfirmHost, Toaster, toast} from '@/components/feedback';
import {ForgotPage, LoginPage, RegisterPage, ResetPage} from '@/features/auth/AuthPages';
import {NotebooksPage} from '@/features/notebooks/NotebooksPage';
import {SchedulePage} from '@/features/planner/SchedulePage';
import {TasksPage} from '@/features/planner/TasksPage';
import {CalendarPage} from '@/features/planner/CalendarPage';
import {FocusPage} from '@/features/focus/FocusPage';
import {SettingsPage} from '@/features/account/SettingsPage';
import {AccountPage} from '@/features/account/AccountPage';
import {PlanPage} from '@/features/account/PlanPage';
import {AdminPage} from '@/features/admin/AdminPage';
import {StudyPage} from '@/features/study/StudyPage';
import {DeckPage} from '@/features/study/DeckPage';
import {QuizPage} from '@/features/study/QuizPage';
import {PlanPage as StudyPlanPage} from '@/features/study/PlanPage';
import {GenerateHost} from '@/features/study/GenerateDialog';
import {AiPage} from '@/features/ai/AiPage';
import {SearchPage} from '@/features/search/SearchPage';
import {GradesPage} from '@/features/grades/GradesPage';
import {startBrowserNotifier} from '@/features/notify/notifications';
import {RecordingDetail, RecordingsPage} from '@/features/recordings/RecordingsPage';
import {JournalPage} from '@/features/journal/JournalPage';
import {WidgetPage} from '@/features/home/WidgetPage';
import {SharesPage} from '@/features/share/SharesPage';
import {PublicSharePage} from '@/features/share/PublicSharePage';
import {onStoreEvent, useList} from '@/lib/store';
import {useSettings} from '@/lib/settings';
import {setCustomFonts} from '@/features/fonts/fonts';
import {LogoMark} from '@/components/Brand';
import {confirmDialog} from '@/components/feedback';

const EditorPage = lazy(() => import('@/features/editor/EditorPage'));
const PUBLIC = ['/giris', '/kayit', '/sifremi-unuttum', '/sifre-sifirla'];

function useTheme() {
  const settings = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      root.style.setProperty('--accent', settings.accent);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.accent]);
}

function useStoreEvents() {
  useEffect(() => onStoreEvent(e => {
    if (e.type === 'toast') toast(e.message, e.kind);
    if (e.type === 'unauthorized') { sessionExpired(); toast('Oturumun sona erdi. Değişikliklerin bu cihazda saklı; tekrar giriş yapınca kaydedilecek.', 'info'); }
    if (e.type === 'notebook-limit') {
      void confirmDialog({title: 'Defter sınırına ulaşıldı', message: `${e.message} Defterin silinmedi; Çöp Kutusu'nda bekliyor.`, confirmLabel: 'Planları gör'}).then(ok => { if (ok) navigate('/plan'); });
    }
  }), []);
}

function CustomFonts() {
  const fonts = useList('font');
  useEffect(() => setCustomFonts(fonts), [fonts]);
  return null;
}

function Splash() {
  return <div className="splash"><LogoMark size={56} /><span className="spinner" /></div>;
}

function SignedIn() {
  const {path} = useLocation();
  useTheme();
  const {query} = useLocation();
  useEffect(() => startBrowserNotifier(), []);
  const editor = match('/defter/:id', path);
  if (editor) return <Suspense fallback={<Splash />}><CustomFonts /><EditorPage id={editor.id} /><GenerateHost /></Suspense>;
  if (path === '/widget') return <><CustomFonts /><WidgetPage /></>;
  let page;
  const recording = match('/kayitlar/:id', path);
  const deck = match('/calisma/deste/:id', path), quiz = match('/calisma/quiz/:id', path), plan = match('/calisma/plan/:id', path);
  if (recording) page = <RecordingDetail key={recording.id} id={recording.id} />;
  else if (deck) page = <DeckPage key={deck.id} id={deck.id} />;
  else if (quiz) page = <QuizPage key={quiz.id} id={quiz.id} />;
  else if (plan) page = <StudyPlanPage key={plan.id} id={plan.id} advice={query.get('oneri') || undefined} />;
  else switch (path) {
    case '/': case '/defterler': page = <NotebooksPage mode="all" />; break;
    case '/favoriler': page = <NotebooksPage mode="favorites" />; break;
    case '/cop': page = <NotebooksPage mode="trash" />; break;
    case '/program': page = <SchedulePage />; break;
    case '/gorevler': page = <TasksPage />; break;
    case '/takvim': page = <CalendarPage />; break;
    case '/odak': page = <FocusPage />; break;
    case '/ayarlar': page = <SettingsPage />; break;
    case '/hesap': page = <AccountPage />; break;
    case '/plan': page = <PlanPage />; break;
    case '/yonetim': page = <AdminPage />; break;
    case '/calisma': page = <StudyPage />; break;
    case '/ai': page = <AiPage />; break;
    case '/ara': page = <SearchPage />; break;
    case '/notlarim': page = <GradesPage />; break;
    case '/kayitlar': page = <RecordingsPage />; break;
    case '/gunluk': page = <JournalPage />; break;
    case '/paylasimlar': page = <SharesPage />; break;
    default: page = <NotebooksPage mode="all" />;
  }
  return <Shell><CustomFonts />{page}<GenerateHost /></Shell>;
}

export function App() {
  const {status} = useSession();
  const {path} = useLocation();
  useStoreEvents();
  useEffect(() => {
    if (status === 'signed-out' && !PUBLIC.includes(path) && !path.startsWith('/share/note/')) navigate('/giris', {replace: true});
    if (status === 'signed-in' && PUBLIC.includes(path)) navigate('/defterler', {replace: true});
  }, [status, path]);
  let content;
  const shared = match('/share/note/:id', path);
  if (shared && status !== 'loading') content = <PublicSharePage id={shared.id} signedIn={status === 'signed-in'} />;
  else if (status === 'loading') content = <Splash />;
  else if (status === 'signed-out') {
    content = path === '/kayit' ? <RegisterPage /> : path === '/sifremi-unuttum' ? <ForgotPage /> : path === '/sifre-sifirla' ? <ResetPage /> : <LoginPage />;
  } else content = <SignedIn />;
  return <>{content}<Toaster /><ConfirmHost /></>;
}
