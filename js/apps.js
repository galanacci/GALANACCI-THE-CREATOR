export const APPS = Object.freeze([
  {
    id: "pog-exe",
    label: "PoG.EXE",
    icon: new URL("../assets/icons/PoG.EXE.svg", import.meta.url).href,
    url: "https://pioneersofgreatness.com/?launch=pog",
    enabled: true
  },
  {
    id: "experiments-folder",
    label: "EXPERIMENTS",
    icon: new URL("../assets/icons/Experiments.FOLDER.svg", import.meta.url).href,
    url: "./experiments/",
    type: "folder",
    enabled: true
  }

  // Add future applications here.
  //
  // {
  //   id: "xyt-exe",
  //   label: "XY+T.EXE",
  //   icon: "assets/icons/XYT.EXE.svg",
  //   url: "./experiments/xyt/",
  //   enabled: true
  // }
]);
