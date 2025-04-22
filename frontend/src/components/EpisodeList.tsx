import React, { useRef, useEffect, useCallback } from 'react';
import { PodcastEpisode } from '../interfaces';

interface Props {
    episodes: PodcastEpisode[];
    onSelectEpisode: (ep: PodcastEpisode) => void;
    isLoading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
}

const EpisodeList: React.FC<Props> = ({ episodes, onSelectEpisode, isLoading, hasMore, onLoadMore }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollThreshold = 200;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < scrollThreshold;

        if (isNearBottom && !isLoading && hasMore) {
            console.log('[EpisodeList] Scroll near bottom detected, calling onLoadMore...');
            onLoadMore();
        }
    }, [isLoading, hasMore, onLoadMore]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            console.log('[EpisodeList] Scroll listener added.');

            return () => {
                container.removeEventListener('scroll', handleScroll);
                console.log('[EpisodeList] Scroll listener removed.');
            };
        }
    }, [handleScroll]);

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
                {episodes.map(ep => (
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
                            Select
                        </button>
                    </div>
                ))}

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
