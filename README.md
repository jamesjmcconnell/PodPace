# PodPace - Podcast Speech Normalization

This application allows users to upload podcast audio files, analyze speaker WPM, and adjust speech speed per speaker.

I made this because listening to a podcast at 2x speed with Larry Summers was unbearable, he was so slow and going higher made other people too hard to understand

## Prerequisites

Before running the application, ensure you have the following installed and configured:

*   **Bun:** [https://bun.sh/docs/installation](https://bun.sh/docs/installation)
*   **ffmpeg:** Required for audio file manipulation. (`sudo apt install ffmpeg` / `brew install ffmpeg`)
*   **rubberband-cli:** Required for high-quality time-stretching. (`sudo apt install rubberband-cli` / `brew install rubberband`)
*   **Redis:** Required for task queue & job state. Ensure a server is running (e.g., `docker run -d -p 6379:6379 redis:latest`).
*   **Supabase Project:**
    *   Create a project at [supabase.com](https://supabase.com).
    *   Enable Authentication Providers: Go to Authentication -> Providers and enable **Email** (with Magic Link), **Google**, and **Twitter (X)**. Follow the instructions to add the required Client IDs/Secrets from Google Cloud Console / X Developer Portal. Ensure the Supabase Redirect URI is added to your Google/X app configurations.
    *   Note your Supabase **Project URL** and **anon key** (from Project Settings -> API).
*   **AssemblyAI API Key:** Sign up and get an API key for transcription/diarization.
*   **Podcast Index API Key & Secret:** Sign up at [podcastindex.org](https://podcastindex.org/) and get an API Key and Secret for podcast searching.

## Setup

1.  **Navigate to Project Directory:**
    ```bash
    cd /path/to/PodPace
    ```
2.  **Install Dependencies:**
    ```bash
    # Backend
    cd backend
    bun install
    cd ..
    # Frontend
    cd frontend
    bun install
    cd ..
    ```
3.  **Configure Frontend Environment (`frontend/.env`):**
    Create a file named `.env` inside the `frontend` directory and add your Supabase credentials (prefixed with `VITE_`):
    ```dotenv
    VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
    VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    ```
    Replace the placeholders with your actual Supabase Project URL and anon key.

4.  **Configure Backend Environment (`backend/set_env.sh`):**
    *   A script `backend/set_env.sh` is provided to handle environment variables, especially those with special characters.
    *   **Edit `backend/set_env.sh`:** Open this file and replace the placeholder values for `PODCAST_INDEX_API_KEY`, `PODCAST_INDEX_API_SECRET`, `ASSEMBLYAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` with your actual credentials. Ensure the `PODCAST_INDEX_API_SECRET` value is enclosed in single quotes.
    *   Optionally, uncomment and set `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` if they differ from the defaults (`127.0.0.1:6379`, no password).

## Running the Application

1.  **Start Redis:** Ensure your Redis server is running.
2.  **Set Backend Environment Variables:** Open a terminal in the `backend` directory and run:
    ```bash
    source set_env.sh
    ```
    *(Note: You must run this `source` command in the same terminal session where you will start the backend in the next step.)*
3.  **Start All Services:**
    From the root `PodPace/` directory, run:
    ```bash
    bun run dev
    ```
    *   This uses `concurrently` to start the backend API, workers, and frontend dev server.
    *   The frontend typically runs on `http://localhost:5173`.
    *   Open this URL in your browser. You will be prompted to log in.

## Authentication

The application now uses Supabase for authentication. Users can sign up or log in using:
*   **Email Magic Link:** Enter email, click link in email.
*   **Google Login:** Click button, authenticate with Google.
*   **X (Twitter) Login:** Click button, authenticate with X.

Protected backend API routes now require a valid authentication token obtained after login.

