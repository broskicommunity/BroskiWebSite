/**
 * DEBUG PAGE: /bomb-party-debug
 *
 * Renders the BombPartyGame overlay with fake players and a frozen timer
 * so you can tweak visuals without needing a real multiplayer session.
 * Remove or protect this route before shipping to production.
 */
import React, { useState, useCallback } from 'react';
import BombPartyGame from '../components/bombparty/BombPartyGame';
import type { RoomState, BombPartyPlayer } from './BombParty';
import type { BombType } from '../config/bombPartyEvents';

const FAKE_PLAYERS: BombPartyPlayer[] = [
  { id: 'p1', nickname: 'Pirata91', lives: 3, score: 5, isHost: true, hasShield: false, avatarUrl: 'https://mc-heads.net/avatar/Pirata91/64' },
  { id: 'p2', nickname: 'zZalix', lives: 2, score: 3, isHost: false, hasShield: true, avatarUrl: 'https://mc-heads.net/avatar/zZalix/64' },
  { id: 'p3', nickname: 'BlimMC_', lives: 1, score: 7, isHost: false, hasShield: false, avatarUrl: 'https://mc-heads.net/avatar/BlimMC_/64' },
  { id: 'p4', nickname: 'NotAlexAgain', lives: 3, score: 2, isHost: false, hasShield: false, avatarUrl: 'https://mc-heads.net/avatar/NotAlexAgain/64' },
];

const BOMB_TYPES: BombType[] = ['normal', 'dollar', 'lightning', 'striped', 'star'];

const BombPartyDebug: React.FC = () => {
  const [playerCount, setPlayerCount] = useState(4);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [currentBomb, setCurrentBomb] = useState<BombType>('normal');
  const [timeLeft, setTimeLeft] = useState(7);

  const players = FAKE_PLAYERS.slice(0, playerCount);

  const [roomState, setRoomStateRaw] = useState<RoomState>({
    roomCode: 'D3BU6',
    players,
    status: 'playing',
    currentTurnIndex: currentTurn,
    currentSyllable: 'AS',
    roundNumber: 5,
    settings: { turnTime: 10, syllableMaxAge: 3, startLives: 3, maxLives: 5, maxPlayers: 8 },
    syllableFailCount: 1,
    currentBomb,
  });

  // Rebuild roomState when controls change
  const rebuild = useCallback((overrides: Partial<RoomState>) => {
    setRoomStateRaw((prev) => ({ ...prev, ...overrides }));
  }, []);

  // Sync controls → roomState
  React.useEffect(() => {
    rebuild({
      players: FAKE_PLAYERS.slice(0, playerCount),
      currentTurnIndex: currentTurn % playerCount,
      currentBomb,
    });
  }, [playerCount, currentTurn, currentBomb, rebuild]);

  // Override the roomState setter so the game component can "play" but the timer won't tick
  // (because the channel is null and there's no timer effect firing)
  const setRoomState = useCallback((update: RoomState | null | ((prev: RoomState | null) => RoomState | null)) => {
    if (typeof update === 'function') {
      setRoomStateRaw((prev) => {
        const result = update(prev);
        return result || prev;
      });
    } else if (update) {
      setRoomStateRaw(update);
    }
  }, []);

  return (
    <div className="min-h-screen bg-surface-container-lowest p-4">
      {/* Debug Controls */}
      <div className="mx-auto mb-4 max-w-[900px] rounded-xl border-[3px] border-yellow-500 bg-yellow-500/10 p-4">
        <h2 className="mb-3 font-headline-md text-[18px] text-yellow-300">🛠️ DEBUG CONTROLS (timer frozen)</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block font-label-caps text-[10px] text-on-surface-variant">PLAYERS</label>
            <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))} className="rounded border-[2px] border-black bg-surface-container-high px-2 py-1 text-white">
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-label-caps text-[10px] text-on-surface-variant">TURN</label>
            <select value={currentTurn} onChange={(e) => setCurrentTurn(Number(e.target.value))} className="rounded border-[2px] border-black bg-surface-container-high px-2 py-1 text-white">
              {FAKE_PLAYERS.slice(0, playerCount).map((p, i) => (
                <option key={i} value={i}>{p.nickname}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-label-caps text-[10px] text-on-surface-variant">BOMB</label>
            <select value={currentBomb} onChange={(e) => setCurrentBomb(e.target.value as BombType)} className="rounded border-[2px] border-black bg-surface-container-high px-2 py-1 text-white">
              {BOMB_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-label-caps text-[10px] text-on-surface-variant">TIME LEFT (visual)</label>
            <input type="range" min={0} max={10} value={timeLeft} onChange={(e) => setTimeLeft(Number(e.target.value))} className="w-28" />
            <span className="ml-2 text-white">{timeLeft}s</span>
          </div>
          <div>
            <label className="mb-1 block font-label-caps text-[10px] text-on-surface-variant">SYLLABLE</label>
            <input
              type="text"
              maxLength={5}
              value={roomState.currentSyllable}
              onChange={(e) => rebuild({ currentSyllable: e.target.value.toUpperCase() })}
              className="w-20 rounded border-[2px] border-black bg-surface-container-high px-2 py-1 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block font-label-caps text-[10px] text-on-surface-variant">STATUS</label>
            <select
              value={roomState.status}
              onChange={(e) => rebuild({ status: e.target.value as RoomState['status'] })}
              className="rounded border-[2px] border-black bg-surface-container-high px-2 py-1 text-white"
            >
              <option value="playing">playing</option>
              <option value="finished">finished</option>
            </select>
          </div>
        </div>
      </div>

      {/* Game overlay - rendered with frozen timer (no channel = no real timer) */}
      <div className="mx-auto max-w-[1100px]">
        <BombPartyGameDebugWrapper
          roomState={{ ...roomState, currentTurnIndex: currentTurn % playerCount }}
          setRoomState={setRoomState}
          timeLeftOverride={timeLeft}
        />
      </div>
    </div>
  );
};

/**
 * Wrapper that renders BombPartyGame but overrides the internal timer
 * by patching the component's time display externally. Since the component
 * reads timeLeft from internal state driven by its own timer (which won't fire
 * because channel=null and isMyTurn depends on nickname matching), we pass
 * the game component directly. The timer won't tick because there's no channel.
 */
const BombPartyGameDebugWrapper: React.FC<{
  roomState: RoomState;
  setRoomState: (r: RoomState | null | ((prev: RoomState | null) => RoomState | null)) => void;
  timeLeftOverride: number;
}> = ({ roomState, setRoomState, timeLeftOverride: _timeLeftOverride }) => {
  void _timeLeftOverride; // visual only — the game component manages its own timer

  return (
    <BombPartyGame
      roomState={roomState}
      setRoomState={setRoomState}
      nickname="__DEBUG_SPECTATOR__"
      channel={null}
      playerId="debug-spectator"
      onLeave={() => window.location.href = '/bomb-party'}
      debugFreezeTimer
    />
  );
};

export default BombPartyDebug;
