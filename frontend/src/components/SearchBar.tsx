import React, { useState } from 'react';

interface SearchBarProps {
    onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
    const [query, setQuery] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    return (
        <div style={styles.searchContainer}>
            <form onSubmit={handleSubmit} style={styles.form}>
                <input
                    type="search"
                    placeholder="Search for podcasts..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={styles.input}
                />
                <button type="submit" style={styles.button} disabled={!query.trim()}>
                    Search
                </button>
            </form>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    searchContainer: {
        padding: '1.5rem',
        marginBottom: '1.5rem',
        background: 'none',
        border: 'none',
        borderRadius: '8px',
    },
    form: {
        display: 'flex',
        gap: '0.5rem',
    },
    input: {
        flexGrow: 1,
        padding: '0.75rem 1rem',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        fontSize: '1rem',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
    },
    button: {
        padding: '0.75rem 1.5rem',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        background: 'var(--accent)',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '1rem',
    }
};

export default SearchBar;
