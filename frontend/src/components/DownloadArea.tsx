import React from 'react';

interface DownloadAreaProps {
  jobId: string;
  outputFilename: string;
  onDownload: () => void;
}

const DownloadArea: React.FC<DownloadAreaProps> = ({ jobId, outputFilename, onDownload }) => {

  // Remove direct URL construction
  // const downloadUrl = `/api/download/${jobId}`;

  return (
    <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '4px' }}>
      <h3>Processing Complete!</h3>
      <p>Your adjusted audio file is ready for download.</p>
      <button
        onClick={onDownload}
        style={{
            display: 'inline-block',
            padding: '0.6rem 1.2rem',
            backgroundColor: 'var(--accent)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            marginRight: '1rem',
            marginBottom: '1rem',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontSize: '1em',
            fontFamily: 'inherit'
        }}
      >
        Download Processed File
      </button>
      <p style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>Filename: {outputFilename}</p>

      {/* Reset button is now handled in App.tsx based on status */}
      {/* <button onClick={onReset} style={{ marginLeft: '1rem' }}>Start New Job</button> */}
    </div>
  );
};

export default DownloadArea;