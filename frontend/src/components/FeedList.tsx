import React from 'react';
import type { PodcastFeed } from '~/common/types';

interface Props {
    feeds: PodcastFeed[];
    onSelect: (feed: PodcastFeed) => void;
}

const truncate = (txt: string, len = 120) =>
    txt.length > len ? txt.slice(0, len) + '...' : txt;

const FeedList: React.FC<Props> = ({ feeds, onSelect }) => {
    if (!feeds.length) return null;

    return (
        <div
            style = {{
                display: 'grid',
                gap: '1rem',
                marginTop: '1.5rem',
                gridTemplateColumns: 'repeat(auto-fill,minmax(260px, 1fr))',
            }}
        >
            {feeds.map((feed) => (
                <div
                    key={feed.id}
                    onClick={() => {
                        console.log('[FeedList] Feed selected:', feed);
                        onSelect(feed);
                    }}
                    className="show-card"
                    style={{
                        cursor: 'pointer',
                        background: 'var(--bg-secondary, #1e1e1e)',
                        border: '1px solid var(--border, #333)',
                        borderRadius: '6px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <img
                        src={feed.image}
                        alt={feed.title}
                        style={{
                            width: '100%',
                            height: '140px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            marginBottom: '0.75rem',
                        }}
                        loading="lazy"
                    />
                    <h4 style={{ margin: 0, marginBottom: '0.5rem' }}>{feed.title}</h4>
                    <p style={{ fontSize: '0,85rem', lineHeight: '1.4' }}>
                        {truncate(feed.description)}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default FeedList;
