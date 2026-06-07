import React, { useEffect, useMemo, useState } from 'react';
import PageAnimator from '../components/PageAnimator';
import { supabase } from '../config/supabaseClient';
import { useLanguage } from '../context/LanguageContext';

interface PlayerData {
  id: string;
  ign: string;
  discord_id: string | null;
  region: string;
  points: number;
  combat_rank: string;
  player_ranks: {
    category: string;
    tier: string;
  }[];
}

const TIER_ORDER: Record<string, number> = {
  'HT1': 1, 'LT1': 2,
  'HT2': 3, 'LT2': 4,
  'HT3': 5, 'LT3': 6,
  'HT4': 7, 'LT4': 8,
  'HT5': 9, 'LT5': 10,
  'UNRANKED': 99
};

const CATEGORIES = ['OVERALL', 'SWORD', 'AXE', 'MACE', 'SPEAR MACE', 'SMP', 'DIA SMP', 'CART PVP', 'VANILLA', 'NETHOP'];

const getTierTone = (tier?: string) => {
  if (!tier || tier === 'UNRANKED') return 'border-outline bg-surface-container text-on-surface-variant';
  if (tier.startsWith('HT')) return 'border-blue-600 bg-blue-600/20 text-blue-300';
  return 'border-error bg-error-container/40 text-red-200';
};

const getPodiumTone = (index: number) => {
  if (index === 0) return 'from-yellow-400/25 via-surface-container-high to-surface-container-high ring-yellow-400/50';
  if (index === 1) return 'from-zinc-200/20 via-surface-container-high to-surface-container-high ring-zinc-200/40';
  if (index === 2) return 'from-orange-400/20 via-surface-container-high to-surface-container-high ring-orange-400/40';
  return 'from-surface-container-high via-surface-container-high to-surface-container';
};

const CategoryIcon = ({ category, className = 'h-8 w-8' }: { category: string; className?: string }) => (
  <img
    src={`/icons/categories/${category.toLowerCase()}.svg`}
    alt=""
    className={`${className} object-contain drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]`}
    onError={(event) => {
      const target = event.target as HTMLImageElement;
      if (target.src.endsWith('.svg')) {
        target.src = `/icons/categories/${category.toLowerCase()}.png`;
      } else {
        target.style.display = 'none';
      }
    }}
  />
);

const StatCard = ({ icon, label, value, accent }: { icon: string; label: string; value: React.ReactNode; accent: string }) => (
  <div className="rounded-3xl border-[3px] border-black bg-surface-container-high p-4 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]">
    <div className="flex items-center justify-between gap-3">
      <span className="font-headline-md text-3xl text-white">{value}</span>
      <span className={`material-symbols-outlined rounded-2xl border-2 border-black p-2 text-2xl text-white ${accent}`}>{icon}</span>
    </div>
    <p className="mt-2 font-label-caps text-[11px] text-on-surface-variant">{label}</p>
  </div>
);

