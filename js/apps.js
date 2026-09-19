export const APPS = Object.freeze([
  {
    id: "pog-exe",
    label: "PoG.EXE",
    icon: new URL("../assets/icons/PoG.EXE.svg", import.meta.url).href,
    url: "https://pioneersofgreatness.com/?entry=galanacci",
    enabled: true
  },
  {
    id: "experiments-folder",
    label: "APPS",
    icon: new URL("../assets/icons/Experiments.FOLDER.svg", import.meta.url).href,
    type: "folder",
    folderTarget: "apps",
    enabled: true
  },
  {
    id: "ss-folder",
    label: "SS",
    icon: new URL("../assets/icons/Experiments.FOLDER.svg", import.meta.url).href,
    type: "folder",
    folderTarget: "ss",
    enabled: true
  }
]);
