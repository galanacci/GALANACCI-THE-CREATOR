GALANACCI PLAYLIST DOWNLOADER — WINDOWS

1. Extract the entire ZIP to a folder (do not run it inside the ZIP).
2. Double-click START_DOWNLOADER.bat.
3. Paste a Spotify playlist or YouTube video/playlist URL, choose a folder and click Download / Resume audio.

RESUMING AN INTERRUPTED PLAYLIST
Use the same playlist link AND the same music folder as before (for example D:\MUSIC).
Click Download / Resume audio. You do not need to start at a particular song.
Every Spotify run scans the folder first, checking MP3 metadata and filename track IDs.
Completed tracks are skipped, including files made by the original launcher.
An interrupted run is checked again next time, even after a forced cancellation.
Renamed files are recognised if their embedded Spotify source metadata is retained.
Keep the [track ID] in filenames as a fallback when editing metadata.
Completed files are never overwritten. Spotify files with invalid or unfinished MP3
headers are preserved in Incomplete_Downloads so they can be downloaded again.
Files that cannot be accessed are logged for manual review.
YouTube downloads also keep a completion archive and preserve completed files.
Failed Spotify tracks are listed in spotify-failed-tracks.txt after a run finishes.
Detailed provider errors are saved continuously to spotify-download-details.log,
including when the run is cancelled. Failed tracks stay eligible on the next run.
Scanning prevents repeat downloads; it cannot make unavailable sources downloadable.

YouTube links preserve the exact video/performance, including live versions.
A video link downloads only that video, even when it contains a playlist parameter.
To download a full YouTube playlist, use its /playlist?list=... link.

Requires Python 3.12 (with Tcl/Tk) and FFmpeg on PATH.
The first download creates a local .venv and installs the required tool automatically:
spotDL for Spotify playlists, yt-dlp for exact YouTube videos and playlists.
Deno is installed privately by spotDL when needed for Spotify's YouTube providers.
Keep START_DOWNLOADER.bat, playlist_launcher.py and download_playlist.py together.
Completed MP3 files are kept if a download is cancelled.
Spotify artwork and lyrics depend on provider availability.
YouTube downloads embed available video metadata and the thumbnail, not Spotify lyrics.

This tool matches Spotify playlist metadata to external audio providers.
YouTube links are downloaded directly without Spotify matching.
Official setup and troubleshooting:
https://spotdl.github.io/spotify-downloader/installation/
