"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackRefContext,
  VideoTrack,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track, VideoQuality } from "livekit-client";
import SidebarLayout from "../components/SidebarLayout";
import styles from "./page.module.css";

type Role = "host" | "viewer" | "observer";

type MockParticipant = {
  id: string;
  name: string;
  status: string;
  speaking?: boolean;
  muted?: boolean;
  cameraOff?: boolean;
  you?: boolean;
  online?: boolean;
  lastSeen?: string;
};
type RosterMember = {
  identity: string;
  displayName?: string | null;
  joinedAt?: string | null;
};
type LiveTileData = {
  key: string;
  ref: any;
  displayName: string;
};
type GridSlot =
  | { type: "live"; key: string; tile: LiveTileData }
  | { type: "empty"; key: string };

const getInitials = (name: string) => {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const IDENTITY_STORAGE_KEY = "damso.identity";
const NAME_STORAGE_KEY = "damso.name";
const KOREAN_ADJECTIVES = [
  "푸른",
  "맑은",
  "따뜻한",
  "고요한",
  "빛나는",
  "잔잔한",
  "달콤한",
  "시원한",
  "반짝이는",
  "싱그러운",
  "넓은",
  "단단한",
  "포근한",
  "차분한",
  "선명한",
  "부드러운",
  "은은한",
  "향기로운",
  "높은",
  "깊은",
];
const KOREAN_NOUNS = [
  "바다",
  "고래",
  "별",
  "달",
  "노을",
  "숲",
  "바람",
  "강",
  "파도",
  "하늘",
  "산",
  "구름",
  "달빛",
  "봄비",
  "모래",
  "정원",
  "호수",
  "빛",
  "새벽",
  "낮별",
];

const generateIdentity = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `host-${crypto.randomUUID()}`;
  }
  return `host-${Date.now()}`;
};

const IconMic = ({ muted }: { muted?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M5 11a7 7 0 0 0 14 0M12 18v3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    {muted ? (
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ) : null}
  </svg>
);

const IconCam = ({ off }: { off?: boolean }) => (
  <svg width="18" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M16 10l4-3v10l-4-3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {off ? (
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ) : null}
  </svg>
);

const IconShare = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 4v10M8 8l4-4 4 4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const IconChat = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 4v-4H7a3 3 0 0 1-3-3V6Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const IconPeople = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8-1a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 16 11Zm-9 9a4 4 0 0 1 8 0M14 20a4 4 0 0 1 6 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const IconApps = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);

const IconEnd = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12a8 8 0 0 1 16 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M7 12v4M17 12v4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const IconUser = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M4 20a8 8 0 0 1 16 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const TileSignal = () => (
  <div className={styles.signalBars}>
    <span className={styles.signalBar} />
    <span className={styles.signalBar} />
    <span className={styles.signalBar} />
  </div>
);

const EmptyTile = () => (
  <div className={`${styles.tile} ${styles.tileEmpty}`}>
    <div className={styles.emptyContent}>
      <IconUser />
      <span>Empty</span>
    </div>
  </div>
);

const JoinBanner = ({
  onJoin,
  busy,
  error,
}: {
  onJoin: () => void;
  busy: boolean;
  error?: string | null;
}) => (
  <div className={styles.joinBanner}>
    <span>Ready to connect host session</span>
    <button className={styles.joinButton} onClick={onJoin} disabled={busy}>
      {busy ? "Joining..." : "Join"}
    </button>
    {error ? <span className={styles.joinError}>{error}</span> : null}
  </div>
);

