// 📱 Widget görünümü: telefonda ana ekrana eklenebilen, tek bakışta "bugün" sayfası (uygulama kabuğu olmadan).
// Ana ekran simgesine uzun basınca açılan kısayollar (manifest) da buraya ve hızlı ekleme sayfalarına gider.
import {ArrowRight} from 'lucide-react';
import {navigate} from '@/app/router';
import {Brand} from '@/components/Brand';
import {Button} from '@/components/ui';
import {ExamCard, QuickAddCard, StudyGoalCard, TodayPlanCard, TodayStats, useToday} from './cards';

export function WidgetPage() {
  const t = useToday();
  return (
    <div className="widget-page">
      <header className="row widget-head"><Brand /><span className="spacer" /><Button size="sm" variant="ghost" onClick={() => navigate('/')}>Uygulamayı aç <ArrowRight size={15} /></Button></header>
      <TodayStats t={t} />
      <div className="widget-grid">
        <StudyGoalCard t={t} />
        <QuickAddCard />
        <TodayPlanCard t={t} />
        <ExamCard t={t} />
      </div>
    </div>
  );
}
