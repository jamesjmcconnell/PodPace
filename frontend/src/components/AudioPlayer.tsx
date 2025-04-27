import React from 'react';

interface AudioPlayerProps {
  /** URL to stream the processed MP3 */
  src: string;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Simple HTML5 audio player for in-app streaming.
 * Shows native controls and fills its container’s width.
 */
export default function AudioPlayer({
  src,
  className
}: AudioPlayerProps) {
  return (
    <audio
      controls
      className={className}
      style={{ width: '100%' }}
      src={src}
    />
  );
}

