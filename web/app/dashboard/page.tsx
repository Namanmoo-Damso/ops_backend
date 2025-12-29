"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type DashboardStats = {
  overview: {
    totalWards: number;
    activeWards: number;
    totalGuardians: number;
    totalOrganizations: number;
    totalCalls: number;
    totalCallMinutes: number;
  };
  todayStats: {
    callsToday: number;
    avgDurationMinutes: number;
    emergenciesToday: number;
    newRegistrations: number;
  };
  weeklyTrend: Array<{
    date: string;
    dayLabel: string;
    calls: number;
    emergencies: number;
  }>;
  moodDistribution: {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
  };
  healthAlerts: {
    warning: number;
    info: number;
    unread: number;
  };
  topKeywords: Array<{
    keyword: string;
    count: number;
  }>;
  organizationStats: Array<{
    id: string;
    name: string;
    wardCount: number;
    callCount: number;
  }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
    details: Record<string, unknown>;
  }>;
  fetchedAt: string;
};

type RealtimeStats = {
  activeCalls: number;
  onlineWards: number;
  pendingEmergencies: number;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
    details: Record<string, unknown>;
  }>;
  fetchedAt: string;
};

const MOOD_COLORS = {
  positive: "#22c55e",
  neutral: "#f59e0b",
  negative: "#ef4444",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/v1/admin/dashboard/stats`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRealtime = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/v1/admin/dashboard/realtime`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setRealtime(data);
    } catch {
      // Silently fail for realtime
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchRealtime();

    let statsInterval: NodeJS.Timeout | null = null;
    let realtimeInterval: NodeJS.Timeout | null = null;

    if (autoRefresh) {
      statsInterval = setInterval(fetchStats, 60000); // 1분마다 전체 통계
      realtimeInterval = setInterval(fetchRealtime, 10000); // 10초마다 실시간
    }

    return () => {
      if (statsInterval) clearInterval(statsInterval);
      if (realtimeInterval) clearInterval(realtimeInterval);
    };
  }, [fetchStats, fetchRealtime, autoRefresh]);

  if (isLoading) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}>
        대시보드 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "#ef4444" }}>
        오류: {error}
        <button
          onClick={fetchStats}
          style={{
            marginLeft: "12px",
            padding: "6px 12px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          재시도
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const moodData = [
    { name: "긍정", value: stats.moodDistribution.positive, color: MOOD_COLORS.positive },
    { name: "중립", value: stats.moodDistribution.neutral, color: MOOD_COLORS.neutral },
    { name: "부정", value: stats.moodDistribution.negative, color: MOOD_COLORS.negative },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f3f4f6",
        fontFamily: "sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "bold" }}>
            관제 대시보드
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
            마지막 업데이트: {new Date(stats.fetchedAt).toLocaleString("ko-KR")}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span style={{ fontSize: "14px" }}>자동 새로고침</span>
          </label>
          <button
            onClick={() => {
              fetchStats();
              fetchRealtime();
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            새로고침
          </button>
        </div>
      </header>

      <main style={{ padding: "24px", maxWidth: "1600px", margin: "0 auto" }}>
        {/* Realtime Stats Banner */}
        {realtime && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <RealtimeCard
              label="진행 중인 통화"
              value={realtime.activeCalls}
              color="#3b82f6"
              icon="📞"
            />
            <RealtimeCard
              label="온라인 피보호자"
              value={realtime.onlineWards}
              color="#22c55e"
              icon="🟢"
            />
            <RealtimeCard
              label="대기 중인 비상상황"
              value={realtime.pendingEmergencies}
              color={realtime.pendingEmergencies > 0 ? "#ef4444" : "#6b7280"}
              icon="🚨"
              highlight={realtime.pendingEmergencies > 0}
            />
          </div>
        )}

        {/* Overview Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <StatCard label="전체 피보호자" value={stats.overview.totalWards} />
          <StatCard
            label="활성 피보호자"
            value={stats.overview.activeWards}
            subtext={`${Math.round((stats.overview.activeWards / Math.max(stats.overview.totalWards, 1)) * 100)}%`}
          />
          <StatCard label="전체 보호자" value={stats.overview.totalGuardians} />
          <StatCard label="등록 기관" value={stats.overview.totalOrganizations} />
          <StatCard
            label="총 통화 수"
            value={stats.overview.totalCalls.toLocaleString()}
          />
          <StatCard
            label="총 통화 시간"
            value={`${Math.round(stats.overview.totalCallMinutes / 60)}시간`}
            subtext={`${stats.overview.totalCallMinutes.toLocaleString()}분`}
          />
        </div>

        {/* Today Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <TodayCard
            label="오늘 통화"
            value={stats.todayStats.callsToday}
            icon="📞"
          />
          <TodayCard
            label="평균 통화시간"
            value={`${stats.todayStats.avgDurationMinutes.toFixed(1)}분`}
            icon="⏱️"
          />
          <TodayCard
            label="오늘 비상상황"
            value={stats.todayStats.emergenciesToday}
            icon="🚨"
            highlight={stats.todayStats.emergenciesToday > 0}
          />
          <TodayCard
            label="신규 등록"
            value={stats.todayStats.newRegistrations}
            icon="👤"
          />
        </div>

        {/* Charts Row 1 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "24px",
            marginBottom: "24px",
          }}
        >
          {/* Weekly Trend Chart */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: "bold" }}>
              주간 추이
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="calls"
                  name="통화"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6" }}
                />
                <Line
                  type="monotone"
                  dataKey="emergencies"
                  name="비상상황"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: "#ef4444" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Mood Distribution */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: "bold" }}>
              감정 분포 (총 {stats.moodDistribution.total}건)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={moodData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}%`}
                  labelLine={false}
                >
                  {moodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "24px",
            marginBottom: "24px",
          }}
        >
          {/* Health Alerts */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: "bold" }}>
              건강 알림
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <AlertRow
                label="경고 알림"
                value={stats.healthAlerts.warning}
                color="#f59e0b"
              />
              <AlertRow
                label="정보 알림"
                value={stats.healthAlerts.info}
                color="#3b82f6"
              />
              <AlertRow
                label="미확인 알림"
                value={stats.healthAlerts.unread}
                color="#ef4444"
                highlight
              />
            </div>
          </div>

          {/* Top Keywords */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: "bold" }}>
              주요 건강 키워드
            </h3>
            {stats.topKeywords.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={stats.topKeywords.slice(0, 5)}
                  layout="vertical"
                  margin={{ left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis type="category" dataKey="keyword" fontSize={12} width={60} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: "200px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                }}
              >
                키워드 데이터 없음
              </div>
            )}
          </div>

          {/* Organization Stats */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: "bold" }}>
              기관별 현황
            </h3>
            {stats.organizationStats.length > 0 ? (
              <div style={{ maxHeight: "200px", overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "8px 4px", color: "#6b7280" }}>기관</th>
                      <th style={{ textAlign: "right", padding: "8px 4px", color: "#6b7280" }}>피보호자</th>
                      <th style={{ textAlign: "right", padding: "8px 4px", color: "#6b7280" }}>통화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.organizationStats.map((org) => (
                      <tr key={org.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 4px" }}>{org.name}</td>
                        <td style={{ textAlign: "right", padding: "8px 4px" }}>{org.wardCount}</td>
                        <td style={{ textAlign: "right", padding: "8px 4px" }}>{org.callCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  height: "200px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                }}
              >
                등록된 기관 없음
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: "bold" }}>
            최근 활동
          </h3>
          {stats.recentActivity.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {stats.recentActivity.slice(0, 10).map((activity, index) => (
                <ActivityItem key={index} activity={activity} />
              ))}
            </div>
          ) : (
            <div style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}>
              최근 활동 없음
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function RealtimeCard({
  label,
  value,
  color,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: highlight ? "#fef2f2" : "white",
        borderRadius: "12px",
        padding: "16px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        border: highlight ? "2px solid #ef4444" : "1px solid #e5e7eb",
        animation: highlight ? "pulse 2s infinite" : "none",
      }}
    >
      <span style={{ fontSize: "28px" }}>{icon}</span>
      <div>
        <div style={{ fontSize: "24px", fontWeight: "bold", color }}>{value}</div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>{label}</div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "24px", fontWeight: "bold", color: "#1f2937" }}>
        {value}
      </div>
      <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
        {label}
      </div>
      {subtext && (
        <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

function TodayCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: highlight ? "#fef2f2" : "white",
        borderRadius: "12px",
        padding: "16px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        border: highlight ? "1px solid #fca5a5" : "none",
      }}
    >
      <span style={{ fontSize: "24px" }}>{icon}</span>
      <div>
        <div
          style={{
            fontSize: "20px",
            fontWeight: "bold",
            color: highlight ? "#dc2626" : "#1f2937",
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>{label}</div>
      </div>
    </div>
  );
}

function AlertRow({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        backgroundColor: highlight ? "#fef2f2" : "#f9fafb",
        borderRadius: "8px",
        border: highlight ? "1px solid #fca5a5" : "none",
      }}
    >
      <span style={{ fontSize: "14px", color: "#374151" }}>{label}</span>
      <span
        style={{
          fontSize: "18px",
          fontWeight: "bold",
          color,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ActivityItem({
  activity,
}: {
  activity: {
    type: string;
    description: string;
    timestamp: string;
    details: Record<string, unknown>;
  };
}) {
  const typeIcons: Record<string, string> = {
    call_started: "📞",
    call_ended: "📴",
    emergency: "🚨",
  };

  const typeColors: Record<string, string> = {
    call_started: "#3b82f6",
    call_ended: "#6b7280",
    emergency: "#ef4444",
  };

  const timeAgo = getTimeAgo(new Date(activity.timestamp));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        backgroundColor: activity.type === "emergency" ? "#fef2f2" : "#f9fafb",
        borderRadius: "8px",
      }}
    >
      <span style={{ fontSize: "20px" }}>{typeIcons[activity.type] || "📌"}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "14px",
            color: typeColors[activity.type] || "#374151",
          }}
        >
          {activity.description}
        </div>
      </div>
      <div style={{ fontSize: "12px", color: "#9ca3af" }}>{timeAgo}</div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR");
}