const TierList: React.FC = () => {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0]);
  const [playersData, setPlayersData] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchTierList = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('players')
        .select(`
          id,
          ign,
          discord_id,
          region,
          points,
          combat_rank,
          player_ranks (
            category,
            tier
          )
        `);

      if (error) {
        console.error('Error fetching tier list:', error);
        setPlayersData([]);
      } else {
        let filteredData = [...((data as unknown as PlayerData[]) || [])];

        if (activeCategory === 'OVERALL') {
          // Sort overall by points descending
          filteredData.sort((a, b) => b.points - a.points);
        } else {
          // Filter players who have a rank in the active category
          filteredData = filteredData.filter(p => 
            p.player_ranks.some(r => r.category === activeCategory)
          );
          
          // Sort by the specific category's tier, then by points
          filteredData.sort((a, b) => {
            const rankA = a.player_ranks.find(r => r.category === activeCategory)?.tier || 'UNRANKED';
            const rankB = b.player_ranks.find(r => r.category === activeCategory)?.tier || 'UNRANKED';
            
            const orderA = TIER_ORDER[rankA] || 99;
            const orderB = TIER_ORDER[rankB] || 99;
            
            if (orderA !== orderB) return orderA - orderB;
            return b.points - a.points;
          });
        }

        // Sort player_ranks array to match CATEGORIES order
        filteredData.forEach(p => {
          p.player_ranks.sort((r1, r2) => {
            const idx1 = CATEGORIES.indexOf(r1.category);
            const idx2 = CATEGORIES.indexOf(r2.category);
            return idx1 - idx2;
          });
        });

        setPlayersData(filteredData);
      }
      setLoading(false);
    };

    fetchTierList();
  }, [activeCategory]);

  const topPlayer = playersData[0];
  const rankedSlots = useMemo(() => playersData.reduce((total, player) => total + player.player_ranks.length, 0), [playersData]);

  return (
    <PageAnimator className="relative flex-grow overflow-hidden px-4 py-8 sm:px-margin">
      <div className="pointer-events-none absolute left-[-8rem] top-24 h-72 w-72 rounded-full bg-primary-container/20 blur-3xl"></div>
      <div className="pointer-events-none absolute right-[-10rem] top-[34rem] h-80 w-80 rounded-full bg-secondary-container/20 blur-3xl"></div>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-margin">
      {/* Page Header */}
      <div>
        <header className="relative overflow-hidden rounded-[2rem] border-[4px] border-black bg-surface-container shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
          <div className="absolute inset-0 bg-surface-container-lowest" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.18) 2px, transparent 2px)', backgroundSize: '26px 26px', opacity: 0.4 }}></div>
          <div className="absolute -left-16 top-12 h-44 w-44 rotate-12 rounded-[2rem] border-4 border-black bg-primary-container opacity-90"></div>
          <div className="absolute -right-12 -top-14 h-56 w-56 rounded-full border-4 border-black bg-blue-600 opacity-90"></div>
          <div className="absolute bottom-8 right-12 hidden h-28 w-28 rotate-45 rounded-3xl border-4 border-black bg-tertiary opacity-80 md:block"></div>

          <div className="relative z-10 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
            <div className="flex flex-col items-start gap-5">
              <div className="inline-flex -rotate-2 items-center gap-2 rounded-2xl border-[3px] border-black bg-primary-container px-3 py-2 font-label-caps text-label-caps text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <span className="material-symbols-outlined text-[18px]">military_tech</span>
                {t('tierlist.title')}
              </div>

              <div>
                <h1 className="font-headline-lg text-[52px] leading-[0.9] tracking-tighter text-white drop-shadow-[5px_5px_0px_rgba(0,0,0,1)] sm:text-[76px] lg:text-[96px]">
                  BROSKI
                  <span className="block text-primary-container">TIERS</span>
                </h1>
                <p className="mt-4 max-w-2xl rounded-3xl border-[3px] border-black bg-surface-container-high p-4 font-body-lg font-bold text-on-surface-variant shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]">
                  {t('tierlist.subtitle')}
                </p>
              </div>

              <div className="flex w-full flex-wrap gap-3">
                <a href="#leaderboard" className="inline-flex items-center gap-2 rounded-2xl border-[3px] border-black bg-secondary-container px-5 py-3 font-headline-md text-[16px] text-white shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none">
                  {t('tierlist.cta.leaderboard')}
                  <span className="material-symbols-outlined">arrow_downward</span>
                </a>
                <div className="inline-flex items-center gap-2 rounded-2xl border-[3px] border-black bg-surface-bright px-4 py-3 font-label-caps text-xs text-on-surface shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]">
                  <span className="material-symbols-outlined text-[18px] text-tertiary">bolt</span>
                  {activeCategory === 'OVERALL' ? t('tierlist.category.overall') : activeCategory}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatCard icon="groups" label={t('tierlist.stats.total')} value={loading ? '...' : playersData.length} accent="bg-blue-600" />
              <StatCard icon="emoji_events" label={t('tierlist.stats.top')} value={topPlayer?.ign || 'N/D'} accent="bg-secondary-container" />
              <StatCard icon="stars" label={t('tierlist.stats.avg')} value={loading ? '...' : rankedSlots} accent="bg-tertiary !text-black" />
            </div>
          </div>
        </header>
      </div>

      <div className="flex flex-col gap-margin">
        {/* Main Content Area */}
        <section className="flex flex-col gap-margin">
          {/* Filter Tabs */}
          <div>
            <div className="rounded-[2rem] border-[3px] border-black bg-surface-container-low p-4 shadow-[7px_7px_0px_0px_rgba(0,0,0,1)]">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-label-caps text-[11px] text-tertiary">{t('tierlist.filter.mode')}</p>
                  <h2 className="font-headline-md text-2xl uppercase text-white sm:text-3xl">{t('tierlist.filter.choose')}</h2>
                </div>
                <p className="max-w-xl font-body-sm text-sm font-bold text-on-surface-variant">
                  {t('tierlist.filter.hint')}
                </p>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-3">
                {CATEGORIES.map((cat) => (
                  <button 
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`min-w-[112px] flex-shrink-0 rounded-2xl border-[3px] border-black px-4 py-3 font-label-caps text-label-caps transition-all ${
                      activeCategory === cat 
                        ? 'translate-x-[2px] translate-y-[2px] bg-primary-container text-white shadow-none' 
                        : 'bg-surface-bright text-on-surface shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:bg-surface-variant'
                    }`}
                  >
                    <div className="mb-2 flex h-10 items-center justify-center">
                      <CategoryIcon category={cat} />
                    </div>
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Leaderboard List */}
          <div>
            <div id="leaderboard" className="flex min-h-[400px] flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-[2rem] border-[3px] border-black bg-surface-container-low p-4 shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-label-caps text-[11px] text-tertiary">{t('tierlist.leaderboard.active')}</p>
                  <h2 className="font-headline-md text-2xl uppercase text-white sm:text-3xl">
                    {activeCategory === 'OVERALL' ? t('tierlist.category.overall') : activeCategory}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-2xl border-2 border-black bg-surface-bright px-3 py-2 font-label-caps text-[11px] text-on-surface shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    {loading ? 'SYNC...' : `${playersData.length} PLAYER`}
                  </span>
                  <span className="rounded-2xl border-2 border-black bg-green-500 px-3 py-2 font-label-caps text-[11px] text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    LIVE DATA
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-[2rem] border-[4px] border-black bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"></div>
                  ))}
                </div>
              ) : playersData.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-[2rem] border-4 border-dashed border-black bg-surface-container-high p-8 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                  <span className="material-symbols-outlined mb-3 rounded-3xl border-2 border-black bg-surface-bright p-4 text-5xl text-on-surface-variant shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">person_off</span>
                  <span className="font-headline-md text-2xl text-on-surface">{t('tierlist.empty')}</span>
                  <p className="mt-2 max-w-md font-body-sm text-on-surface-variant">{t('tierlist.empty.hint')}</p>
                </div>
              ) : (
                playersData.map((player, index) => {
                  const mainRank = activeCategory === 'OVERALL' 
                    ? player.player_ranks[0] // Just pick the first or default if we want to show a specific color, or use Combat Rank
                    : player.player_ranks.find(r => r.category === activeCategory);
                  
                  const isTop3 = index < 3;
                  const rankColor = index === 0 ? 'text-yellow-400' : index === 1 ? 'text-zinc-300' : index === 2 ? 'text-orange-400' : 'text-outline-variant';

                  return (
                    <div key={player.id} title={mainRank ? `${mainRank.category}: ${mainRank.tier}` : player.ign} className={`group relative overflow-hidden rounded-[2rem] border-4 border-black bg-gradient-to-r p-4 shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] ${getPodiumTone(index)} ${isTop3 ? 'ring-2' : ''}`}>
                      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.22) 0 12%, transparent 12% 24%, rgba(255,255,255,0.12) 24% 36%, transparent 36% 100%)', backgroundSize: '42px 42px' }}></div>
                      
                      <div className="relative z-10 flex flex-col items-stretch gap-5 lg:grid lg:grid-cols-[1fr_auto_1.2fr] lg:items-center">
                        {/* Left: Rank, Avatar, Name */}
                        <div className="flex min-w-0 items-center gap-4">
                          <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border-[3px] border-black bg-surface-container-low font-headline-lg text-4xl font-black drop-shadow-[2px_2px_0px_rgba(0,0,0,1)] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${rankColor}`}>
                            {index + 1}
                          </span>
                          <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-3xl border-[3px] border-black bg-zinc-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            <img 
                              alt={`${player.ign} Avatar`} 
                              className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-110" 
                              src={`https://mc-heads.net/body/${player.ign}/100`} 
                            />
                          </div>
                          <div className="flex min-w-0 flex-col gap-2">
                            <span className="break-words font-headline-md text-2xl uppercase leading-none text-on-surface sm:text-3xl">{player.ign}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-2xl border-2 border-black bg-surface-container px-3 py-1 font-body-sm text-sm font-bold text-on-surface-variant shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                <span className="material-symbols-outlined text-[16px] text-yellow-400">stars</span>
                                {player.combat_rank}
                              </span>
                              <span className="rounded-2xl border-2 border-black bg-primary-container px-3 py-1 font-label-caps text-[10px] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                {player.points} PTS
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Middle: Region + Overall */}
                        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:justify-center">
                          <span className={`rounded-2xl border-2 border-black px-3 py-2 font-label-caps text-[11px] font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${player.region === 'NA' ? 'bg-error text-white' : 'bg-primary text-white'}`}>
                            {player.region}
                          </span>
                          {/* OVERALL sempre visibile con icona coppa */}
                          {(() => {
                            const overallRank = player.player_ranks.find(r => r.category === 'OVERALL');
                            const overallTier = overallRank?.tier || 'UNRANKED';
                            const overallTone = getTierTone(overallTier);
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-2xl border-2 px-3 py-2 font-label-caps text-[11px] font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${overallTone}`}>
                                <span className="material-symbols-outlined text-[14px]">trophy</span>
                                OVERALL · {overallTier}
                              </span>
                            );
                          })()}
                        </div>

                        {/* Right: Tiers - 2 righe da 5 categorie (senza OVERALL) */}
                        <div className="flex flex-col items-start gap-2 lg:items-end">
                          <p className="font-label-caps text-[10px] text-on-surface-variant">Tier del player</p>
                          {(() => {
                            // Categorie escludendo OVERALL, tutte visibili anche se UNRANKED
                            const displayCategories = CATEGORIES.filter(c => c !== 'OVERALL');
                            const firstRow = displayCategories.slice(0, 5);
                            const secondRow = displayCategories.slice(5, 10);
                            
                            const getRankForCat = (cat: string) => {
                              const found = player.player_ranks.find(r => r.category === cat);
                              return found?.tier || 'UNRANKED';
                            };
                            
                            return (
                              <div className="flex flex-col gap-2">
                                {/* Prima riga - 5 categorie */}
                                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                                  {firstRow.map(cat => {
                                    const tier = getRankForCat(cat);
                                    const tierTone = getTierTone(tier);
                                    return (
                                      <div key={cat} className={`flex min-w-[70px] items-center gap-1.5 rounded-xl border-2 px-2 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${tierTone}`} title={cat}>
                                        <CategoryIcon category={cat} className="h-4 w-4" />
                                        <div className="flex flex-col leading-none">
                                          <span className="font-label-caps text-[8px]">{cat}</span>
                                          <span className="font-headline-md text-[12px]">{tier}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Seconda riga - 5 categorie */}
                                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                                  {secondRow.map(cat => {
                                    const tier = getRankForCat(cat);
                                    const tierTone = getTierTone(tier);
                                    return (
                                      <div key={cat} className={`flex min-w-[70px] items-center gap-1.5 rounded-xl border-2 px-2 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${tierTone}`} title={cat}>
                                        <CategoryIcon category={cat} className="h-4 w-4" />
                                        <div className="flex flex-col leading-none">
                                          <span className="font-label-caps text-[8px]">{cat}</span>
                                          <span className="font-headline-md text-[12px]">{tier}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Load More Button */}
              {!loading && playersData.length > 0 && (
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="mt-stack-md w-full rounded-2xl border-[3px] border-black bg-zinc-900 py-4 font-label-caps text-label-caps text-on-surface-variant shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 hover:bg-zinc-800 active:translate-x-1 active:translate-y-1 active:shadow-none">
                  TORNA AI FILTRI
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
      </div>
    </PageAnimator>
  );
};

export default TierList;
