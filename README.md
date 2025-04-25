# PodPace - Podcast Speech Normalization

This application allows users to upload podcast audio files, analyze speaker WPM, and adjust speech speed per speaker.

I made this because listening to a podcast at 2x speed with Larry Summers was unbearable, he was so slow and going higher made other people too hard to understand

## Prerequisites

Before running the application, ensure you have the following installed on your system:

*  **Assembly.ai:** Sign up for the free tier and get an api key
*   **Bun:** Follow the installation instructions at [https://bun.sh/docs/installation](https://bun.sh/docs/installation)
*   **ffmpeg:** Required for audio file manipulation.
    *   Debian/Ubuntu: `sudo apt update && sudo apt install ffmpeg`
    *   macOS (Homebrew): `brew install ffmpeg`
    *   Other: Use your system's package manager or download from [https://ffmpeg.org/](https://ffmpeg.org/)
*   **rubberband-cli:** Required for high-quality time-stretching.
    *   Debian/Ubuntu: `sudo apt update && sudo apt install rubberband-cli`
    *   macOS (Homebrew): `brew install rubberband`
    *   Other: Use your system's package manager or find instructions at [https://breakfastquay.com/rubberband/](https://breakfastquay.com/rubberband/)
*   **Redis:** Required for the task queue message broker and job state management. Ensure a Redis server is running and accessible.
    *   Docker (recommended): `docker run -d -p 6379:6379 redis:latest`
    *   Or install via package manager (e.g., `sudo apt install redis-server`).

## Setup

1.  **Navigate to Project Directory:**
    Ensure you are in the `PodPace` directory.
    ```bash
    cd /path/to/your/dev/PodPace
    ```
2.  **Install Backend Dependencies:**
    ```bash
    cd backend
    bun install
    cd ..
    ```
3.  **Install Frontend Dependencies:**
    ```bash
    cd PodPace/frontend
    bun install
    cd ..
    ```
4.  **Configure Environment Variables:**
    Create a `.env` file in the `backend` directory (`PodPace/backend/.env`) and add the following variables:

    ```dotenv
    # Redis Connection
    REDIS_HOST=127.0.0.1
    REDIS_PORT=6379
    # REDIS_PASSWORD= (optional)

    # Cloud ASR/Diarization Provider (e.g., AssemblyAI)
    ASSEMBLYAI_API_KEY=<YOUR_ASSEMBLYAI_API_KEY>

    # PodcastIndex
    PODCAST_INDEX_API_KEY=<YOUR_PODCASTINDEX_API_KEY>
    PODCAST_INDEX_API_SECRET=<YOUR_PODCASTINDEX_API_SECRET>


    # Define upload/output directories (optional, defaults are within backend/)
    # UPLOAD_DIR=./uploads
    # OUTPUT_DIR=./output

    # API Port (Optional, defaults to 3000)
    # API_PORT=3000
    ```

    *Note: The frontend uses Vite's proxy. No frontend-specific environment variables are needed for the API connection by default.*

## Running the Application

This command uses `concurrently` to start the backend API, both backend workers, and the frontend development server all at once.

1.  **Start Redis:** Ensure your Redis server is running.

2.  **Start All Services:**
    From the root `PodPace/` directory, run:
    ```bash
    bun run dev
    ```
    *   You will see interleaved logs from all four processes in your terminal.
    *   The frontend development server typically runs on `http://localhost:5173`.
    *   Open the URL provided for the frontend dev server in your web browser.


![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/jamesjmcconnell/PodPace?utm_source=oss&utm_medium=github&utm_campaign=jamesjmcconnell%2FPodPace&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