const TileActionButton = ({
  onClick,
  disabled,
  off,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  off: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    className={`${styles.tileAction} ${off ? styles.tileActionOff : ""}`}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    disabled={disabled}
    title={title}
    type="button"
  >
    {children}
  </button>
);

const LiveTile = ({
  trackRef,
  displayName,
  focused,
  onFocus,
  onToggleAudio,
  onToggleVideo,
  audioOff,
  videoOff,
  canControl,
}: {
  trackRef: any;
  displayName: string;
  focused: boolean;
  onFocus: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  audioOff: boolean;
  videoOff: boolean;
  canControl: boolean;
}) => {
  const participant = trackRef.participant;
  const name = displayName;
  const speaking = participant.isSpeaking;
  const micMuted = audioOff;
  const cameraOff = videoOff;

  return (
    <div
      className={`${styles.tile} ${focused ? styles.focused : ""} ${
        speaking ? styles.speaking : ""
      }`}
      onClick={onFocus}
    >
      <div className={styles.tileMedia}>
        {cameraOff ? (
          <div className={styles.avatarFallback}>{getInitials(name)}</div>
        ) : (
          <TrackRefContext.Provider value={trackRef}>
            <VideoTrack className={styles.video} />
          </TrackRefContext.Provider>
        )}
        <div className={styles.tileOverlay} />
        <div className={styles.tileActions}>
          <TileActionButton
            onClick={onToggleAudio}
            disabled={!canControl}
            off={micMuted}
            title={micMuted ? "Unmute" : "Mute"}
          >
            <IconMic muted={micMuted} />
          </TileActionButton>
          <TileActionButton
            onClick={onToggleVideo}
            disabled={!canControl}
            off={cameraOff}
            title={cameraOff ? "Start video" : "Stop video"}
          >
            <IconCam off={cameraOff} />
          </TileActionButton>
        </div>
        <div className={styles.tileFooter}>
          {speaking ? <span className={styles.tileBadge}>Speaking</span> : null}
          <span className={styles.tileName}>{name}</span>
          <span className={styles.tileMeta}>
            <TileSignal />
            Live
          </span>
        </div>
      </div>
    </div>
  );
};

const RoomShell = ({
  focusedId,
  onFocus,
  showJoin,
  onJoin,
  joinBusy,
  error,
  connected,
  onLeave,
  onInvite,
  inviteBusy,
  inviteStatus,
  roomName,
  apiBase,
  selfIdentity,
  gridSize,
}: {
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  showJoin: boolean;
  onJoin: () => void;
  joinBusy: boolean;
  error?: string | null;
  connected: boolean;
  onLeave: () => void;
  onInvite: (identity: string) => void;
  inviteBusy: boolean;
  inviteStatus?: string | null;
  roomName: string;
  apiBase: string;
  selfIdentity: string;
  gridSize: number;
}) => {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  const room = useRoomContext();
  const canControl = connected && !!localParticipant;
  const [audioOverrides, setAudioOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [videoOverrides, setVideoOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [ending, setEnding] = useState(false);
  const [knownParticipants, setKnownParticipants] = useState<
    Record<string, MockParticipant>
  >({});
  const [displayNameCache, setDisplayNameCache] = useState<
    Record<string, string>
  >({});
  const [selectedParticipantId, setSelectedParticipantId] = useState<
    string | null
  >(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!connected) {
      setAudioOverrides({});
      setVideoOverrides({});
    }
  }, [connected]);

  useEffect(() => {
    if (!room) return;
    const handleDisconnected = () => {
      setToastMessage("연결이 종료되었습니다");
      setToastKey((prev) => prev + 1);
      setEnding(true);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 2000);
      if (endTimerRef.current) {
        clearTimeout(endTimerRef.current);
      }
      endTimerRef.current = setTimeout(() => {
        setEnding(false);
        onLeave();
      }, 1400);
    };
    room.on(RoomEvent.Disconnected, handleDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnected);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (endTimerRef.current) {
        clearTimeout(endTimerRef.current);
      }
    };
  }, [room, onLeave]);

  useEffect(() => {
    if (!roomName) return;
    const base = apiBase || "";
    let cancelled = false;
    const fetchRoster = async () => {
      try {
        const res = await fetch(
          `${base}/v1/rooms/${encodeURIComponent(roomName)}/members`,
        );
        if (!res.ok) {
          throw new Error(`Roster fetch failed (${res.status})`);
        }
        const data = await res.json();
        const members: RosterMember[] = Array.isArray(data?.members)
          ? data.members
          : [];
        if (cancelled) return;

        setDisplayNameCache((prev) => {
          const next = { ...prev };
          members.forEach((member) => {
            const id = member.identity;
            if (!id || next[id]) return;
            next[id] = resolveRosterName(member);
          });
          return next;
        });

        const now = new Date().toISOString();
        setKnownParticipants((prev) => {
          const next = { ...prev };
          members.forEach((member) => {
            const id = member.identity;
            if (!id) return;
            const existing = next[id];
            const resolvedName = resolveRosterName(member);
            const existingName = existing?.name;
            const name =
              existingName && !isGenericName(existingName)
                ? existingName
                : resolvedName;
            const online = existing?.online ?? false;
            next[id] = {
              id,
              name,
              status: online ? existing?.status ?? "" : "Offline",
              speaking: online ? existing?.speaking ?? false : false,
              muted: existing?.muted ?? true,
              cameraOff: existing?.cameraOff ?? true,
              you: id === selfIdentity ? true : existing?.you,
              online,
              lastSeen: existing?.lastSeen ?? member.joinedAt ?? now,
            };
          });
          return next;
        });
      } catch (err) {
        console.error(err);
      }
    };
    fetchRoster();
    return () => {
      cancelled = true;
    };
  }, [apiBase, roomName, selfIdentity]);

  const updateOverride = (
    setter: Dispatch<SetStateAction<Record<string, boolean>>>,
    identity: string,
    disabled: boolean,
  ) => {
    setter((prev) => {
      const next = { ...prev };
      if (disabled) {
        next[identity] = true;
      } else {
        delete next[identity];
      }
      return next;
    });
  };

  const getParticipantId = (participant: any) =>
    participant.identity || participant.sid || "unknown";

  const getBaseName = (participant: any) =>
    (participant.name || participant.identity || "User").trim();

  const isGenericName = (name: string) => {
    const normalized = name.toLowerCase();
    return (
      normalized === "ios user" ||
      normalized === "ios" ||
      normalized === "user" ||
      normalized === "viewer" ||
      normalized === "participant" ||
      normalized === "unknown" ||
      normalized.startsWith("ios-") ||
      normalized.startsWith("host-")
    );
  };

  const hashIdentity = (value: string) => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  };

  const aliasFromIdentity = (identity: string) => {
    const hash = hashIdentity(identity);
    const adjective = KOREAN_ADJECTIVES[hash % KOREAN_ADJECTIVES.length];
    const noun =
      KOREAN_NOUNS[(hash >> 8) % KOREAN_NOUNS.length] ?? KOREAN_NOUNS[0];
    const suffix = (hash % 90) + 10;
    return `${adjective} ${noun} ${suffix}`;
  };

  const resolveRosterName = (member: RosterMember) => {
    const raw = (member.displayName || member.identity || "User").trim();
    return isGenericName(raw) ? aliasFromIdentity(member.identity) : raw;
  };

  const isAudioOff = (participant: any) => {
    if (participant.isLocal) {
      return !isMicrophoneEnabled;
    }
    const identity = getParticipantId(participant);
    if (!focusedId || identity !== focusedId) {
      return true;
    }
    const publishing = participant.isMicrophoneEnabled !== false;
    return (audioOverrides[identity] ?? false) || !publishing;
  };

  const isVideoOff = (participant: any) => {
    if (participant.isLocal) {
      return !isCameraEnabled;
    }
    const identity = getParticipantId(participant);
    const publishing = participant.isCameraEnabled !== false;
    return (videoOverrides[identity] ?? false) || !publishing;
  };

  const setRemoteSubscription = (
    publications: Map<string, any>,
    enabled: boolean,
  ) => {
    publications.forEach((publication) => {
      if (publication?.setSubscribed) {
        publication.setSubscribed(enabled);
      }
    });
  };

  const setRemoteVideoQuality = (participant: any, quality: VideoQuality) => {
    const publications = participant?.videoTrackPublications;
    if (!publications) return;
    publications.forEach((publication: any) => {
      if (typeof publication?.setVideoQuality === "function") {
        publication.setVideoQuality(quality);
      } else if (typeof publication?.setPreferredLayer === "function") {
        publication.setPreferredLayer(quality);
      }
    });
  };

  const setRemoteTrackPriority = (
    participant: any,
    priority: "low" | "standard" | "high",
  ) => {
    const publications = participant?.videoTrackPublications;
    if (!publications) return;
    const priorityEnum = (Track as any).Priority;
    if (!priorityEnum) return;
    const key = priority.toUpperCase();
    const value = priorityEnum[key] ?? priorityEnum.STANDARD;
    if (!value) return;
    publications.forEach((publication: any) => {
      if (typeof publication?.setPriority === "function") {
        publication.setPriority(value);
      }
    });
  };

  const toggleMicrophone = async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleCamera = async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (err) {
      console.error(err);
    }
  };

  const leaveRoom = () => {
    room?.disconnect();
    onLeave();
  };

  const toggleParticipantAudio = (participant: any) => {
    if (!participant || !canControl) return;
    if (participant.isLocal) {
      void toggleMicrophone();
      return;
    }
    const identity = getParticipantId(participant);
    const nextDisabled = !(audioOverrides[identity] ?? false);
    updateOverride(setAudioOverrides, identity, nextDisabled);
  };

  const toggleParticipantVideo = (participant: any) => {
    if (!participant || !canControl) return;
    if (participant.isLocal) {
      void toggleCamera();
      return;
    }
    const identity = getParticipantId(participant);
    const nextDisabled = !(videoOverrides[identity] ?? false);
    setRemoteSubscription(participant.videoTrackPublications, !nextDisabled);
    updateOverride(setVideoOverrides, identity, nextDisabled);
  };

  const remoteParticipants = room
    ? Array.from(room.remoteParticipants.values())
    : [];
  const allParticipants = localParticipant
    ? [localParticipant, ...remoteParticipants]
    : remoteParticipants;
  const allAudioOff =
    allParticipants.length > 0 && allParticipants.every((p) => isAudioOff(p));
  const allVideoOff =
    allParticipants.length > 0 && allParticipants.every((p) => isVideoOff(p));

  const toggleAllAudio = () => {
    if (!canControl) return;
    const enable = allAudioOff;
    if (localParticipant) {
      void localParticipant.setMicrophoneEnabled(enable);
    }
    remoteParticipants.forEach((participant) => {
      updateOverride(setAudioOverrides, getParticipantId(participant), !enable);
    });
  };

  const toggleAllVideo = () => {
    if (!canControl) return;
    const enable = allVideoOff;
    if (localParticipant) {
      void localParticipant.setCameraEnabled(enable);
    }
    remoteParticipants.forEach((participant) => {
      setRemoteSubscription(participant.videoTrackPublications, enable);
      updateOverride(setVideoOverrides, getParticipantId(participant), !enable);
    });
  };

  const remoteParticipantKey = remoteParticipants
    .map((participant) => getParticipantId(participant))
    .join("|");

  useEffect(() => {
    if (!room) return;
    remoteParticipants.forEach((participant) => {
      const identity = getParticipantId(participant);
      const shouldSubscribe =
        !!focusedId && identity === focusedId && !(audioOverrides[identity] ?? false);
      setRemoteSubscription(participant.audioTrackPublications, shouldSubscribe);
    });
  }, [room, focusedId, audioOverrides, remoteParticipantKey]);

  useEffect(() => {
    if (!room) return;
    remoteParticipants.forEach((participant) => {
      const identity = getParticipantId(participant);
      if (focusedId) {
        const focused = identity === focusedId;
        setRemoteVideoQuality(
          participant,
          focused ? VideoQuality.HIGH : VideoQuality.LOW,
        );
        setRemoteTrackPriority(participant, focused ? "high" : "low");
        if (focused) {
          setRemoteSubscription(participant.videoTrackPublications, true);
        }
      } else {
        setRemoteVideoQuality(participant, VideoQuality.MEDIUM);
        setRemoteTrackPriority(participant, "standard");
      }
    });
  }, [room, focusedId, remoteParticipantKey]);

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    tracks.forEach((trackRef: any) => {
      const baseName = getBaseName(trackRef.participant);
      counts.set(baseName, (counts.get(baseName) ?? 0) + 1);
    });
    return counts;
  }, [tracks]);

  const buildDisplayName = (participant: any) => {
    const baseName = getBaseName(participant);
    const id = getParticipantId(participant);
    const count = nameCounts.get(baseName) ?? 0;
    const needsAlias = count > 1 || isGenericName(baseName);
    return needsAlias ? aliasFromIdentity(id) : baseName;
  };

  const participantLabelMap = useMemo(() => {
    const map = { ...displayNameCache };
    tracks.forEach((trackRef: any) => {
      const participant = trackRef.participant;
      const id = getParticipantId(participant);
      if (!map[id]) {
        map[id] = buildDisplayName(participant);
      }
    });
    return map;
  }, [tracks, displayNameCache, nameCounts]);

  useEffect(() => {
    const updates: Record<string, string> = {};
    tracks.forEach((trackRef: any) => {
      const participant = trackRef.participant;
      const id = getParticipantId(participant);
      if (!displayNameCache[id]) {
        updates[id] = buildDisplayName(participant);
      }
    });
    if (Object.keys(updates).length > 0) {
      setDisplayNameCache((prev) => ({ ...prev, ...updates }));
    }
  }, [tracks, displayNameCache, nameCounts]);

  const resolveDisplayName = (participant: any) => {
    const id = getParticipantId(participant);
    return participantLabelMap[id] || getBaseName(participant);
  };

  const participantKey = allParticipants
    .map((participant) => getParticipantId(participant))
    .join("|");

  useEffect(() => {
    if (!room) return;
    const currentIds = new Set<string>();
    const now = new Date().toISOString();
    const updates: Record<string, MockParticipant> = {};

    allParticipants.forEach((participant) => {
      const id = getParticipantId(participant);
      currentIds.add(id);
      updates[id] = {
        id,
        name: resolveDisplayName(participant),
        status: participant.isSpeaking ? "Speaking..." : "",
        speaking: participant.isSpeaking,
        muted: isAudioOff(participant),
        cameraOff: isVideoOff(participant),
        you: participant.isLocal,
        online: true,
        lastSeen: now,
      };
    });

    setKnownParticipants((prev) => {
      const next = { ...prev };
      Object.entries(updates).forEach(([id, value]) => {
        next[id] = { ...next[id], ...value };
      });
      Object.keys(next).forEach((id) => {
        if (!currentIds.has(id)) {
          next[id] = {
            ...next[id],
            online: false,
            speaking: false,
            status: "Offline",
          };
        }
      });
      return next;
    });
  }, [
    room,
    participantKey,
    participantLabelMap,
    audioOverrides,
    videoOverrides,
    isMicrophoneEnabled,
    isCameraEnabled,
  ]);

  const liveTiles: LiveTileData[] = tracks.map((trackRef: any) => ({
    key: getParticipantId(trackRef.participant),
    ref: trackRef,
    displayName: resolveDisplayName(trackRef.participant),
  }));
  const focusedLiveTile = focusedId
    ? liveTiles.find((tile) => tile.key === focusedId)
    : undefined;
  const showOnlyFocused = !!focusedLiveTile;
  const visibleLiveTiles =
    showOnlyFocused && focusedLiveTile ? [focusedLiveTile] : liveTiles;

  const totalSlots = gridSize * gridSize;
  const gridSlots: GridSlot[] = useMemo(() => {
    if (showOnlyFocused) {
      return visibleLiveTiles.map((tile) => ({
        type: "live" as const,
        key: `live-${tile.key}`,
        tile,
      }));
    }
    const slots: GridSlot[] = [];
    for (let index = 0; index < totalSlots; index += 1) {
      const tile = visibleLiveTiles[index];
      if (tile) {
        slots.push({ type: "live", key: `live-${tile.key}`, tile });
      } else {
        slots.push({ type: "empty", key: `empty-${index}` });
      }
    }
    return slots;
  }, [showOnlyFocused, visibleLiveTiles, totalSlots]);

  const sidebarList = useMemo(() => {
    const list = Object.values(knownParticipants).filter(
      (participant) => {
        // Hide self if offline
        if (participant.you && participant.online === false) return false;
        return true;
      },
    );
    list.sort((a, b) => {
      const onlineDiff = Number(!!b.online) - Number(!!a.online);
      if (onlineDiff !== 0) return onlineDiff;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [knownParticipants]);

  useEffect(() => {
    if (!selectedParticipantId) return;
    const selected = knownParticipants[selectedParticipantId];
    if (!selected || selected.you) {
      setSelectedParticipantId(null);
    }
  }, [knownParticipants, selectedParticipantId]);

  const selectedParticipant = selectedParticipantId
    ? knownParticipants[selectedParticipantId]
    : null;
  const isSelectedOnline = selectedParticipant?.online === true;

  return (
    <div className={styles.content}>
      <div className={`${styles.stage} ${ending ? styles.stageEnding : ""}`}>
        {showJoin ? (
          <JoinBanner onJoin={onJoin} busy={joinBusy} error={error} />
        ) : null}
        {toastMessage ? (
          <div key={toastKey} className={styles.toast}>
            {toastMessage}
          </div>
        ) : null}
        <RoomAudioRenderer />
        <div
          className={`${styles.grid} ${showOnlyFocused ? styles.gridFocused : ""}`}
          style={{
            gridTemplateColumns: showOnlyFocused ? "1fr" : `repeat(${gridSize}, minmax(0, 1fr))`,
            gridTemplateRows: showOnlyFocused ? "1fr" : `repeat(${gridSize}, minmax(0, 1fr))`,
          }}
        >
          {gridSlots.map((slot) =>
            slot.type === "live" ? (
              <LiveTile
                key={slot.key}
                trackRef={slot.tile.ref}
                displayName={slot.tile.displayName}
                focused={focusedId === slot.tile.key}
                onFocus={() =>
                  onFocus(focusedId === slot.tile.key ? null : slot.tile.key)
                }
                onToggleAudio={() =>
                  toggleParticipantAudio(slot.tile.ref.participant)
                }
                onToggleVideo={() =>
                  toggleParticipantVideo(slot.tile.ref.participant)
                }
                audioOff={isAudioOff(slot.tile.ref.participant)}
                videoOff={isVideoOff(slot.tile.ref.participant)}
                canControl={canControl}
              />
            ) : (
              <EmptyTile key={slot.key} />
            ),
          )}
        </div>
        <div className={styles.controlBar}>
          <div className={styles.controlGroup}>
            <button
              className={`${styles.controlButton} ${
                isMicrophoneEnabled ? styles.active : ""
              }`}
              onClick={toggleMicrophone}
              disabled={!canControl}
            >
              <IconMic muted={!isMicrophoneEnabled} />
            </button>
            <button
              className={`${styles.controlButton} ${
                isCameraEnabled ? styles.active : ""
              }`}
              onClick={toggleCamera}
              disabled={!canControl}
            >
              <IconCam off={!isCameraEnabled} />
            </button>
            <button className={styles.controlButton}>
              <IconShare />
            </button>
          </div>
          <div className={styles.controlGroupWide}>
            <button
              className={`${styles.controlButtonWide} ${
                allAudioOff ? styles.controlButtonWideActive : ""
              }`}
              onClick={toggleAllAudio}
              disabled={!canControl}
              type="button"
            >
              <IconMic muted={allAudioOff} />
              <span>All Audio</span>
            </button>
            <button
              className={`${styles.controlButtonWide} ${
                allVideoOff ? styles.controlButtonWideActive : ""
              }`}
              onClick={toggleAllVideo}
              disabled={!canControl}
              type="button"
            >
              <IconCam off={allVideoOff} />
              <span>All Video</span>
            </button>
          </div>
          <div className={styles.controlGroup}>
            <button className={styles.controlButton}>
              <IconChat />
            </button>
            <button className={`${styles.controlButton} ${styles.active}`}>
              <IconPeople />
            </button>
            <button className={styles.controlButton}>
              <IconApps />
            </button>
          </div>
          <button
            className={`${styles.controlButton} ${styles.danger}`}
            onClick={leaveRoom}
            disabled={!connected}
          >
            <IconEnd />
          </button>
        </div>
      </div>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span>Participants ({sidebarList.length})</span>
          <span className={styles.topIcon}>X</span>
        </div>
        <div className={styles.sidebarSearch}>
          <input
            className={styles.searchInput}
            placeholder="Find participant"
          />
        </div>
        <div className={styles.participantList}>
          {sidebarList.map((participant) => (
            <div
              key={participant.id}
              className={`${styles.participantRow} ${
                participant.speaking ? styles.active : ""
              } ${participant.online === false ? styles.offline : ""} ${
                !participant.you ? styles.participantClickable : ""
              } ${participant.id === selectedParticipantId ? styles.participantSelected : ""}`}
              onClick={() => {
                if (participant.you) return;
                setSelectedParticipantId(participant.id);
              }}
            >
              <div className={styles.participantAvatar}>
                {participant.you ? "YOU" : getInitials(participant.name)}
              </div>
              <div className={styles.participantMeta}>
                <span className={styles.participantName}>
                  {participant.name}
                </span>
                <span className={styles.participantStatus}>
                  {participant.status || ""}
                </span>
              </div>
              <div className={styles.participantIcon}>
                <IconMic muted={participant.muted} />
              </div>
            </div>
          ))}
        </div>
        <div className={styles.sidebarFooter}>
          <button
            className={styles.footerButton}
            onClick={toggleAllAudio}
            disabled={!canControl}
            type="button"
          >
            Mute All
          </button>
          <button
            className={`${styles.footerButton} ${styles.primary}`}
            onClick={() => {
              console.log("Invite clicked", { selectedParticipantId, selectedParticipant, isSelectedOnline });
              if (isSelectedOnline) {
                console.log("Blocked: participant is online");
                return;
              }
              onInvite(selectedParticipantId ?? "");
            }}
            disabled={!connected || inviteBusy || !selectedParticipantId || isSelectedOnline}
          >
            {isSelectedOnline ? "Already in room" : "Invite"}
          </button>
        </div>
        {inviteStatus ? (
          <div className={styles.sidebarStatus}>{inviteStatus}</div>
        ) : null}
      </aside>
    </div>
  );
};

export default function Home() {
  const apiBaseEnv = process.env.NEXT_PUBLIC_API_BASE ?? "";
  const livekitEnv = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
  const defaultRoom = process.env.NEXT_PUBLIC_ROOM_NAME ?? "demo-room";

  const [apiBase, setApiBase] = useState(apiBaseEnv);
  const [identity, setIdentity] = useState(generateIdentity);
  const [name, setName] = useState("Host");
  const [roomName] = useState(defaultRoom);
  const [token, setToken] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>(livekitEnv);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [gridSize, setGridSize] = useState(3);

  useEffect(() => {
    if (apiBaseEnv) {
      setApiBase(apiBaseEnv);
      return;
    }
    if (typeof window !== "undefined") {
      setApiBase(window.location.origin);
    }
  }, [apiBaseEnv]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedIdentity = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (storedIdentity) {
      setIdentity(storedIdentity);
    } else {
      const nextIdentity = generateIdentity();
      window.localStorage.setItem(IDENTITY_STORAGE_KEY, nextIdentity);
      setIdentity(nextIdentity);
    }

    const storedName = window.localStorage.getItem(NAME_STORAGE_KEY);
    if (storedName) {
      setName(storedName);
    }
  }, []);

  const joinRoom = async () => {
    if (connecting || connected) return;
    setConnecting(true);
    setError(null);
    try {
      const apiBaseResolved = apiBase || window.location.origin;
      const authRes = await fetch(`${apiBaseResolved}/v1/auth/anonymous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, displayName: name }),
      });
      if (!authRes.ok) {
        throw new Error(`Auth failed (${authRes.status})`);
      }
      const authData = await authRes.json();

      const rtcRes = await fetch(`${apiBaseResolved}/v1/rtc/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.accessToken || ""}`,
        },
        body: JSON.stringify({
          roomName,
          identity,
          name,
          role: "host" as Role,
        }),
      });
      if (!rtcRes.ok) {
        throw new Error(`RTC token failed (${rtcRes.status})`);
      }
      const rtcData = await rtcRes.json();
      if (!rtcData?.token) {
        throw new Error("RTC token missing");
      }
      setToken(rtcData.token);
      setServerUrl(rtcData.livekitUrl || livekitEnv);
      setConnected(true);
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "Join failed");
    } finally {
      setConnecting(false);
    }
  };

  const leaveRoom = () => {
    setConnected(false);
    setToken("");
    setServerUrl(livekitEnv);
    setFocusedId(null);
  };

  const inviteParticipant = async (targetIdentity: string) => {
    if (inviteBusy) return;
    const target = targetIdentity.trim();
    if (!target) {
      setInviteStatus("목록에서 참가자를 선택하세요");
      return;
    }
    if (target === identity) {
      setInviteStatus("자기 자신에게는 호출할 수 없습니다");
      return;
    }
    setInviteBusy(true);
    setInviteStatus(null);
    try {
      const apiBaseResolved = apiBase || window.location.origin;
      const res = await fetch(`${apiBaseResolved}/v1/calls/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerIdentity: identity,
          callerName: name,
          calleeIdentity: target,
          roomName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || `Invite failed (${res.status})`);
      }
      const callId = data?.callId ? ` (${data.callId})` : "";
      setInviteStatus(`Invite sent${callId}`);
    } catch (err) {
      console.error(err);
      setInviteStatus(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <SidebarLayout>
      <div className={styles.page}>
        {/* Grid Control Header */}
        <div className={styles.gridHeader}>
          <div className={styles.gridInfo}>
            <span className={styles.gridLabel}>그리드 크기</span>
            <span className={styles.gridValue}>{gridSize} x {gridSize}</span>
          </div>
          <div className={styles.gridControl}>
            <button
              className={styles.gridBtn}
              onClick={() => setGridSize((prev) => Math.max(3, prev - 1))}
              disabled={gridSize <= 3}
              type="button"
            >
              −
            </button>
            <input
              type="range"
              min="3"
              max="7"
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className={styles.gridSlider}
            />
            <button
              className={styles.gridBtn}
              onClick={() => setGridSize((prev) => Math.min(7, prev + 1))}
              disabled={gridSize >= 7}
              type="button"
            >
              +
            </button>
          </div>
        </div>

        <div className={styles.roomWrap}>
          <LiveKitRoom
            className={styles.room}
            serverUrl={serverUrl}
            token={token}
            connect={connected}
            audio
            video
          >
            <RoomShell
              focusedId={focusedId}
              onFocus={setFocusedId}
              showJoin={!connected}
              onJoin={joinRoom}
              joinBusy={connecting}
              error={error}
              connected={connected}
              onLeave={leaveRoom}
              onInvite={inviteParticipant}
              inviteBusy={inviteBusy}
              inviteStatus={inviteStatus}
              roomName={roomName}
              apiBase={apiBase || ""}
              selfIdentity={identity}
              gridSize={gridSize}
            />
          </LiveKitRoom>
        </div>
      </div>
    </SidebarLayout>
  );
}
