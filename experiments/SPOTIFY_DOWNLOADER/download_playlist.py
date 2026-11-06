"""Download Spotify playlists or exact YouTube videos/playlists as MP3 files."""

PLAYLIST_URL = "YOUR_SPOTIFY_PLAYLIST_URL_HERE"

import importlib.util
import argparse
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

OUTPUT_DIR = Path(__file__).resolve().parent / "Downloaded_Music"


def prepare_spotify_archive(output_dir: Path, quarantine_incomplete: bool = False) -> Path:
    """Rebuild from actual audio files, including successes before a hard cancel.

    Never infer completion from playlist order or an old archive: missing files
    must remain eligible for download. Completed audio is only read; optionally
    preserve unfinished files separately so overwrite=skip cannot block a retry.
    """
    from mutagen.mp3 import MP3
    from mutagen import MutagenError

    urls = set()
    checked = 0
    logging.info("Scanning music folder before downloading: %s", output_dir)
    for path in output_dir.glob("*.mp3"):
        checked += 1
        filename_id = re.search(r"\[([A-Za-z0-9]{22})\]$", path.stem)
        try:
            audio = MP3(path)
            if audio.info.length <= 0:
                raise ValueError("Unfinished MP3 header")
        except (MutagenError, ValueError):
            if quarantine_incomplete and filename_id:
                incomplete = output_dir / "Incomplete_Downloads"
                incomplete.mkdir(exist_ok=True)
                destination = incomplete / path.name
                if destination.exists():
                    destination = incomplete / (path.stem + "-" + uuid4().hex + path.suffix)
                path.rename(destination)
                logging.warning("Incomplete MP3 preserved in %s; track will be retried.", destination)
            else:
                logging.warning("Could not read completed audio in %s; not marking it completed.", path.name)
            continue
        except OSError as error:
            logging.warning("Could not read %s: %s", path.name, error)
            continue
        # WOAS is written by spotDL. Prefer it so renamed files still match.
        stored_url = str((audio.tags or {}).get("WOAS", ""))
        match = re.fullmatch(r"https://open\.spotify\.com/track/([A-Za-z0-9]{22})(?:\?.*)?", stored_url)
        if not match:
            match = filename_id
        if match:
            urls.add("https://open.spotify.com/track/" + match.group(1))
    archive = output_dir / ".galanacci-spotify-completed.txt"
    temporary = archive.with_suffix(".tmp")
    temporary.write_text("".join(url + "\n" for url in sorted(urls)), encoding="utf-8")
    os.replace(temporary, archive)
    logging.info("Scan complete: %s MP3 files checked; %s existing Spotify tracks will be skipped.", checked, len(urls))
    return archive


def run_spotify(command: list[str], output_dir: Path) -> int:
    """Keep provider diagnostics across failures/cancellation, without flooding UI."""
    log_path = output_dir / "spotify-download-details.log"
    logging.info("Detailed provider log: %s", log_path)
    env = dict(os.environ, PYTHONIOENCODING="utf-8", NO_COLOR="1", TERM="dumb")
    with log_path.open("a", encoding="utf-8") as log:
        log.write("\n--- New download / resume run ---\n")
        log.flush()
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, encoding="utf-8", errors="replace", env=env) as process:
            try:
                for line in process.stdout:
                    log.write(line)
                    log.flush()
                    if not line.lstrip().startswith("DEBUG:"):
                        print(line, end="", flush=True)
                return process.wait()
            except BaseException:
                process.terminate()
                process.wait()
                raise


def ensure_spotify_deno() -> None:
    """Use spotDL's private Deno install; no system-wide PATH changes."""
    from spotdl.utils.deno import get_deno_path

    if get_deno_path() is None:
        logging.info("Setting up Deno for YouTube audio providers (one-time setup)...")
        subprocess.run([sys.executable, "-m", "spotdl", "--download-deno"], check=True)
        if get_deno_path() is None:
            raise FileNotFoundError("Deno setup did not finish. Retry with an internet connection.")


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
            action = "checking completed downloads"
            archive = prepare_spotify_archive(output_dir, quarantine_incomplete=True)
            action = "setting up Deno"
            ensure_spotify_deno()
            output_template = str(output_dir / "{artists} - {title} [{track-id}].{output-ext}")
            command = [sys.executable, "-m", "spotdl", "download", url,
                       "--format", "mp3", "--output", output_template,
                       # Our local scan already populated the archive. spotDL's
                       # recursive scan searches Spotify for untagged files,
                       # including recovery copies, and can abort the entire run.
                       "--overwrite", "skip",
                       "--archive", str(archive),
                       "--save-errors", str(output_dir / "spotify-failed-tracks.txt"),
                       "--print-errors", "--simple-tui", "--log-level", "DEBUG",
                       "--log-format", "%(levelname)s: %(message)s"]
            # Keep default metadata, album-art and available-lyrics embedding enabled.
        else:
            output_template = str(output_dir / "%(title).180B [%(id)s].%(ext)s")
            command = [sys.executable, "-m", "yt_dlp", "--ignore-config",
                       "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0",
                       "--embed-metadata", "--embed-thumbnail", "--convert-thumbnails", "jpg",
                       "--windows-filenames", "--no-overwrites", "--newline",
                       "--download-archive", str(output_dir / ".galanacci-youtube-completed.txt"),
                       "--yes-playlist" if source == "youtube-playlist" else "--no-playlist",
                       "--output", output_template, "--", url]
            logging.info("Using the exact YouTube source; no Spotify/studio-version matching.")
        action = "downloading audio"
        logging.info("Starting %s download...", source)
        logging.info("Saving MP3 files directly to: %s", output_dir)
        if source == "spotify":
            code = run_spotify(command, output_dir)
            # spotDL can return zero even when individual tracks failed.
            # Recheck actual files regardless of its exit code.
            prepare_spotify_archive(output_dir, quarantine_incomplete=True)
            if code:
                raise subprocess.CalledProcessError(code, command)
        else:
            subprocess.run(command, check=True)
        logging.info("Download finished. Files are saved in: %s", output_dir)
        logging.info("Review the output above for any unavailable or failed tracks.")
        return 0
    except subprocess.CalledProcessError as exc:
        logging.error("Failed while %s (exit code %s). See the output above.", action, exc.returncode)
        logging.info("Completed files are kept. Run again with the same folder to resume.")
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
