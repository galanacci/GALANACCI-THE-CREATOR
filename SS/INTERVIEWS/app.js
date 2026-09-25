(() => {
  "use strict";

  const YOUTUBE_PLAYLIST_ID =
    "PL_UEBZlt-mUJZb2SB6wQ2jLCvxs7C_-LM";

  const YOUTUBE_PLAYLIST_URL =
    "https://www.youtube.com/playlist?list=" +
    YOUTUBE_PLAYLIST_ID;

  // Published YouTube oEmbed titles, keyed by video ID so playlist order can change.
  const VIDEO_TITLES = Object.freeze({
    Uhrd8THQmeo: "Galanacci - The designer using his talent to inspire us to be great",
    "pJq-i6MRUx4": "40 - Galanacci, Artist, Fashion Designer and Creator | GPBI",
    irPlmoc6xKo: "Streetwear… What actually is it? ft. Galanacci and Nate - Part 1 | Ready-Two-Talk S1 Episode 4",
    K38hAVa2mEk: "Streetwear… What actually is it? ft. Galanacci and Nate - Part 2| Ready-Two-Talk S1 Episode 4",
    JHwB5sQW5AE: "EP003: What are your brand values and purpose? #fashionbrand #fashiondesigner #entrepreneur",
    "0V5YGV_Elh4": "FUNdora ready for Charlo? Plus Wilder Returns & an Interview w/ Anthony Dirrell | #TPWP107",
    "nRgjlj4Hj-w": "18 - Galanacci Artist, Renaissance Man, Artist and NFT Creator | Good People Bad Intentions"
  });

  const VIDEO_START_SECONDS = Object.freeze({
    "0V5YGV_Elh4": 120
  });

  const VIDEO_DISPLAY_TITLES = Object.freeze({
    "0V5YGV_Elh4": "Interview with Shawn Porter at TPWP"
  });

  const SPOTIFY_EPISODES = [
    {
      id: "6mKiwPPrJgsFHGFglvJe5C",
      url:
        "https://open.spotify.com/episode/6mKiwPPrJgsFHGFglvJe5C?si=3339e809ee6d4cfa",
      uri:
        "spotify:episode:6mKiwPPrJgsFHGFglvJe5C",
      title:
        "SPOTIFY INTERVIEW 01",
      thumbnail:
        ""
    },
    {
      id: "5oMcZP4TcyfBcocAZm5ObR",
      url:
        "https://open.spotify.com/episode/5oMcZP4TcyfBcocAZm5ObR?si=c673c115afb647e4",
      uri:
        "spotify:episode:5oMcZP4TcyfBcocAZm5ObR",
      title:
        "SPOTIFY INTERVIEW 02",
      thumbnail:
        ""
    }
  ];

  const root =
    document.querySelector(
      "[data-broadcast-app]"
    );

  const formatTabs = [
    ...document.querySelectorAll(
      "[data-format-tab]"
    )
  ];

  const archiveHeadingEl =
    document.querySelector(
      "[data-archive-heading]"
    );

  const titleEl =
    document.querySelector(
      "[data-current-title]"
    );

  const sourceLabelEl =
    document.querySelector(
      "[data-source-label]"
    );

  const countEl =
    document.querySelector(
      "[data-archive-count]"
    );

  const videoLink = document.querySelector("[data-video-link]");
  const audioLink = document.querySelector("[data-audio-link]");

  const loadingEl =
    document.querySelector(
      "[data-loading]"
    );

  const errorEl =
    document.querySelector(
      "[data-error]"
    );

  const reel =
    document.querySelector(
      "[data-reel]"
    );

  const reelTrack =
    document.querySelector(
      "[data-reel-track]"
    );

  const prevButton =
    document.querySelector(
      "[data-prev]"
    );

  const nextButton =
    document.querySelector(
      "[data-next]"
    );

  // The YouTube API replaces its target node with an iframe.
  const youtubeScreen =
    document.querySelector(
      "[data-youtube-screen]"
    );

  const spotifyStage =
    document.querySelector(
      "[data-spotify-stage]"
    );

  const spotifyHost =
    document.getElementById(
      "spotify-player"
    );

  let youtubePlayer = null;
  let youtubeIds = [];
  let youtubeReady = false;
  let youtubeApiRequested = false;
  let youtubePlayerInitStarted = false;
  let youtubeFailed = false;

  let spotifyCurrentId = "";
  let spotifyFailed = false;

  let archiveItems = [];
  let currentIndex = 0;
  let activeType = "youtube";
  const selectedIndexes = { youtube: 0, spotify: 0 };

  let dragState = null;
  let titleRefreshTimer = 0;
  let pendingYoutubeStart = null;

  function pad(value) {
    return String(value).padStart(
      3,
      "0"
    );
  }

  function archiveLabel(index) {
    return (
      "TRANSMISSION_" +
      pad(index + 1)
    );
  }

  function clampArchiveIndex(index) {
    if (!archiveItems.length) {
      return 0;
    }

    const length =
      archiveItems.length;

    return (
      (index % length) +
      length
    ) % length;
  }

  function setLoading(isLoading) {
    loadingEl.classList.toggle(
      "is-hidden",
      !isLoading
    );
  }

  function showError() {
    errorEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
  }

  function updateGlobalError() {
    if (
      youtubeFailed &&
      spotifyFailed
    ) {
      showError();
      return;
    }

    hideError();
  }

  function youtubeThumbnail(videoId) {
    return (
      "https://i.ytimg.com/vi/" +
      encodeURIComponent(videoId) +
      "/hqdefault.jpg"
    );
  }

  function buildArchiveItems() {
    const youtubeItems =
      youtubeIds.map(
        (videoId, providerIndex) => ({
          type: "youtube",
          id: videoId,
          providerIndex,
          title:
            VIDEO_DISPLAY_TITLES[videoId] || VIDEO_TITLES[videoId] || archiveLabel(providerIndex),
          thumbnail:
            youtubeThumbnail(
              videoId
            )
        })
      );

    const spotifyItems =
      SPOTIFY_EPISODES.map(
        (episode, spotifyIndex) => ({
          type: "spotify",
          id: episode.id,
          providerIndex:
            spotifyIndex,
          title:
            episode.title,
          thumbnail:
            episode.thumbnail,
          url:
            episode.url,
          uri:
            episode.uri
        })
      );

    archiveItems = activeType === "spotify"
      ? spotifyItems
      : youtubeItems;

    currentIndex = Math.min(
      selectedIndexes[activeType],
      Math.max(0, archiveItems.length - 1)
    );

    renderArchive();
  }

  function createTape(
    item,
    index
  ) {
    const button =
      document.createElement(
        "button"
      );

    button.type = "button";
    button.className =
      "broadcast__tape";

    button.dataset.index =
      String(index);

    button.setAttribute(
      "aria-label",
      "Open " + (item.type === "spotify" ? "audio" : "video") +
        " interview: " + (item.title || archiveLabel(index))
    );

    let thumb;

    if (
      item.thumbnail
    ) {
      thumb =
        document.createElement(
          "img"
        );

      thumb.className =
        "broadcast__tape-thumb";

      thumb.src =
        item.thumbnail;

      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.decoding = "async";
    } else {
      thumb =
        document.createElement(
          "span"
        );

      thumb.className =
        "broadcast__tape-thumb " +
        "broadcast__tape-thumb--audio";

      thumb.textContent =
        item.type === "spotify"
          ? "AUDIO"
          : "VIDEO";
    }

    const info =
      document.createElement(
        "span"
      );

    info.className =
      "broadcast__tape-info";

    const number =
      document.createElement(
        "span"
      );

    number.className =
      "broadcast__tape-number";

    number.textContent =
      pad(index + 1);

    const name =
      document.createElement(
        "span"
      );

    name.className =
      "broadcast__tape-name";

    name.textContent =
      item.title ||
      archiveLabel(index);

    info.append(
      number,
      name
    );

    button.append(
      thumb,
      info
    );

    button.addEventListener(
      "click",
      () => {
        selectArchiveIndex(
          index,
          true
        );
      }
    );

    return button;
  }

  function renderArchive() {
    reelTrack.innerHTML = "";

    if (!archiveItems.length) {
      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "broadcast__placeholder";

      empty.textContent =
        "LOADING TRANSMISSIONS";

      reelTrack.append(
        empty
      );

      countEl.textContent =
        activeType === "youtube" && !youtubeReady
          ? "LOADING"
          : "0 INTERVIEWS";

      return;
    }

    const fragment =
      document.createDocumentFragment();

    archiveItems.forEach(
      (item, index) => {
        fragment.append(
          createTape(
            item,
            index
          )
        );
      }
    );

    reelTrack.append(
      fragment
    );

    countEl.textContent =
      archiveItems.length +
      " INTERVIEWS";

    updateActiveTape(
      false
    );
  }

  function updateActiveTape(
    scrollIntoView
  ) {
    const tapes = [
      ...reelTrack.querySelectorAll(
        ".broadcast__tape"
      )
    ];

    tapes.forEach(
      (tape, index) => {
        const active =
          index ===
          currentIndex;

        tape.classList.toggle(
          "is-active",
          active
        );

        tape.setAttribute(
          "aria-current",
          active
            ? "true"
            : "false"
        );
      }
    );

    if (
      scrollIntoView &&
      tapes[currentIndex]
    ) {
      const tape = tapes[currentIndex];
      if (window.matchMedia("(max-width: 840px)").matches) {
        // Keep the selected tape centered without scrolling the entire app.
        const maxScroll = Math.max(0, reel.scrollWidth - reel.clientWidth);
        reel.scrollTo({
          left: Math.min(maxScroll, Math.max(0,
            tape.offsetLeft + tape.offsetWidth / 2 - reel.clientWidth / 2
          )),
          behavior: "smooth"
        });
      } else {
        tape.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest"
        });
      }
    }
  }

  function setMediaMode(type) {
    const spotifyActive =
      type === "spotify";

    root.dataset.activeType = type;
    videoLink.hidden = spotifyActive;
    audioLink.hidden = !spotifyActive;
    setLoading(!spotifyActive && !youtubeReady);

    spotifyStage.classList.toggle(
      "is-active",
      spotifyActive
    );

    youtubeScreen.classList.toggle(
      "is-source-hidden",
      spotifyActive
    );

    sourceLabelEl.textContent =
      spotifyActive
        ? "SPOTIFY AUDIO"
        : "YOUTUBE VIDEO";

    if (spotifyActive) {
      audioLink.href = archiveItems[currentIndex]?.url || "https://open.spotify.com/";
    }
  }

  function refreshYoutubeTitle() {
    if (!youtubePlayer) {
      return;
    }

    window.clearTimeout(
      titleRefreshTimer
    );

    titleRefreshTimer =
      window.setTimeout(
        () => {
          try {
            const data =
              youtubePlayer.
                getVideoData();

            const title =
              data &&
              typeof data.title ===
                "string"
                ? data.title.trim()
                : "";

            const item = archiveItems[currentIndex];
            if (item?.type !== "youtube" || data.video_id !== item.id) return;

            const displayTitle = VIDEO_DISPLAY_TITLES[item.id] || title;
            if (displayTitle) {
              item.title = displayTitle;
              const tapeName = reelTrack.querySelectorAll(".broadcast__tape-name")[currentIndex];
              if (tapeName) tapeName.textContent = displayTitle;
            }
            titleEl.textContent = displayTitle || item.title;
          } catch {
            /* Keep the known archive title if provider metadata is delayed. */
          }
        },
        140
      );
  }

  function updateTitleForItem(
    item
  ) {
    if (!item) {
      titleEl.textContent =
        "GALANACCI BROADCAST ARCHIVE";
      return;
    }

    if (
      item.type ===
      "youtube"
    ) {
      titleEl.textContent = item.title || archiveLabel(currentIndex);
      refreshYoutubeTitle();
      return;
    }

    titleEl.textContent =
      item.title ||
      archiveLabel(
        currentIndex
      );
  }

  function syncUi(
    scrollTape
  ) {
    updateActiveTape(
      Boolean(scrollTape)
    );

    const item =
      archiveItems[
        currentIndex
      ];

    if (item) {
      setMediaMode(
        item.type
      );

      updateTitleForItem(
        item
      );
    }
  }

  function loadYoutubeItem(
    item,
    autoplay
  ) {
    setMediaMode(
      "youtube"
    );

    // Removing the embed stops its audio, including when its own controls
    // started playback without a parent-page API event.
    spotifyHost.replaceChildren();
    spotifyCurrentId = "";

    if (
      !youtubeReady ||
      !youtubePlayer
    ) {
      return;
    }

    // playVideoAt() begins at 0. Wait for the selected video to load before
    // applying its curated start time; all other videos retain their start.
    const startSeconds = autoplay ? VIDEO_START_SECONDS[item.id] : undefined;
    pendingYoutubeStart = Number.isFinite(startSeconds)
      ? { id: item.id, providerIndex: item.providerIndex, seconds: startSeconds }
      : null;

    try {
      const activeIndex =
        youtubePlayer.
          getPlaylistIndex();

      if (
        activeIndex !==
        item.providerIndex
      ) {
        if (autoplay) {
          youtubePlayer.
            playVideoAt(
              item.providerIndex
            );
        } else {
          youtubePlayer.
            playVideoAt(
              item.providerIndex
            );

          youtubePlayer.
            pauseVideo();
        }
      } else if (autoplay) {
        if (pendingYoutubeStart) {
          youtubePlayer.seekTo(pendingYoutubeStart.seconds, true);
          pendingYoutubeStart = null;
        }
        youtubePlayer.playVideo();
      }
    } catch {
      /* Keep archive UI responsive. */
    }
  }

  function applyPendingYoutubeStart() {
    if (!pendingYoutubeStart || !youtubePlayer) return;
    if (activeType !== "youtube" || archiveItems[currentIndex]?.id !== pendingYoutubeStart.id) {
      pendingYoutubeStart = null;
      return;
    }

    try {
      const data = youtubePlayer.getVideoData();
      if (youtubePlayer.getPlaylistIndex() !== pendingYoutubeStart.providerIndex ||
          data?.video_id !== pendingYoutubeStart.id) return;

      const seconds = pendingYoutubeStart.seconds;
      pendingYoutubeStart = null;
      youtubePlayer.seekTo(seconds, true);
    } catch {
      /* Try again on the next YouTube state change. */
    }
  }

  function loadSpotifyItem(
    item
  ) {
    pendingYoutubeStart = null;
    setMediaMode(
      "spotify"
    );

    if (
      youtubePlayer &&
      youtubeReady
    ) {
      try {
        youtubePlayer.pauseVideo();
      } catch {
        /* Provider control is optional. */
      }
    }

    if (spotifyCurrentId === item.id) {
      return;
    }

    // A new native embed is created only when the selected episode changes.
    // Its own play button receives the user gesture directly; a programmatic
    // play call here can be blocked or queued by mobile browser policy.
    const iframe = document.createElement("iframe");
    iframe.src = "https://open.spotify.com/embed/episode/" +
      encodeURIComponent(item.id);
    iframe.title = item.title || "Spotify interview";
    iframe.width = "100%";
    iframe.height = "232";
    iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    iframe.addEventListener("load", () => {
      spotifyFailed = false;
      updateGlobalError();
    }, { once: true });
    iframe.addEventListener("error", () => {
      spotifyFailed = true;
      updateGlobalError();
    }, { once: true });

    spotifyHost.replaceChildren(iframe);
    spotifyCurrentId = item.id;
  }

  function selectArchiveIndex(
    index,
    autoplay
  ) {
    if (!archiveItems.length) {
      return;
    }

    currentIndex =
      clampArchiveIndex(
        index
      );
    selectedIndexes[activeType] = currentIndex;

    const item =
      archiveItems[
        currentIndex
      ];

    syncUi(true);

    if (
      item.type ===
      "spotify"
    ) {
      loadSpotifyItem(
        item,
        autoplay
      );
    } else {
      loadYoutubeItem(
        item,
        autoplay
      );
    }
  }

  function activateType(type) {
    if (type === activeType) return;

    // Cancel any in-flight video-reel scroll before replacing its contents.
    // WebKit can retain the old offset when the new reel is shorter.
    reel.scrollLeft = 0;
    reel.scrollTop = 0;

    activeType = type;
    formatTabs.forEach((tab) => {
      const selected = tab.dataset.formatTab === type;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-pressed", String(selected));
    });
    archiveHeadingEl.textContent = type === "spotify"
      ? "AUDIO ARCHIVE"
      : "VIDEO ARCHIVE";

    buildArchiveItems();
    reel.scrollLeft = 0;
    reel.scrollTop = 0;
    syncUi(true);

    const item = archiveItems[currentIndex];
    if (item?.type === "spotify") {
      loadSpotifyItem(item);
    } else if (item?.type === "youtube") {
      loadYoutubeItem(item, false);
    } else if (type === "youtube") {
      spotifyHost.replaceChildren();
      spotifyCurrentId = "";
      setMediaMode("youtube");
    }
  }

  formatTabs.forEach((tab) => {
    tab.addEventListener("click", () => activateType(tab.dataset.formatTab));
  });

  function previous() {
    selectArchiveIndex(
      currentIndex - 1,
      true
    );
  }

  function next() {
    selectArchiveIndex(
      currentIndex + 1,
      true
    );
  }

  prevButton.addEventListener(
    "click",
    previous
  );

  nextButton.addEventListener(
    "click",
    next
  );

  reel.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
        "ArrowLeft"
      ) {
        event.preventDefault();
        previous();
      }

      if (
        event.key ===
        "ArrowRight"
      ) {
        event.preventDefault();
        next();
      }
    }
  );

  reel.addEventListener(
    "pointerdown",
    (event) => {
      // Touch has native horizontal panning. Handling it again here can
      // compound the movement and reveal empty space beyond the last tape.
      if (event.pointerType === "touch") {
        return;
      }

      if (
        event.pointerType ===
          "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      dragState = {
        pointerId:
          event.pointerId,
        x:
          event.clientX,
        y:
          event.clientY,
        scrollLeft:
          reel.scrollLeft,
        scrollTop:
          reel.scrollTop,
        moved: false
      };

    }
  );

  reel.addEventListener(
    "pointermove",
    (event) => {
      if (
        !dragState ||
        dragState.pointerId !==
          event.pointerId
      ) {
        return;
      }

      const dx =
        event.clientX -
        dragState.x;

      const dy =
        event.clientY -
        dragState.y;

      if (!dragState.moved) {
        if (Math.hypot(dx, dy) < 6) {
          return;
        }

        dragState.moved = true;
        reel.classList.add("is-dragging");

        try {
          reel.setPointerCapture(event.pointerId);
        } catch {
          /* Drag still works while the pointer stays on the reel. */
        }
      }

      if (
        window.matchMedia(
          "(max-width: 840px)"
        ).matches
      ) {
        const maxScroll = Math.max(0, reel.scrollWidth - reel.clientWidth);
        reel.scrollLeft = Math.min(maxScroll, Math.max(0,
          dragState.scrollLeft - dx
        ));
      } else {
        reel.scrollTop =
          dragState.scrollTop -
          dy;
      }
    }
  );

  function endDrag(event) {
    if (
      !dragState ||
      dragState.pointerId !==
        event.pointerId
    ) {
      return;
    }

    dragState = null;

    reel.classList.remove(
      "is-dragging"
    );

    try {
      reel.releasePointerCapture(
        event.pointerId
      );
    } catch {
      /* Optional enhancement. */
    }
  }

  reel.addEventListener(
    "pointerup",
    endDrag
  );

  reel.addEventListener(
    "pointercancel",
    endDrag
  );

  /*
    YOUTUBE
    Register callback before requesting iframe_api.
  */
  function initialiseYouTubePlayer() {
    if (
      youtubePlayerInitStarted ||
      !window.YT ||
      typeof window.YT.Player !==
        "function"
    ) {
      return;
    }

    youtubePlayerInitStarted =
      true;

    try {
      youtubePlayer =
        new YT.Player(
          "youtube-player",
          {
            width: "100%",
            height: "100%",

            playerVars: {
              listType:
                "playlist",
              list:
                YOUTUBE_PLAYLIST_ID,
              rel: 0,
              playsinline: 1,
              modestbranding: 1,
              iv_load_policy: 3
            },

            events: {
              onReady(event) {
                youtubeReady =
                  true;

                youtubeFailed =
                  false;

                try {
                  youtubeIds =
                    event.target.
                      getPlaylist() ||
                    [];
                } catch {
                  youtubeIds =
                    [];
                }

                buildArchiveItems();

                if (
                  archiveItems[
                    currentIndex
                  ] &&
                  archiveItems[
                    currentIndex
                  ].type ===
                    "youtube"
                ) {
                  syncUi(false);
                }

                setLoading(false);
                updateGlobalError();
              },

              onStateChange() {
                if (
                  !youtubeReady
                ) {
                  return;
                }

                hideError();

                try {
                  const latest =
                    youtubePlayer.
                      getPlaylist();

                  if (
                    Array.isArray(
                      latest
                    ) &&
                    latest.length &&
                    latest.join("|") !==
                      youtubeIds.join("|")
                  ) {
                    youtubeIds =
                      latest.slice();

                    buildArchiveItems();
                  }

                  // Pausing YouTube while opening Spotify also emits a
                  // YouTube state change. It must not steal the selection.
                  if (archiveItems[currentIndex]?.type !== "youtube") {
                    return;
                  }

                  const providerIndex =
                    youtubePlayer.
                      getPlaylistIndex();

                  if (pendingYoutubeStart && providerIndex !== pendingYoutubeStart.providerIndex) {
                    return;
                  }

                  if (
                    Number.isInteger(
                      providerIndex
                    ) &&
                    providerIndex >= 0
                  ) {
                    const globalIndex =
                      archiveItems.
                        findIndex(
                          (item) =>
                            item.type ===
                              "youtube" &&
                            item.
                              providerIndex ===
                              providerIndex
                        );

                    if (
                      globalIndex >= 0
                    ) {
                      currentIndex =
                        globalIndex;
                      selectedIndexes.youtube = currentIndex;

                      syncUi(true);
                    }
                  }

                  applyPendingYoutubeStart();
                } catch {
                  /* Keep current archive state. */
                }
              },

              onError() {
                setLoading(false);

                if (
                  youtubeReady
                ) {
                  hideError();
                  return;
                }

                youtubeFailed =
                  true;

                updateGlobalError();
              }
            }
          }
        );
    } catch {
      youtubePlayerInitStarted =
        false;

      youtubeFailed =
        true;

      setLoading(false);
      updateGlobalError();
    }
  }

  window.onYouTubeIframeAPIReady =
    function onYouTubeIframeAPIReady() {
      initialiseYouTubePlayer();
    };

  function loadYouTubeIframeApi() {
    if (
      window.YT &&
      typeof window.YT.Player ===
        "function"
    ) {
      initialiseYouTubePlayer();
      return;
    }

    if (youtubeApiRequested) {
      return;
    }

    youtubeApiRequested =
      true;

    const script =
      document.createElement(
        "script"
      );

    script.src =
      "https://www.youtube.com/iframe_api";

    script.async =
      true;

    script.dataset.youtubeIframeApi =
      "true";

    script.addEventListener(
      "error",
      () => {
        youtubeFailed =
          true;

        setLoading(false);
        updateGlobalError();
      },
      {
        once: true
      }
    );

    document.head.appendChild(
      script
    );
  }

  /*
    Spotify oEmbed metadata is optional.
    If unavailable, the archive keeps its fallback AUDIO labels.
  */
  async function hydrateSpotifyMetadata() {
    let changed =
      false;

    for (
      const episode of
      SPOTIFY_EPISODES
    ) {
      try {
        const endpoint =
          "https://open.spotify.com/oembed?url=" +
          encodeURIComponent(
            episode.url
          );

        const response =
          await fetch(
            endpoint,
            {
              mode: "cors"
            }
          );

        if (!response.ok) {
          continue;
        }

        const data =
          await response.json();

        if (
          data &&
          typeof data.title ===
            "string" &&
          data.title.trim()
        ) {
          episode.title =
            data.title.trim();

          changed =
            true;
        }

        if (
          data &&
          typeof data.thumbnail_url ===
            "string" &&
          data.thumbnail_url
        ) {
          episode.thumbnail =
            data.thumbnail_url;

          changed =
            true;
        }
      } catch {
        /*
          Metadata is enhancement only.
          Spotify playback does not depend on it.
        */
      }
    }

    if (changed) {
      buildArchiveItems();

      const item =
        archiveItems[
          currentIndex
        ];

      if (
        item &&
        item.type ===
          "spotify"
      ) {
        updateTitleForItem(
          item
        );
      }
    }
  }

  /*
    Start providers.
  */
  buildArchiveItems();
  syncUi(false);

  loadYouTubeIframeApi();

  hydrateSpotifyMetadata();

  /*
    YouTube API may already exist or expose itself without firing
    the global callback in a cached-browser race.
  */
  const youtubePoll =
    window.setInterval(
      () => {
        if (youtubeReady) {
          window.clearInterval(
            youtubePoll
          );

          return;
        }

        initialiseYouTubePlayer();
      },
      250
    );

  window.setTimeout(
    () => {
      window.clearInterval(
        youtubePoll
      );

      if (!youtubeReady) {
        youtubeFailed =
          true;

        setLoading(false);
        updateGlobalError();
      }
    },
    20000
  );

  root.dataset.playlistUrl =
    YOUTUBE_PLAYLIST_URL;
})();
