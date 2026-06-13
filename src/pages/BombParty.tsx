import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageAnimator from '../components/PageAnimator';
import BombPartyLobby from '../components/bombparty/BombPartyLobby';
import BombPartyGame from '../components/bombparty/BombPartyGame';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabaseClient';

import type { BombType } from '../config/bombPartyEvents';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface BombPartyPlayer {
  id: string;
  nickname: string;
  lives: number;
  score: number;
  isHost: boolean;
  hasShield: boolean;
  avatarUrl?: string;
  isSpectator?: boolean;
}

export interface RoomSettings {
  turnTime: number;
  syllableMaxAge: number;
  startLives: number;
  maxLives: number;
  maxPlayers: number;
}

export interface RoomState {
  roomCode: string;
  players: BombPartyPlayer[];
  status: 'waiting' | 'playing' | 'finished';
  currentTurnIndex: number;
  currentSyllable: string;
  roundNumber: number;
  settings: RoomSettings;
  syllableFailCount: number;
  currentBomb: BombType;
}

const RECONNECT_KEY = 'bombparty_active_room';
const PLAYER_ID_KEY = 'bombparty_player_id';

// Persistent player ID across mounts/sessions — critical for host preservation
function getOrCreatePlayerId(): string {
  let id = sessionStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

const BombParty: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const { roomCode: urlRoomCode } = useParams<{ roomCode?: string }>();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [nickname, setNickname] = useState(profile?.minecraft_username || '');
  const [reconnectRoom, setReconnectRoom] = useState<string | null>(null);
  const [attemptingReconnect, setAttemptingReconnect] = useState(false);

  // Single unified channel for the entire room lifecycle
  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerIdRef = useRef<string>(getOrCreatePlayerId());

  // Sync nickname when profile loads
  useEffect(() => {
    if (profile?.minecraft_username && !nickname) {
      setNickname(profile.minecraft_username);
    }
  }, [profile?.minecraft_username]);

  // Clean up channel on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // Check for active room to reconnect to (only on base /bomb-party without URL code)
  useEffect(() => {
    if (authLoading) return;
    const savedRoom = localStorage.getItem(RECONNECT_KEY);
    if (savedRoom && !roomState && !urlRoomCode) {
      supabase
        .from('bomb_party_rooms')
        .select('room_code, status')
        .eq('room_code', savedRoom)
        .in('status', ['waiting', 'playing'])
        .single()
        .then(({ data }) => {
          if (data) {
            setReconnectRoom(data.room_code);
          } else {
            localStorage.removeItem(RECONNECT_KEY);
          }
        });
    }
  }, [authLoading]);

  // Direct reconnect: if URL has room code, attempt to rejoin
  useEffect(() => {
    if (!urlRoomCode || roomState || authLoading || attemptingReconnect) return;
    const myNickname = nickname || profile?.minecraft_username;
    if (!myNickname) return;

    setAttemptingReconnect(true);

    supabase
      .from('bomb_party_rooms')
      .select('status, game_state, settings, host_id')
      .eq('room_code', urlRoomCode.toUpperCase())
      .single()
      .then(async ({ data }) => {
        if (!data) {
          setAttemptingReconnect(false);
          return;
        }

        // If game is playing and I'm in the players, reconnect directly
        if (data.status === 'playing' && data.game_state) {
          const savedState = data.game_state as RoomState;
          const myPlayerInGame = savedState.players.find(p => p.nickname === myNickname);
          if (myPlayerInGame) {
            // Restore my player ID so host detection works
            playerIdRef.current = myPlayerInGame.id;
            sessionStorage.setItem(PLAYER_ID_KEY, myPlayerInGame.id);
            // Subscribe to the unified channel, then set room state
            subscribeToChannel(savedState.roomCode, myPlayerInGame, savedState.settings, myPlayerInGame.isHost);
            setRoomState(savedState);
            setAttemptingReconnect(false);
            return;
          }
        }

        // Room is in waiting — auto-join will be handled by the lobby's auto-join
        setAttemptingReconnect(false);
      });
  }, [urlRoomCode, authLoading, nickname, profile?.minecraft_username]);

  // Update URL and localStorage when room state changes
  useEffect(() => {
    if (roomState?.roomCode) {
      localStorage.setItem(RECONNECT_KEY, roomState.roomCode);
      const currentPath = window.location.pathname;
      const expectedPath = `/bomb-party/${roomState.roomCode}`;
      if (currentPath !== expectedPath) {
        navigate(expectedPath, { replace: true });
      }
    } else if (!attemptingReconnect) {
      localStorage.removeItem(RECONNECT_KEY);
      const currentPath = window.location.pathname;
      if (currentPath !== '/bomb-party' && !urlRoomCode) {
        navigate('/bomb-party', { replace: true });
      }
    }
  }, [roomState?.roomCode, navigate, attemptingReconnect]);

  /**
   * Unified channel subscription.
   * Handles Presence (who's online) + Broadcast (game events) in a single channel.
   * Created once per room and shared across Lobby and Game components.
   */
  const subscribeToChannel = useCallback((
    roomCode: string,
    myPlayer: BombPartyPlayer,
    _roomSettings: RoomSettings,
    isHost: boolean
  ) => {
    // Remove existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`bombparty:${roomCode}`, {
      config: { presence: { key: myPlayer.id } },
    });

    // --- PRESENCE: lobby player sync ---
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const players: BombPartyPlayer[] = [];

      Object.values(presenceState).forEach((presences) => {
        const p = (presences as unknown as { player: BombPartyPlayer }[])[0];
        if (p?.player) {
          players.push(p.player);
        }
      });

      // Sort: host first, then by ID for stable ordering
      players.sort((a, b) => {
        if (a.isHost && !b.isHost) return -1;
        if (!a.isHost && b.isHost) return 1;
        return a.id.localeCompare(b.id);
      });

      setRoomState((prev) => {
        // Only update players from Presence when in waiting status
        if (!prev || prev.status !== 'waiting') return prev;
        return { ...prev, players };
      });
    });

    // --- BROADCAST: game_start ---
    channel.on('broadcast', { event: 'game_start' }, ({ payload }) => {
      const newState = payload as RoomState;
      setRoomState(newState);
    });

    // --- BROADCAST: game_state_update (turn changes, time up, etc.) ---
    channel.on('broadcast', { event: 'game_state_update' }, ({ payload }) => {
      const newState = payload as RoomState;
      setRoomState(newState);
    });

    // --- BROADCAST: word_accepted ---
    channel.on('broadcast', { event: 'word_accepted' }, ({ payload }) => {
      const { newState } = payload as { newState: RoomState; word: string };
      setRoomState(newState);
    });

    // --- BROADCAST: game_over ---
    channel.on('broadcast', { event: 'game_over' }, ({ payload }) => {
      setRoomState(payload as RoomState);
    });

    // --- BROADCAST: settings_update (host changes settings in lobby) ---
    channel.on('broadcast', { event: 'settings_update' }, ({ payload }) => {
      setRoomState((prev) => prev ? { ...prev, settings: payload as RoomSettings } : prev);
    });

    // --- BROADCAST: return_to_lobby ---
    channel.on('broadcast', { event: 'return_to_lobby' }, ({ payload }) => {
      setRoomState(payload as RoomState);
      // Re-track presence with reset player data
      const meInPayload = (payload as RoomState).players.find(p => p.id === myPlayer.id);
      if (meInPayload) {
        channel.track({ player: meInPayload, isHost: meInPayload.isHost });
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          player: myPlayer,
          isHost,
        });
      }
    });

    channelRef.current = channel;
  }, []);

  const updateRoomState = useCallback((update: RoomState | null | ((prev: RoomState | null) => RoomState | null)) => {
    if (typeof update === 'function') {
      setRoomState(update);
    } else {
      setRoomState(update);
    }
  }, []);

  const handleReconnect = () => {
    if (reconnectRoom) {
      setReconnectRoom(null);
      navigate(`/bomb-party/${reconnectRoom}`, { replace: true });
    }
  };

  const handleLeaveRoom = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRoomState(null);
    localStorage.removeItem(RECONNECT_KEY);
    navigate('/bomb-party', { replace: true });
  }, [navigate]);

  // Show loading while attempting reconnect
  if (attemptingReconnect) {
    return (
      <PageAnimator className="flex min-h-[calc(100vh-76px)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-container border-t-transparent" />
          <p className="font-body-lg text-on-surface-variant">Riconnessione in corso...</p>
        </div>
      </PageAnimator>
    );
  }

  return (
    <PageAnimator className="relative w-full overflow-hidden px-4 pb-14 pt-8 sm:px-margin">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 bg-surface-container-lowest" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 2px, transparent 2px)', backgroundSize: '28px 28px' }} />
      <div className="pointer-events-none absolute -left-32 top-32 h-80 w-80 rounded-full bg-red-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-20 h-72 w-72 rounded-full bg-orange-500/15 blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-[1100px]">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4">
          <div className="inline-flex -rotate-2 items-center gap-2 self-start rounded-2xl border-[3px] border-black bg-red-600 px-4 py-2 font-label-caps text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <span className="material-symbols-outlined text-[18px]">bomb</span>
            WORD GAME
          </div>
          <h1 className="font-headline-lg text-[48px] uppercase leading-none tracking-tighter text-white drop-shadow-[5px_5px_0px_rgba(0,0,0,1)] sm:text-[64px]">
            BOMB PARTY
          </h1>
          <p className="max-w-lg font-body-lg text-on-surface-variant">
            Scrivi parole che contengono la sillaba mostrata prima che la bomba esploda! 💣
          </p>
        </div>

        {/* Reconnect banner */}
        {reconnectRoom && !roomState && (
          <div className="mb-6 rounded-[2rem] border-[4px] border-black bg-orange-900/40 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[28px]">🔌</span>
                <div>
                  <p className="font-headline-md text-[16px] text-white">Partita in corso trovata!</p>
                  <p className="font-body-sm text-on-surface-variant">Stanza: {reconnectRoom}</p>
                </div>
              </div>
              <button
                onClick={handleReconnect}
                className="rounded-xl border-[3px] border-black bg-green-600 px-6 py-3 font-headline-md text-[14px] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                RICONNETTITI
              </button>
            </div>
          </div>
        )}

        {/* Game content */}
        {!roomState || roomState.status === 'waiting' ? (
          <BombPartyLobby
            nickname={nickname}
            setNickname={setNickname}
            roomState={roomState}
            setRoomState={updateRoomState}
            initialJoinCode={urlRoomCode}
            channel={channelRef.current}
            subscribeToChannel={subscribeToChannel}
            playerId={playerIdRef.current}
            onLeave={handleLeaveRoom}
          />
        ) : (
          <BombPartyGame
            roomState={roomState}
            setRoomState={updateRoomState}
            nickname={nickname}
            channel={channelRef.current}
            playerId={playerIdRef.current}
            onLeave={handleLeaveRoom}
          />
        )}
      </div>
    </PageAnimator>
  );
};

export default BombParty;
