import React, { useRef, useEffect, useCallback } from 'react';
import type { PodcastEpisode } from '~/common/types';
import { useThrottle } from '../hooks/useThrottle';

interface Props {
    episodes: PodcastEpisode[];
    onSelectEpisode: (ep: PodcastEpisode) => void;
    isLoading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    selectingEpisodeId: string | null;
}

const EpisodeList: React.FC<Props> = ({ episodes, onSelectEpisode, isLoading, hasMore, onLoadMore, selectingEpisodeId }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const THROTTLE_DELAY = 1000;

    const checkScrollPosition = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollThreshold = 200;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < scrollThreshold;

        if (isNearBottom && !isLoading && hasMore) {
            console.log('[EpisodeList] Throttled check: Near bottom, calling onLoadMore...');
            onLoadMore();
        }
    }, [isLoading, hasMore, onLoadMore]);

    const throttledScrollHandler = useThrottle(checkScrollPosition, THROTTLE_DELAY);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', throttledScrollHandler);
            console.log('[EpisodeList] Throttled scroll listener added.');
            return () => {
                container.removeEventListener('scroll', throttledScrollHandler);
                console.log('[EpisodeList] Throttled scroll listener removed.');
            };
        }
    }, [throttledScrollHandler]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container && container.scrollHeight <= container.clientHeight && !isLoading && hasMore) {
             console.log('[EpisodeList] Initial content doesn\'t fill view, calling onLoadMore...');
             onLoadMore();
        }
    }, [episodes, isLoading, hasMore, onLoadMore]);

    if (isLoading && episodes.length === 0) {
        return <p>Loading episodes...</p>;
    }

    if (!episodes.length) {
        return <p style={{ marginTop: '1rem' }}>No episodes available for this feed.</p>;
    }

    return (
        <>
            <div
                ref={scrollContainerRef}
                style = {{
                    maxHeight: '600px',
                    overflow: 'auto',
                    marginTop: '1rem',
                    padding: '1rem',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                }}
            >
                {episodes.map(ep => {
                    const isSelectingThis = selectingEpisodeId === ep.id;
                    return (
                        <div
                            key={ep.id}
                            style = {{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.5rem 0',
                                borderBottom: '1px solid var(--border)',
                            }}
                        >
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 500 }}>
                                    {ep.title}
                                </div>
                                <div style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--text-muted)',
                                    marginTop: '0.2rem',
                                    textAlign: 'left',
                                    paddingLeft: 0,
                                    marginLeft: 0
                                 }}>
                                    {ep.datePublishedPretty}
                                </div>
                            </div>
                            <button
                                onClick={() => onSelectEpisode(ep)}
                                disabled={isSelectingThis || selectingEpisodeId !== null}
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    marginLeft: '1rem'
                                }}
                            >
                                {isSelectingThis ? 'Selecting...' : 'Select'}
                            </button>
                        </div>
                    );
                })}

                {isLoading && episodes.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                        Loading more episodes...
                    </div>
                )}

                {!hasMore && episodes.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                         End of episodes.
                    </div>
                )}
            </div>
        </>
    );
};

export default EpisodeList;
