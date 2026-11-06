"""Download a Spotify playlist as tagged MP3 files using spotDL."""

PLAYLIST_URL = "YOUR_SPOTIFY_PLAYLIST_URL_HERE"

import importlib.util
import argparse
import logging
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import urlparse

OUTPUT_DIR = Path(__file__).resolve().parent / "Downloaded_Music"


def main(playlist_url: str | None = None, output_dir: Path | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    url = (playlist_url if playlist_url is not None else PLAYLIST_URL).strip()
    output_dir = output_dir if output_dir is not None else OUTPUT_DIR
    if not url or url == "YOUR_SPOTIFY_PLAYLIST_URL_HERE":
        logging.error("Set PLAYLIST_URL at the top of this script, then run it again.")
        return 2
    parsed = urlparse(url)
    if (parsed.scheme != "https" or parsed.hostname != "open.spotify.com"
            or not re.fullmatch(r"/playlist/[A-Za-z0-9]{22}/?", parsed.path)):
        logging.error("Use a Spotify playlist link: https://open.spotify.com/playlist/...")
        return 2

    # FFmpeg must be installed and on your local system PATH for audio conversion.
    if shutil.which("ffmpeg") is None:
        logging.error("FFmpeg is missing from PATH. Install it, reopen your terminal, and retry.")
        return 1

    action = "checking prerequisites"
    try:
        subprocess.run(["ffmpeg", "-version"], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if importlib.util.find_spec("spotdl") is None:
            action = "installing spotDL"
            logging.info("spotDL is missing; installing it for this Python interpreter...")
            subprocess.run([sys.executable, "-m", "pip", "install", "spotdl"], check=True)

        output_dir.mkdir(parents=True, exist_ok=True)
        output_template = str(output_dir / "{artists} - {title} [{track-id}].{output-ext}")
        command = [sys.executable, "-m", "spotdl", "download", url,
                   "--format", "mp3", "--output", output_template]
        # Keep default metadata, album-art and available-lyrics embedding enabled.
        action = "downloading the playlist"
        logging.info("Starting playlist download...")
        logging.info("Saving MP3 files directly to: %s", output_dir)
        subprocess.run(command, check=True)
        logging.info("spotDL finished. Files are saved in: %s", output_dir)
        logging.info("Review spotDL's output above for any unavailable or failed tracks.")
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
