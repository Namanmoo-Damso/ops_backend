"use client";

import { useCallback, useEffect, useState } from "react";
import { LocationMap, type WardLocation } from "../../components/LocationMap";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function LocationsPage() {
  const [locations, setLocations] = useState<WardLocation[]>([]);
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLocations = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/v1/admin/locations`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setLocations(data.locations || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();

    // Auto refresh every 30 seconds
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchLocations, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchLocations, autoRefresh]);

  const handleWardClick = useCallback((wardId: string) => {
    setSelectedWardId(wardId);
  }, []);

  const selectedLocation = selectedWardId
    ? locations.find((loc) => loc.wardId === selectedWardId)
    : null;

  const statusCounts = locations.reduce(
    (acc, loc) => {
      acc[loc.status] = (acc[loc.status] || 0) + 1;
      return acc;
    },
    { normal: 0, warning: 0, emergency: 0 } as Record<string, number>
  );

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "320px",
          backgroundColor: "#f9fafb",
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "white",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: "bold" }}>
            실시간 위치 현황
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#6b7280" }}>
            등록된 피보호자: {locations.length}명
          </p>
        </div>

        {/* Status Summary */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <StatusBadge
            label="정상"
            count={statusCounts.normal}
            color="#22c55e"
          />
          <StatusBadge
            label="주의"
            count={statusCounts.warning}
            color="#f59e0b"
          />
          <StatusBadge
            label="비상"
            count={statusCounts.emergency}
            color="#ef4444"
          />
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span style={{ fontSize: "14px" }}>자동 새로고침 (30초)</span>
          </label>
          <button
            onClick={fetchLocations}
            style={{
              padding: "6px 12px",
              fontSize: "13px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            새로고침
          </button>
        </div>

        {/* Ward List */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {isLoading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}>
              로딩 중...
            </div>
          ) : error ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#ef4444" }}>
              오류: {error}
            </div>
          ) : locations.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}>
              등록된 위치 정보가 없습니다.
            </div>
          ) : (
            locations.map((loc) => (
              <WardListItem
                key={loc.wardId}
                location={loc}
                isSelected={loc.wardId === selectedWardId}
                onClick={() => handleWardClick(loc.wardId)}
              />
            ))
          )}
        </div>

        {/* Selected Ward Detail */}
        {selectedLocation && (
          <div
            style={{
              padding: "16px",
              borderTop: "1px solid #e5e7eb",
              backgroundColor: "white",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: "16px" }}>
              {selectedLocation.wardName}
            </h3>
            <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: "1.8" }}>
              <div>
                <strong>위치:</strong> {selectedLocation.latitude.toFixed(6)},{" "}
                {selectedLocation.longitude.toFixed(6)}
              </div>
              {selectedLocation.accuracy && (
                <div>
                  <strong>정확도:</strong> {selectedLocation.accuracy.toFixed(1)}m
                </div>
              )}
              <div>
                <strong>마지막 업데이트:</strong>{" "}
                {new Date(selectedLocation.lastUpdated).toLocaleString("ko-KR")}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Map */}
      <main style={{ flex: 1, position: "relative" }}>
        <LocationMap
          locations={locations}
          onWardClick={handleWardClick}
          selectedWardId={selectedWardId || undefined}
        />
      </main>
    </div>
  );
}

function StatusBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        backgroundColor: color + "20",
        borderRadius: "16px",
      }}
    >
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      <span style={{ fontSize: "13px", color: "#374151" }}>
        {label}: {count}
      </span>
    </div>
  );
}

function WardListItem({
  location,
  isSelected,
  onClick,
}: {
  location: WardLocation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusColors: Record<string, string> = {
    normal: "#22c55e",
    warning: "#f59e0b",
    emergency: "#ef4444",
  };

  const timeAgo = getTimeAgo(new Date(location.lastUpdated));

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        border: "none",
        borderBottom: "1px solid #e5e7eb",
        backgroundColor: isSelected ? "#eff6ff" : "transparent",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          backgroundColor: statusColors[location.status],
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: "14px",
          flexShrink: 0,
        }}
      >
        {location.wardName.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: isSelected ? "bold" : "normal",
            fontSize: "14px",
            marginBottom: "2px",
          }}
        >
          {location.wardName}
        </div>
        <div style={{ fontSize: "12px", color: "#6b7280" }}>{timeAgo}</div>
      </div>
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: statusColors[location.status],
          flexShrink: 0,
        }}
      />
    </button>
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
