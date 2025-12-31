export class DashboardResponseDto {
  statistics: {
    totalCalls: number;
    weeklyChange: number;
    averageDuration: number;
    overallMood: { positive: number; negative: number };
  };
  alerts: Array<{
    id: string;
    type: string;
    message: string;
    date: string;
    isRead: boolean;
  }>;
  recentCalls: Array<{
    id: string;
    date: string;
    summary: string | null;
    mood: string | null;
    moodScore: number | null;
  }>;
}

export class ReportResponseDto {
  period: 'week' | 'month';
  emotionTrend: Array<{ date: string; score: number; mood: string }>;
  healthKeywords: {
    pain: { count: number; trend: string };
    sleep: { status: string; mentions: number };
    meal: { status: string; mentions: number };
    medication: { status: string; mentions: number };
  };
  topTopics: Array<{ topic: string; count: number }>;
  weeklySummary: string;
  recommendations: string[];
}
