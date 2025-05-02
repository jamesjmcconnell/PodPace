import React from 'react';

interface BannerProps {
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  className?: string;
}

const Banner: React.FC<BannerProps> = ({ message, type, className }) => {
  if (!message) {
    return null;
  }

  const baseStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
    borderRadius: '4px',
    border: '1px solid',
    textAlign: 'center',
  };

  let specificStyle: React.CSSProperties = {};

  switch (type) {
    case 'warning':
      specificStyle = {
        borderColor: 'orange',
        backgroundColor: '#fff3e0', // Light orange background
        color: '#e65100', // Dark orange text
      };
      break;
    case 'error': // Use for upgrade prompts too maybe?
       specificStyle = {
        borderColor: 'var(--accent, orange)', // Use accent or fallback
        backgroundColor: 'rgba(255, 183, 77, 0.1)', // Light accent bg
        color: 'var(--accent, orange)',
      };
      break;
    // Add 'info', 'success' styles if needed later
    default:
       specificStyle = {
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-secondary-alt)',
        color: 'var(--text-primary)',
      };
  }

  return (
    <div style={{ ...baseStyle, ...specificStyle }} className={className}>
      {message}
    </div>
  );
};

export default Banner;