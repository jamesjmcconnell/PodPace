import { useState, KeyboardEvent } from 'react';

interface Props {
    onSearch: (query: string) => void;
}

const SearchBar: React.FC<Props> = ({ onSearch }) => {
    const [q, setQ] = useState('');

    const search = () => {
        if (q.trim()) onSearch(q.trim());
    };

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') search();
    };

    return (
        <div style ={{ textAlign: 'center', marginTop: '1rem' }}>
            <input
                type="text"
                placeholder="Search..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={handleKey}
                style={{
                    padding: '0.6rem 0.8rem',
                    minWidth: '260px',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    marginRight: '0.5rem',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                }}
            />        
            <button onClick={search} style={{ padding: '0.6rem 1.2rem' }}>
                Smash it
            </button>
        </div>
    );
};

export default SearchBar;
