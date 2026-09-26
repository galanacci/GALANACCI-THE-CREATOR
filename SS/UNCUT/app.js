const formatDate = (timestamp) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(timestamp)).toUpperCase();
import { initUncutSound } from "./sound.js";

const crtAudio = (action, detail = {}) => window.dispatchEvent(new CustomEvent("uncut:crt-audio", { detail: { action, ...detail } }));

async function initDocumentary() {
    const room = document.getElementById("documentary-room");
    const environment = document.getElementById("documentary-environment");
    const sceneHost = document.getElementById("documentary-scene");
    const sceneStatus = document.getElementById("documentary-scene-status");
    const crtPlayer = document.getElementById("documentary-crt-player");
    const crtControls = document.getElementById("documentary-crt-controls");
    const crtPrevious = document.getElementById("documentary-crt-previous");
    const crtNext = document.getElementById("documentary-crt-next");
    const crtArchiveToggle = document.getElementById("documentary-crt-archive-toggle");
    const crtArchiveMenu = document.getElementById("documentary-crt-archive-menu");
    if (!room || !environment || !sceneHost || !sceneStatus || !crtPlayer || !crtControls || !crtPrevious || !crtNext || !crtArchiveToggle || !crtArchiveMenu) return;
    let episodes = [];
    let selected = 0;
    let initialized = false;
    let booting = false;
    let crtPlaying = false;
    let scene;
    let sceneLoading;
    let crtArchiveYear = "";
    let archiveDismissPointer = null;
    let tuning = false;
    let tuneSequence = 0;
    let entranceSequence = 0;
    const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

    const stopCrtPlayback = () => {
        crtPlaying = false;
        crtPlayer.classList.remove("is-playing");
        crtPlayer.setAttribute("aria-hidden", "true");
        crtPlayer.replaceChildren();
    };
    const episodeNumber = (episode, index = 0) => {
        const parsed = Number(String(episode?.episode || "").match(/\d+/)?.[0]);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : episodes.length - index;
    };
    const updateCrtArchiveNowPlaying = () => {
        const episode = episodes[selected] || episodes[0];
        const panel = crtArchiveMenu.querySelector(".documentary-crt-now-playing");
        if (!episode || !panel) return;
        panel.querySelector("span").textContent = `NOW PLAYING · EPISODE ${String(episodeNumber(episode, selected)).padStart(3, "0")}`;
        panel.querySelector("h3").textContent = episode.title;
        panel.querySelector("p").textContent = episode.summary || "A weekly video journal by GALANACCI.";
    };
    const updateCrtArchiveSelection = () => {
        crtArchiveMenu.querySelectorAll(".documentary-crt-episode-option").forEach((button) => {
            const current = Number(button.dataset.episodeIndex) === selected;
            button.classList.toggle("is-current", current);
            button.setAttribute("aria-pressed", String(current));
        });
    };
    const updateCrtMetadata = () => {
        const episode = episodes[selected] || episodes[0];
        if (!episode) return;
        const currentNumber = episodeNumber(episode, selected);
        crtArchiveToggle.setAttribute("aria-label", `Episodes, current episode ${currentNumber}`);
        crtPrevious.disabled = tuning || selected >= episodes.length - 1;
        crtNext.disabled = tuning || selected <= 0;
        crtArchiveToggle.disabled = tuning;
        updateCrtArchiveNowPlaying();
        updateCrtArchiveSelection();
    };
    const closeCrtArchive = (restoreFocus = false) => {
        crtArchiveMenu.classList.remove("is-open");
        crtArchiveMenu.setAttribute("aria-hidden", "true");
        crtArchiveMenu.inert = true;
        crtArchiveToggle.setAttribute("aria-expanded", "false");
        if (restoreFocus) crtArchiveToggle.focus();
    };
    const chooseCrtEpisode = (index) => {
        changeCrtEpisode(index);
    };
    const renderCrtArchiveEpisodes = () => {
        const list = crtArchiveMenu.querySelector(".documentary-crt-episode-list");
        if (!list) return;
        const indexes = episodes
            .map((episode, index) => ({ episode, index }))
            .filter(({ episode }) => String(new Date(episode.publishedAt).getFullYear()) === crtArchiveYear);
        list.replaceChildren(...indexes.map(({ episode, index }) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "documentary-crt-episode-option";
            button.dataset.crtSound = "";
            button.dataset.episodeIndex = String(index);
            button.classList.toggle("is-current", index === selected);
            button.setAttribute("aria-pressed", String(index === selected));
            const number = document.createElement("span");
            number.textContent = String(episodeNumber(episode, index)).padStart(3, "0");
            const title = document.createElement("strong");
            title.textContent = episode.title;
            const date = document.createElement("time");
            date.dateTime = episode.publishedAt;
            date.textContent = formatDate(episode.publishedAt);
            button.append(number, title, date);
            button.addEventListener("click", () => chooseCrtEpisode(index));
            return button;
        }));
    };
    const buildCrtArchive = () => {
        const years = [...new Set(episodes.map((episode) => String(new Date(episode.publishedAt).getFullYear())))].sort((a, b) => Number(b) - Number(a));
        crtArchiveYear = years[0] || "";
        const header = document.createElement("header");
        const label = document.createElement("p");
        label.textContent = "EPISODE ARCHIVE";
        const year = document.createElement("select");
        year.className = "documentary-crt-year-filter";
        year.setAttribute("aria-label", "Filter Video Journal episodes by year");
        years.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            year.append(option);
        });
        year.addEventListener("change", () => {
            crtArchiveYear = year.value;
            renderCrtArchiveEpisodes();
        });
        const yearControl = document.createElement("div");
        yearControl.className = "documentary-crt-year-control";
        yearControl.append(year);
        header.append(label, yearControl);
        const nowPlaying = document.createElement("section");
        nowPlaying.className = "documentary-crt-now-playing";
        nowPlaying.setAttribute("aria-live", "polite");
        nowPlaying.append(document.createElement("span"), document.createElement("h3"), document.createElement("p"));
        nowPlaying.addEventListener("pointerdown", (event) => {
            if (!window.matchMedia("(max-width: 680px), (hover: none), (pointer: coarse)").matches) return;
            if (event.isPrimary === false || event.button > 0) return;
            archiveDismissPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        });
        nowPlaying.addEventListener("pointerup", (event) => {
            if (!archiveDismissPointer || archiveDismissPointer.id !== event.pointerId) return;
            const deltaX = event.clientX - archiveDismissPointer.x;
            const deltaY = event.clientY - archiveDismissPointer.y;
            archiveDismissPointer = null;
            const tap = Math.hypot(deltaX, deltaY) < 10;
            const downwardSwipe = deltaY >= 45 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15;
            if (tap || downwardSwipe) closeCrtArchive();
        });
        nowPlaying.addEventListener("pointercancel", () => { archiveDismissPointer = null; });
        const list = document.createElement("div");
        list.className = "documentary-crt-episode-list";
        crtArchiveMenu.replaceChildren(header, nowPlaying, list);
        updateCrtArchiveNowPlaying();
        renderCrtArchiveEpisodes();
    };
    const startCrtPlayback = (autoplay = false) => {
        const episode = episodes[selected] || episodes[0];
        if (!episode) return;
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(episode.videoId)}?playsinline=1&rel=0&modestbranding=1${autoplay ? "&autoplay=1" : ""}`;
        iframe.title = `Playing on the workspace CRT: ${episode.title}`;
        iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.allowFullscreen = true;
        iframe.addEventListener("load", () => {
            window.requestAnimationFrame(() => iframe.classList.add("is-signal-ready"));
        }, { once: true });
        crtPlayer.replaceChildren(iframe);
        updateCrtMetadata();
        return iframe;
    };
    const changeCrtEpisode = async (index) => {
        if (!episodes.length || !crtPlaying || tuning || index === selected) return;
        tuning = true;
        const token = ++tuneSequence;
        updateCrtMetadata();
        crtAudio("tune");
        crtPlayer.classList.add("is-tuning");
        scene?.beginChannelBlackout();
        await wait(150);
        if (token !== tuneSequence) return;
        scene?.beginChannelLine();
        await wait(360);
        if (token !== tuneSequence) return;
        selected = index;
        scene?.beginChannelStatic();
        crtAudio("static-start", { duration: 1200 });
        const iframe = startCrtPlayback(true);
        const loaded = iframe
            ? new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }))
            : Promise.resolve();
        await Promise.all([
            wait(520),
            Promise.race([loaded, wait(1200)])
        ]);
        if (token !== tuneSequence) return;
        crtAudio("static-stop");
        scene?.beginChannelTracking();
        await wait(340);
        if (token !== tuneSequence) return;
        scene?.beginPlayback();
        crtPlayer.classList.remove("is-tuning");
        tuning = false;
        updateCrtMetadata();
    };
    const moveCrtEpisode = (step) => {
        if (!episodes.length || !crtPlaying || tuning) return;
        const next = Math.max(0, Math.min(episodes.length - 1, selected + step));
        changeCrtEpisode(next);
    };
    const load = async () => {
        if (initialized) return;
        initialized = true;
        try {
            const response = await fetch("./assets/episodes.json", { cache: "no-cache" });
            if (!response.ok) throw new Error(`Documentary request failed: ${response.status}`);
            const payload = await response.json();
            episodes = Array.isArray(payload.episodes)
                ? [...payload.episodes].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
                : [];
            if (!episodes.length) throw new Error("Documentary archive is empty.");
            buildCrtArchive();
        } catch (error) {
            initialized = false;
            console.error("Documentary could not be loaded.", error);
            sceneStatus.textContent = "VIDEO JOURNAL TEMPORARILY UNAVAILABLE";
        }
    };

    const showEnvironment = () => {
        booting = false;
        environment.setAttribute("aria-hidden", "false");
        environment.inert = false;
        crtControls.hidden = true;
        closeCrtArchive();
        stopCrtPlayback();
        scene?.reset();
    };

    const powerOn = async () => {
        if (booting || crtPlaying) return;
        booting = true;
        updateCrtMetadata();
        startCrtPlayback();
        try {
            await scene?.boot();
            scene?.beginPlayback();
            crtPlaying = true;
            crtPlayer.classList.add("is-playing");
            crtPlayer.setAttribute("aria-hidden", "false");
            updateCrtMetadata();
        } finally {
            booting = false;
        }
    };

    const beginVisibleCrtExperience = async () => {
        if (!scene?.loaded || crtPlaying || booting) return;
        const token = ++entranceSequence;
        if (token !== entranceSequence || !room.classList.contains("is-open")) return;
        scene.beginEntrance?.();
        powerOn();
    };

    const sceneHooks = {
        onReady() {
            sceneHost.classList.add("is-ready");
            sceneStatus.textContent = "";
            if (room.classList.contains("is-open")) beginVisibleCrtExperience();
        },
        onCrtPower() {
            crtControls.hidden = false;
            crtAudio("power");
        },
        onCrtStaticStart(duration) {
            crtAudio("static-start", { duration });
        },
        onCrtStaticEnd() {
            crtAudio("static-stop");
        },
        onScreenRect(rect) {
            const insetLeft = rect.width * .048;
            const insetRight = rect.width * .044;
            const insetTop = rect.height * .03;
            const insetBottom = rect.height * .032;
            environment.style.setProperty("--crt-left", `${rect.left + insetLeft}px`);
            environment.style.setProperty("--crt-top", `${rect.top + insetTop}px`);
            environment.style.setProperty("--crt-width", `${Math.max(0, rect.width - insetLeft - insetRight)}px`);
            environment.style.setProperty("--crt-height", `${Math.max(0, rect.height - insetTop - insetBottom)}px`);
        },
        onError() {
            sceneStatus.textContent = "WORKSPACE RECONSTRUCTION UNAVAILABLE";
        }
    };

    const mountScene = () => {
        if (scene) {
            scene.attach(sceneHost, sceneHooks);
            return Promise.resolve(scene);
        }
        sceneLoading ||= import("./video-journal-scene.js").then(({ mountVideoJournalScene }) => {
            scene = mountVideoJournalScene(sceneHost, sceneHooks);
            return scene;
        });
        return sceneLoading;
    };

    crtPrevious.addEventListener("click", () => moveCrtEpisode(1));
    crtNext.addEventListener("click", () => moveCrtEpisode(-1));
    crtArchiveToggle.addEventListener("click", () => {
        const open = crtArchiveToggle.getAttribute("aria-expanded") !== "true";
        crtArchiveMenu.classList.toggle("is-open", open);
        crtArchiveMenu.setAttribute("aria-hidden", String(!open));
        crtArchiveMenu.inert = !open;
        crtArchiveToggle.setAttribute("aria-expanded", String(open));
        if (open) {
            renderCrtArchiveEpisodes();
            crtArchiveMenu.querySelector(".documentary-crt-episode-option.is-current")?.scrollIntoView({ block: "nearest" });
        }
    });
    document.addEventListener("pointerdown", (event) => {
        if (crtArchiveMenu.classList.contains("is-open") && !crtArchiveMenu.contains(event.target) && !crtArchiveToggle.contains(event.target)) closeCrtArchive();
    });
    crtArchiveMenu.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeCrtArchive(true);
    });
    const stopExperience = () => {
        entranceSequence += 1;
        tuneSequence += 1;
        tuning = false;
        crtPlayer.classList.remove("is-tuning");
        stopCrtPlayback();
        crtAudio("stop");
    };
    window.addEventListener("pagehide", () => {
        stopExperience();
        scene?.detach();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopExperience();
            scene?.stop();
        } else if (scene?.loaded) {
            scene.start();
            beginVisibleCrtExperience();
        }
    });

    showEnvironment();
    await load();
    await mountScene();
    if (scene?.loaded && !crtPlaying) beginVisibleCrtExperience();
}

initUncutSound();
initDocumentary();
