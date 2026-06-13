import React, { useState, useEffect, useRef, useCallback } from 'react';
import { validateWord, getRandomSyllable, loadDictionary, isDictionaryLoaded } from '../../utils/bombPartyDictionary';
import { BOMB_EVENTS, rollBombEvent } from '../../config/bombPartyEvents';
import { saveMatchResult, saveGameState } from '../../utils/bombPartyPersistence';
import type { RoomState } from '../../pages/BombParty';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Props {
  roomState: RoomState;
  setRoomState: (r: RoomState | null | ((prev: RoomState | null) => RoomState | null)) => void;
  nickname: string;
  channel: RealtimeChannel | null;
  playerId: string;
  onLeave: () => void;
}

function getPlayerPositions(count: number): { top: string; left: string }[] {
  const positions: { top: string; left: string }[] = [];
  const radius = 38;
  const centerX = 50;
  const centerY = 50;
  const startAngle = -90;

  for (let i = 0; i < count; i++) {
    const angle = startAngle + (360 / count) * i;
    const rad = (angle * Math.PI) / 180;
    const x = centerX + radius * Math.cos(rad);
    const y = centerY + radius * Math.sin(rad);
    positions.push({ top: `${y}%`, left: `${x}%` });
  }
  return positions;
}

// Grace period: if the authoritative timer owner doesn't respond,
// any other client can fire handleTimeUp after this extra delay (ms)
const FALLBACK_TIMER_EXTRA_MS = 5000;

