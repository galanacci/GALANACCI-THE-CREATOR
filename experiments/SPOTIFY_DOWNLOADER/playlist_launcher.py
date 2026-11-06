"""Double-click START_DOWNLOADER.bat to open this Windows interface."""
from pathlib import Path
import os
import queue
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
from download_playlist import get_source

ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"


class Launcher:
    def __init__(self, root):
        self.root = root
        self.events = queue.Queue()
        self.process = None
        self.running = False
        self.cancelled = threading.Event()
        self.url = tk.StringVar()
        self.folder = tk.StringVar(value=str(ROOT / "Downloaded_Music"))
        self.status = tk.StringVar(value="Paste a Spotify playlist or YouTube video/playlist link.")
        root.title("GALANACCI — Playlist Downloader")
        root.geometry("780x540")
        root.minsize(600, 430)
        frame = ttk.Frame(root, padding=20)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="SPOTIFY + YOUTUBE → MP3", font=("Segoe UI", 17, "bold")).pack(anchor="w")
        ttk.Label(frame, text="Spotify playlist or YouTube video / playlist URL").pack(anchor="w", pady=(18, 4))
        self.entry = ttk.Entry(frame, textvariable=self.url)
        self.entry.pack(fill="x")
        ttk.Label(frame, text="Save music to").pack(anchor="w", pady=(12, 4))
        row = ttk.Frame(frame)
        row.pack(fill="x")
        self.folder_entry = ttk.Entry(row, textvariable=self.folder)
        self.folder_entry.pack(side="left", fill="x", expand=True)
        self.browse = ttk.Button(row, text="Browse…", command=self.choose_folder)
        self.browse.pack(side="left", padx=(8, 0))
        actions = ttk.Frame(frame)
        actions.pack(fill="x", pady=14)
        self.start = ttk.Button(actions, text="Download / Resume audio", command=self.download)
        self.start.pack(side="left")
        self.cancel = ttk.Button(actions, text="Cancel", command=self.stop, state="disabled")
        self.cancel.pack(side="left", padx=8)
        ttk.Button(actions, text="Open music folder", command=self.open_folder).pack(side="left")
        self.progress = ttk.Progressbar(frame, mode="indeterminate")
        self.progress.pack(fill="x")
        ttk.Label(frame, textvariable=self.status, wraplength=700).pack(anchor="w", pady=8)
        self.log = scrolledtext.ScrolledText(frame, height=12, state="disabled", font=("Consolas", 10))
        self.log.pack(fill="both", expand=True)
        ttk.Label(frame, text="Resume: choose the same music folder. Completed tracks are skipped. FFmpeg required.").pack(anchor="w", pady=(8, 0))
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.after(100, self.poll)
        self.entry.focus_set()

    def choose_folder(self):
        folder = filedialog.askdirectory(title="Choose output folder")
        if folder:
            self.folder.set(folder)

    def open_folder(self):
        try:
            folder = Path(self.folder.get()).expanduser().resolve()
            folder.mkdir(parents=True, exist_ok=True)
            os.startfile(folder)
        except OSError as error:
            messagebox.showerror("Could not open folder", str(error))

    def download(self):
        url = self.url.get().strip()
        try:
            source = get_source(url)
        except ValueError as error:
            messagebox.showerror("Supported link needed", str(error))
            return
        if not shutil.which("ffmpeg"):
            messagebox.showerror("FFmpeg required", "Install FFmpeg and add it to PATH, then close and reopen this launcher.")
            return
        if not self.folder.get().strip():
            messagebox.showerror("Folder needed", "Choose a folder for your MP3 files.")
            return
        self.running = True
        self.cancelled.clear()
        self.set_controls()
        self.progress.start()
        self.status.set("Preparing " + ("Spotify playlist" if source == "spotify" else "exact YouTube audio") + "…")
        threading.Thread(target=self.worker, args=(url, str(Path(self.folder.get()).expanduser().resolve())), daemon=True).start()

    def run_command(self, command):
        env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, encoding="utf-8", errors="replace", env=env,
                              creationflags=subprocess.CREATE_NO_WINDOW) as process:
            self.process = process
            if self.cancelled.is_set():
                self.terminate_owned_process()
            for line in process.stdout:
                self.events.put(("log", line.rstrip()))
            code = process.wait()
            self.process = None
            if code:
                raise subprocess.CalledProcessError(code, command)

    def worker(self, url, folder):
        try:
            if not VENV_PYTHON.exists():
                self.events.put(("log", "Creating isolated Python environment…"))
                self.run_command([sys.executable, "-m", "venv", str(ROOT / ".venv")])
            if self.cancelled.is_set():
                return
            self.events.put(("status", "Scanning existing music, then downloading missing tracks — see the log below."))
            self.run_command([str(VENV_PYTHON), "-u", str(ROOT / "download_playlist.py"), url, "--output-dir", folder])
            self.events.put(("status", "Finished. Review the log for any unavailable tracks, then open your music folder."))
        except (OSError, subprocess.CalledProcessError) as error:
            self.events.put(("status", "Stopped. Completed files kept. Use the same folder and Download / Resume to retry."))
            self.events.put(("log", str(error)))
        finally:
            if self.cancelled.is_set():
                self.events.put(("status", "Cancelled. Completed files have been kept."))
            self.events.put(("done", ""))

    def terminate_owned_process(self):
        process = self.process
        if process is not None and process.poll() is None:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, check=False)

    def stop(self):
        self.cancelled.set()
        self.status.set("Cancelling…")
        self.cancel.configure(state="disabled")
        threading.Thread(target=self.terminate_owned_process, daemon=True).start()

    def set_controls(self):
        state = "disabled" if self.running else "normal"
        for control in (self.start, self.entry, self.folder_entry, self.browse):
            control.configure(state=state)
        self.cancel.configure(state="normal" if self.running else "disabled")

    def poll(self):
        for _ in range(200):
            try:
                kind, text = self.events.get_nowait()
            except queue.Empty:
                break
            if kind == "log":
                self.log.configure(state="normal")
                self.log.insert("end", text + "\n")
                self.log.see("end")
                self.log.configure(state="disabled")
            elif kind == "status":
                self.status.set(text)
            elif kind == "done":
                self.running = False
                self.progress.stop()
                self.set_controls()
        self.root.after(100, self.poll)

    def close(self):
        if self.running:
            if messagebox.askyesno("Download running", "Cancel the download? Completed music will be kept."):
                self.stop()
            return
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    if "--check" in sys.argv:
        root.withdraw()
        app = Launcher(root)
        root.update_idletasks()
        print(f"Launcher OK | Tk {tk.TkVersion} | FFmpeg: {shutil.which('ffmpeg') or 'missing'}")
        root.destroy()
    else:
        Launcher(root)
        root.mainloop()
