import { PodcastEpisode } from './interfaces';

interface Props {
    episodes: PodcastEpisode[];
    onSelectEpisode: (ep: PodcastEpisode) => void;
}

const EpisodeList: React.FC<Props> = ({ episodes, onSelectEpisode }) => {
    if (!episodes.length) {
        return <p style={{ marginTop: '1rem' }}>No episodes available.</p>;
    }

    return (
        <div
            style = {{
                maxHeight: '400px',
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
                    <div>
                        <div style={{ fontWeight: 500 }}>
                            {ep.title}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {new Date(ep.datePublished).toLocaleDateString()}    
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
                        }}
                    >
                        Select
                    </button>
                </div>
            ))}
        </div>
    );
};

export default EpisodeList;
