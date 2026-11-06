"""Download Spotify playlists or exact YouTube videos/playlists as MP3 files."""

PLAYLIST_URL = "YOUR_SPOTIFY_PLAYLIST_URL_HERE"

import importlib.util
import argparse
import logging
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, urlparse

OUTPUT_DIR = Path(__file__).resolve().parent / "Downloaded_Music"


def get_source(url: str) -> str:
    """Validate supported links and distinguish a video from its playlist context."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        query = parse_qs(parsed.query)
    except ValueError:
        raise ValueError("Invalid URL. Paste a Spotify playlist or YouTube link.") from None
    if parsed.scheme != "https" or parsed.username or parsed.password:
        raise ValueError("Use an HTTPS Spotify playlist or YouTube link.")
    if host == "open.spotify.com" and re.fullmatch(r"/playlist/[A-Za-z0-9]{22}/?", parsed.path):
        return "spotify"
    if host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}:
        if parsed.path.rstrip("/") == "/playlist" and re.fullmatch(r"[A-Za-z0-9_-]{10,100}", query.get("list", [""])[0]):
            return "youtube-playlist"
        video_id = ""
        if host in {"youtu.be", "www.youtu.be"}:
            video_id = parsed.path.strip("/")
        elif parsed.path.rstrip("/") == "/watch":
            video_id = query.get("v", [""])[0]
        else:
            match = re.fullmatch(r"/(?:shorts|live)/([A-Za-z0-9_-]{11})/?", parsed.path)
            if match:
                video_id = match.group(1)
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            return "youtube-video"
    raise ValueError("Paste a Spotify playlist, YouTube video, or YouTube playlist link.")


def main(playlist_url: str | None = None, output_dir: Path | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    url = (playlist_url if playlist_url is not None else PLAYLIST_URL).strip()
    output_dir = output_dir if output_dir is not None else OUTPUT_DIR
    if not url or url == "YOUR_SPOTIFY_PLAYLIST_URL_HERE":
        logging.error("Set PLAYLIST_URL at the top of this script, then run it again.")
        return 2
    try:
        source = get_source(url)
    except ValueError as error:
        logging.error("%s", error)
        return 2

    # FFmpeg must be installed and on your local system PATH for audio conversion.
    if shutil.which("ffmpeg") is None:
        logging.error("FFmpeg is missing from PATH. Install it, reopen your terminal, and retry.")
        return 1

    action = "checking prerequisites"
    try:
        subprocess.run(["ffmpeg", "-version"], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        module, package = ("spotdl", "spotdl") if source == "spotify" else ("yt_dlp", "yt-dlp[default]")
        if importlib.util.find_spec(module) is None:
            action = f"installing {package}"
            logging.info("Installing %s for this Python interpreter...", package)
            subprocess.run([sys.executable, "-m", "pip", "install", package], check=True)

        output_dir.mkdir(parents=True, exist_ok=True)
        if source == "spotify":
            output_template = str(output_dir / "{artists} - {title} [{track-id}].{output-ext}")
            command = [sys.executable, "-m", "spotdl", "download", url,
                       "--format", "mp3", "--output", output_template]
            # Keep default metadata, album-art and available-lyrics embedding enabled.
        else:
            output_template = str(output_dir / "%(title).180B [%(id)s].%(ext)s")
            command = [sys.executable, "-m", "yt_dlp", "--ignore-config",
                       "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0",
                       "--embed-metadata", "--embed-thumbnail", "--convert-thumbnails", "jpg",
                       "--windows-filenames", "--no-overwrites", "--newline",
                       "--yes-playlist" if source == "youtube-playlist" else "--no-playlist",
                       "--output", output_template, "--", url]
            logging.info("Using the exact YouTube source; no Spotify/studio-version matching.")
        action = "downloading audio"
        logging.info("Starting %s download...", source)
        logging.info("Saving MP3 files directly to: %s", output_dir)
        subprocess.run(command, check=True)
        logging.info("Download finished. Files are saved in: %s", output_dir)
        logging.info("Review the output above for any unavailable or failed tracks.")
        return 0
    except subprocess.CalledProcessError as exc:
        logging.error("Failed while %s (exit code %s). See the output above.", action, exc.returncode)
        return 1
    except FileNotFoundError as exc:
        logging.error("A required program could not be found: %s", exc)
        return 1
    except OSError as exc:
        logging.error("Could not access a program or output directory: %s", exc)
        return 1
    except KeyboardInterrupt:
        logging.warning("Cancelled. Any completed downloads remain in %s", output_dir)
        return 130


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", nargs="?", default=PLAYLIST_URL)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()
    raise SystemExit(main(args.url, args.output_dir.expanduser().resolve()))