const BombPartyGame: React.FC<Props> = ({ roomState, setRoomState, nickname, channel, playerId: _playerId, onLeave }) => {
  void _playerId; // kept for future use (e.g. player-specific logic)
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'event' | '' }>({ message: '', type: '' });
  const [timeLeft, setTimeLeft] = useState(roomState.settings.turnTime);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
  const [playerInputs, setPlayerInputs] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomStateRef = useRef(roomState);
  const gameStartTimeRef = useRef(Date.now());

  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  useEffect(() => { if (!isDictionaryLoaded()) loadDictionary(); }, []);

  const currentPlayer = roomState.players[roomState.currentTurnIndex];
  const isMyTurn = currentPlayer?.nickname === nickname;
  const alivePlayers = roomState.players.filter(p => p.lives > 0);
  const currentBombEvent = BOMB_EVENTS[roomState.currentBomb];
  const mePlayer = roomState.players.find(p => p.nickname === nickname);
  const isSpectator = mePlayer?.isSpectator || false;

  // Effective turn time (striped bomb = half time)
  const effectiveTurnTime = roomState.currentBomb === 'striped'
    ? Math.max(3, Math.floor(roomState.settings.turnTime / 2))
    : roomState.settings.turnTime;

  // Listen to broadcast events on the unified channel
  // The channel is managed by BombParty.tsx, but we need to listen for typing
  // and handle word_accepted feedback locally
  useEffect(() => {
    if (!channel) return;

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { playerNickname, text } = payload as { playerNickname: string; text: string };
      if (playerNickname !== nickname) {
        setPlayerInputs(prev => ({ ...prev, [playerNickname]: text }));
      }
    });

    // Listen for word_accepted to update usedWords set locally
    channel.on('broadcast', { event: 'word_accepted' }, ({ payload }) => {
      const { word } = payload as { newState: RoomState; word: string };
      setUsedWords(prev => new Set([...prev, word.toLowerCase()]));
      setInput('');
      setPlayerInputs({});
      setFeedback({ message: '', type: '' });
    });

    // On game_state_update, reset input/timer display
    channel.on('broadcast', { event: 'game_state_update' }, () => {
      setInput('');
      setPlayerInputs({});
    });

    // We don't unsubscribe individual listeners in Supabase SDK —
    // the channel lifecycle is managed by BombParty.tsx
    return () => {
      // Supabase doesn't support removing individual broadcast listeners,
      // but the channel will be cleaned up when leaving the room entirely.
    };
  }, [channel, nickname]);

  // Reset timer display when turn changes (from roomState prop updates)
  useEffect(() => {
    setTimeLeft(effectiveTurnTime);
    setInput('');
    setPlayerInputs({});
  }, [roomState.currentTurnIndex, roomState.roundNumber, effectiveTurnTime]);

  // Note: winner checking is done inline in handleTimeUp, handleTimeUpFallback, and submitWord
  // to avoid race conditions with early game-over detection.

  // Authoritative timer: only runs on the current turn player's client
  useEffect(() => {
    if (roomState.status !== 'playing') return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isMyTurn) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimeUp();
          return effectiveTurnTime;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [roomState.currentTurnIndex, roomState.roundNumber, roomState.status, isMyTurn, effectiveTurnTime]);

  // Visual countdown timer for non-active players
  useEffect(() => {
    if (roomState.status !== 'playing' || isMyTurn) return;
    const visualTimer = setInterval(() => {
      setTimeLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(visualTimer);
  }, [roomState.currentTurnIndex, roomState.roundNumber, roomState.status, isMyTurn]);

  // FALLBACK TIMER: if the current turn player disconnects, exactly ONE other client
  // must fire the time-up. We designate the "fallback authority" as the lowest-index
  // alive player that is NOT the current turn player. This prevents multiple clients
  // from broadcasting divergent states simultaneously.
  const fallbackAuthorityNickname = (() => {
    const candidate = roomState.players.find(
      (p, i) => p.lives > 0 && !p.isSpectator && i !== roomState.currentTurnIndex
    );
    return candidate?.nickname;
  })();
  const isFallbackAuthority = fallbackAuthorityNickname === nickname;

  useEffect(() => {
    // Only the designated fallback authority arms the fallback timer, and only
    // when it's NOT their own turn.
    if (roomState.status !== 'playing' || isMyTurn || !isFallbackAuthority) {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      return;
    }

    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    // Set fallback to fire after effectiveTurnTime + grace period
    const totalMs = (effectiveTurnTime * 1000) + FALLBACK_TIMER_EXTRA_MS;
    const capturedTurn = { turnIndex: roomState.currentTurnIndex, round: roomState.roundNumber };

    fallbackTimerRef.current = setTimeout(() => {
      // Only fire if the turn hasn't changed (meaning the active player never responded)
      const current = roomStateRef.current;
      if (
        current.currentTurnIndex === capturedTurn.turnIndex &&
        current.roundNumber === capturedTurn.round &&
        current.status === 'playing'
      ) {
        handleTimeUpFallback();
      }
    }, totalMs);

    return () => { if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current); };
  }, [roomState.currentTurnIndex, roomState.roundNumber, roomState.status, isMyTurn, isFallbackAuthority, effectiveTurnTime]);

  // Focus input on my turn
  useEffect(() => {
    if (isMyTurn && inputRef.current) inputRef.current.focus();
  }, [isMyTurn]);

  // Typing broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    if (channel && isMyTurn) {
      channel.send({
        type: 'broadcast', event: 'typing',
        payload: { playerNickname: nickname, text: value },
      });
    }
  };

  // Determine next bomb for the upcoming turn
  const getNextBomb = useCallback((players: typeof roomState.players, currentIdx: number) => {
    const otherPlayers = players.filter((p, i) => i !== currentIdx && p.lives > 0);
    const canLightning = otherPlayers.every(p => p.lives > 1);
    return rollBombEvent(canLightning);
  }, []);

  // handleTimeUp: called by the authoritative timer (current turn player's client)
  const handleTimeUp = useCallback(async () => {
    const state = roomStateRef.current;
    const currentP = state.players[state.currentTurnIndex];
    if (currentP?.nickname !== nickname) return;

    const updatedPlayers = state.players.map((p, i) => {
      if (i !== state.currentTurnIndex) return p;
      if (p.hasShield) return { ...p, hasShield: false };
      return { ...p, lives: p.lives - 1 };
    });

    const alive = updatedPlayers.filter(p => p.lives > 0);
    if (alive.length <= 1) {
      const finishedState: RoomState = { ...state, players: updatedPlayers, status: 'finished' };
      if (channel) {
        await channel.send({ type: 'broadcast', event: 'game_over', payload: finishedState });
      }
      setRoomState(finishedState);
      if (timerRef.current) clearInterval(timerRef.current);
      const winner = alive[0];
      if (winner) {
        saveMatchResult(finishedState, winner.nickname, gameStartTimeRef.current);
        saveGameState(finishedState);
      }
      return;
    }

    let nextIndex = (state.currentTurnIndex + 1) % updatedPlayers.length;
    while (updatedPlayers[nextIndex].lives <= 0) {
      nextIndex = (nextIndex + 1) % updatedPlayers.length;
    }

    const newFailCount = state.syllableFailCount + 1;
    const shouldChangeSyllable = newFailCount >= state.settings.syllableMaxAge;
    const nextBomb = getNextBomb(updatedPlayers, nextIndex);
    const newSyllable = shouldChangeSyllable ? getRandomSyllable() : state.currentSyllable;

    const newState: RoomState = {
      ...state,
      players: updatedPlayers,
      currentTurnIndex: nextIndex,
      currentSyllable: newSyllable,
      roundNumber: state.roundNumber + 1,
      syllableFailCount: shouldChangeSyllable ? 0 : newFailCount,
      currentBomb: nextBomb,
    };

    if (channel) {
      await channel.send({ type: 'broadcast', event: 'game_state_update', payload: newState });
    }
    setRoomState(newState);
    saveGameState(newState);
  }, [nickname, setRoomState, getNextBomb, channel]);

  // handleTimeUpFallback: called by any NON-active client when the active player
  // appears to have disconnected (timer expired + 5s grace with no state change)
  const handleTimeUpFallback = useCallback(async () => {
    const state = roomStateRef.current;
    if (state.status !== 'playing') return;

    const updatedPlayers = state.players.map((p, i) => {
      if (i !== state.currentTurnIndex) return p;
      if (p.hasShield) return { ...p, hasShield: false };
      return { ...p, lives: p.lives - 1 };
    });

    const alive = updatedPlayers.filter(p => p.lives > 0);
    if (alive.length <= 1) {
      const finishedState: RoomState = { ...state, players: updatedPlayers, status: 'finished' };
      if (channel) {
        await channel.send({ type: 'broadcast', event: 'game_over', payload: finishedState });
      }
      setRoomState(finishedState);
      const winner = alive[0];
      if (winner) {
        saveMatchResult(finishedState, winner.nickname, gameStartTimeRef.current);
        saveGameState(finishedState);
      }
      return;
    }

    let nextIndex = (state.currentTurnIndex + 1) % updatedPlayers.length;
    while (updatedPlayers[nextIndex].lives <= 0) {
      nextIndex = (nextIndex + 1) % updatedPlayers.length;
    }

    const newFailCount = state.syllableFailCount + 1;
    const shouldChangeSyllable = newFailCount >= state.settings.syllableMaxAge;
    const nextBomb = getNextBomb(updatedPlayers, nextIndex);
    const newSyllable = shouldChangeSyllable ? getRandomSyllable() : state.currentSyllable;

    const newState: RoomState = {
      ...state,
      players: updatedPlayers,
      currentTurnIndex: nextIndex,
      currentSyllable: newSyllable,
      roundNumber: state.roundNumber + 1,
      syllableFailCount: shouldChangeSyllable ? 0 : newFailCount,
      currentBomb: nextBomb,
    };

    if (channel) {
      await channel.send({ type: 'broadcast', event: 'game_state_update', payload: newState });
    }
    setRoomState(newState);
    saveGameState(newState);
  }, [setRoomState, getNextBomb, channel]);

  const submitWord = async () => {
    if (!isMyTurn || !input.trim()) return;
    const word = input.trim().toLowerCase();

    if (usedWords.has(word)) {
      setFeedback({ message: 'Parola già usata!', type: 'error' });
      return;
    }
    if (!word.includes(roomState.currentSyllable.toLowerCase())) {
      setFeedback({ message: `Deve contenere "${roomState.currentSyllable}"!`, type: 'error' });
      return;
    }
    if (!validateWord(word)) {
      setFeedback({ message: 'Parola non valida!', type: 'error' });
      return;
    }

    setUsedWords(prev => new Set([...prev, word]));

    // === APPLY BOMB EFFECTS ===
    let updatedPlayers = [...roomState.players];
    let bonusMessage = '';

    switch (roomState.currentBomb) {
      case 'dollar':
        if (word.length >= 7) {
          updatedPlayers = updatedPlayers.map((p, i) =>
            i === roomState.currentTurnIndex
              ? { ...p, lives: Math.min(p.lives + 1, roomState.settings.maxLives), score: p.score + 1, hasShield: false }
              : p
          );
          bonusMessage = '💰 PAROLA LUNGA! +1 vita!';
        } else {
          updatedPlayers = updatedPlayers.map((p, i) =>
            i === roomState.currentTurnIndex ? { ...p, score: p.score + 1, hasShield: false } : p
          );
          bonusMessage = '💰 Parola troppo corta per il bonus! (servono 7+ lettere)';
        }
        break;

      case 'lightning':
        updatedPlayers = updatedPlayers.map((p, i) => {
          if (i === roomState.currentTurnIndex) {
            return { ...p, score: p.score + 1, hasShield: false };
          }
          if (p.lives > 0) {
            if (p.hasShield) return { ...p, hasShield: false };
            return { ...p, lives: p.lives - 1 };
          }
          return p;
        });
        bonusMessage = '⚡ SHOCK! Tutti gli avversari -1 vita!';
        break;

      case 'striped':
        updatedPlayers = updatedPlayers.map((p, i) =>
          i === roomState.currentTurnIndex ? { ...p, score: p.score + 1, hasShield: false } : p
        );
        bonusMessage = '🎯 Bravo! Hai battuto il timer dimezzato!';
        break;

      case 'star':
        updatedPlayers = updatedPlayers.map((p, i) =>
          i === roomState.currentTurnIndex
            ? { ...p, score: p.score + 1, hasShield: true }
            : p
        );
        bonusMessage = '⭐ SCUDO ATTIVATO! La prossima esplosione non ti farà danno!';
        break;

      default:
        updatedPlayers = updatedPlayers.map((p, i) =>
          i === roomState.currentTurnIndex ? { ...p, score: p.score + 1, hasShield: false } : p
        );
        break;
    }

    // Check winner after bomb effects
    const alive = updatedPlayers.filter(p => p.lives > 0);
    if (alive.length <= 1) {
      const finishedState: RoomState = { ...roomState, players: updatedPlayers, status: 'finished' };
      if (channel) {
        await channel.send({ type: 'broadcast', event: 'game_over', payload: finishedState });
      }
      setRoomState(finishedState);
      if (timerRef.current) clearInterval(timerRef.current);
      const winner = alive[0];
      if (winner) {
        saveMatchResult(finishedState, winner.nickname, gameStartTimeRef.current);
        saveGameState(finishedState);
      }
      return;
    }

    // Next player
    let nextIndex = (roomState.currentTurnIndex + 1) % updatedPlayers.length;
    while (updatedPlayers[nextIndex].lives <= 0) {
      nextIndex = (nextIndex + 1) % updatedPlayers.length;
    }

    const nextBomb = getNextBomb(updatedPlayers, nextIndex);
    const newSyllable = getRandomSyllable();

    const newState: RoomState = {
      ...roomState,
      players: updatedPlayers,
      currentTurnIndex: nextIndex,
      currentSyllable: newSyllable,
      roundNumber: roomState.roundNumber + 1,
      syllableFailCount: 0,
      currentBomb: nextBomb,
    };

    if (channel) {
      await channel.send({
        type: 'broadcast', event: 'word_accepted',
        payload: { newState, word },
      });
    }

    setRoomState(newState);
    saveGameState(newState);
    setInput('');
    const baseMsg = `✓ "${word}" accettata!`;
    setFeedback({
      message: bonusMessage ? `${baseMsg} — ${bonusMessage}` : baseMsg,
      type: bonusMessage ? 'event' : 'success',
    });
    setTimeLeft(effectiveTurnTime);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submitWord();
  };

  // Return to lobby — host preserves host role, broadcast to all
  const returnToLobby = async () => {
    const lobbyState: RoomState = {
      ...roomState,
      status: 'waiting',
      currentTurnIndex: 0,
      currentSyllable: '',
      roundNumber: 0,
      syllableFailCount: 0,
      currentBomb: 'normal',
      players: roomState.players.map(p => ({
        ...p,
        lives: roomState.settings.startLives,
        score: 0,
        hasShield: false,
        isSpectator: false,
      })),
    };

    if (channel) {
      await channel.send({ type: 'broadcast', event: 'return_to_lobby', payload: lobbyState });
    }
    setRoomState(lobbyState);
    // Update DB status back to waiting
    saveGameState(lobbyState);
  };

  // Shake intensity
  const shakeIntensity = effectiveTurnTime > 0
    ? Math.max(0, 1 - timeLeft / effectiveTurnTime)
    : 0;

  const positions = getPlayerPositions(roomState.players.length);

  // Game Over screen
  if (roomState.status === 'finished') {
    const winner = alivePlayers[0] || roomState.players.reduce((a, b) => a.score > b.score ? a : b);
    const isWinner = winner.nickname === nickname;
    const amIHost = roomState.players.find(p => p.nickname === nickname)?.isHost;

    return (
      <div className="space-y-6">
        <div className="rounded-[2rem] border-[4px] border-black bg-surface-container p-10 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="text-[64px]">{isWinner ? '🏆' : '💀'}</div>
          <h2 className="mt-4 font-headline-lg text-[36px] text-white">
            {isWinner ? 'HAI VINTO!' : 'GAME OVER'}
          </h2>
          <p className="mt-2 font-headline-md text-[20px] text-primary-container">
            Vincitore: {winner.nickname}
          </p>
          <div className="mt-6 space-y-2">
            {[...roomState.players].sort((a, b) => b.lives - a.lives || b.score - a.score).map((p, i) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border-[3px] border-black bg-surface-container-high p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center gap-3">
                  <span className="font-headline-md text-[18px] text-on-surface-variant">#{i + 1}</span>
                  {p.avatarUrl && <img src={p.avatarUrl} alt="" className="h-6 w-6 rounded" />}
                  <span className="font-headline-md text-[14px] text-white">{p.nickname}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px]">{p.lives > 0 ? '👑' : '💀'}</span>
                  <span className="font-headline-md text-[13px] text-on-surface-variant">{p.score} parole</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          {amIHost && (
            <button onClick={returnToLobby} className="flex-1 rounded-2xl border-[4px] border-black bg-green-600 px-8 py-4 font-headline-md text-[18px] text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none">
              🔄 NUOVO ROUND
            </button>
          )}
          <button onClick={onLeave} className="flex-1 rounded-2xl border-[4px] border-black bg-surface-container-high px-8 py-4 font-headline-md text-[18px] text-on-surface-variant shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none">
            ESCI
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Event banner */}
      {roomState.currentBomb !== 'normal' && (
        <div className={`rounded-xl border-[3px] border-black p-3 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
          roomState.currentBomb === 'dollar' ? 'bg-green-900/50' :
          roomState.currentBomb === 'lightning' ? 'bg-purple-900/50' :
          roomState.currentBomb === 'striped' ? 'bg-orange-900/50' :
          'bg-blue-900/50'
        }`}>
          <p className="font-headline-md text-[14px] text-white">
            {currentBombEvent.description}
          </p>
        </div>
      )}

      {/* Arena */}
      <div className="relative mx-auto aspect-square w-full max-w-[700px] rounded-[2rem] border-[4px] border-black bg-surface-container shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">

        {/* Bomb center */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            animation: `bomb-shake ${Math.max(0.05, 0.5 - shakeIntensity * 0.45)}s infinite`,
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className={`relative h-40 w-40 sm:h-52 sm:w-52`} style={{ transform: 'translateX(9px)' }}>
              <img
                src={currentBombEvent.image}
                alt={currentBombEvent.name}
                className="h-full w-full object-contain"
              />
              <div
                className="absolute flex items-center justify-center"
                style={{ top: '74%', left: '50%', transform: 'translate(-50%, -50%) translate(-9px, -24px)' }}
              >
                <span className="font-headline-lg text-[28px] uppercase tracking-wider text-white sm:text-[36px]"
                  style={{ textShadow: '0 0 10px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7)' }}>
                  {roomState.currentSyllable}
                </span>
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-2">
              <div className="h-3 w-24 overflow-hidden rounded-full border-[2px] border-black bg-surface-container-high">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                    timeLeft <= 2 ? 'bg-red-600' : timeLeft <= 4 ? 'bg-orange-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${(timeLeft / effectiveTurnTime) * 100}%` }}
                />
              </div>
              <span className={`font-headline-md text-[16px] ${
                timeLeft <= 2 ? 'text-red-500' : timeLeft <= 4 ? 'text-orange-400' : 'text-white'
              }`}>
                {timeLeft}s
              </span>
            </div>
          </div>
        </div>

        {/* Players around bomb */}
        {roomState.players.map((player, index) => {
          const pos = positions[index];
          const isCurrent = index === roomState.currentTurnIndex;
          const isDead = player.lives <= 0;
          const typingText = player.nickname === nickname ? input : (playerInputs[player.nickname] || '');

          return (
            <div key={player.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: pos.top, left: pos.left }}>
              <div className={`flex flex-col items-center gap-1 transition-all ${isDead ? 'opacity-40 grayscale' : ''}`}>
                <p className={`font-headline-md text-[12px] sm:text-[14px] ${isCurrent ? 'text-primary-container' : 'text-white'}`}>
                  {player.nickname}
                </p>
                <div className="flex gap-0.5">
                  {Array.from({ length: roomState.settings.maxLives }).map((_, i) => (
                    <span key={i} className={`text-[10px] sm:text-[12px] ${i < player.lives ? '' : 'opacity-30'}`}>❤️</span>
                  ))}
                  {player.hasShield && <span className="text-[10px] sm:text-[12px]">🛡️</span>}
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:h-16 sm:w-16 ${
                  isCurrent ? 'bg-primary-container ring-2 ring-green-400' : 'bg-surface-container-high'
                }`}>
                  {player.avatarUrl ? (
                    <img src={player.avatarUrl} alt={player.nickname} className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[24px] text-white sm:text-[32px]">person</span>
                  )}
                </div>
                {isCurrent && typingText && (
                  <p className="mt-1 max-w-[160px] whitespace-normal break-words rounded-lg border-[2px] border-black bg-surface-container-highest px-2 py-0.5 text-center font-headline-md text-[11px] text-primary-container shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:max-w-[200px] sm:text-[13px]">
                    {typingText}
                  </p>
                )}
                {isCurrent && !isDead && <span className="text-[16px]">⬆️</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="rounded-[2rem] border-[4px] border-black bg-surface-container p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:p-6">
        {isSpectator ? (
          <p className="text-center font-headline-md text-[14px] text-on-surface-variant">
            👀 Stai guardando la partita come spettatore. Potrai giocare al prossimo round!
          </p>
        ) : (
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={!isMyTurn}
              placeholder={isMyTurn ? `Scrivi una parola con "${roomState.currentSyllable}"...` : 'Aspetta il tuo turno...'}
              className="flex-1 rounded-xl border-[3px] border-black bg-surface-container-high px-4 py-3 font-headline-md text-[16px] text-white placeholder:text-on-surface-variant/50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:ring-2 focus:ring-primary-container disabled:opacity-50 sm:text-[18px]"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              onClick={submitWord}
              disabled={!isMyTurn || !input.trim()}
              className="rounded-xl border-[3px] border-black bg-green-600 px-5 py-3 font-headline-md text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[24px]">send</span>
            </button>
          </div>
        )}
        {feedback.message && (
          <p className={`mt-2 text-center font-body-lg text-[14px] ${
            feedback.type === 'success' ? 'text-green-400' :
            feedback.type === 'event' ? 'text-yellow-400' :
            'text-red-400'
          }`}>
            {feedback.message}
          </p>
        )}
      </div>

      {/* Leave */}
      <button onClick={onLeave} className="rounded-xl border-[3px] border-black bg-surface-container-high px-6 py-2 font-body-lg text-on-surface-variant shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:text-red-400">
        <span className="material-symbols-outlined mr-1 align-middle text-[18px]">logout</span>
        Abbandona
      </button>

      <style>{`
        @keyframes bomb-shake {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
          25% { transform: translate(-50%, -50%) rotate(${2 + shakeIntensity * 6}deg) translate(${shakeIntensity * 3}px, 0); }
          50% { transform: translate(-50%, -50%) rotate(0deg); }
          75% { transform: translate(-50%, -50%) rotate(-${2 + shakeIntensity * 6}deg) translate(-${shakeIntensity * 3}px, 0); }
        }
      `}</style>
    </div>
  );
};

export default BombPartyGame;
