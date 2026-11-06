GALANACCI PLAYLIST DOWNLOADER — WINDOWS

1. Extract the entire ZIP to a folder (do not run it inside the ZIP).
2. Double-click START_DOWNLOADER.bat.
3. Paste a Spotify playlist or YouTube video/playlist URL, choose a folder and click Download audio.

YouTube links preserve the exact video/performance, including live versions.
A video link downloads only that video, even when it contains a playlist parameter.
To download a full YouTube playlist, use its /playlist?list=... link.

Requires Python 3.12 (with Tcl/Tk) and FFmpeg on PATH.
The first download creates a local .venv and installs the required tool automatically:
spotDL for Spotify playlists, yt-dlp for exact YouTube videos and playlists.
Keep START_DOWNLOADER.bat, playlist_launcher.py and download_playlist.py together.
Completed MP3 files are kept if a download is cancelled.
Spotify artwork and lyrics depend on provider availability.
YouTube downloads embed available video metadata and the thumbnail, not Spotify lyrics.

This tool matches Spotify playlist metadata to external audio providers.
YouTube links are downloaded directly without Spotify matching.
Official setup and troubleshooting:
https://spotdl.github.io/spotify-downloader/installation/
