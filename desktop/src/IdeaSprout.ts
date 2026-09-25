import { createLucideIcon } from "lucide-react";

/** Keep in sync with assets/tray.png and tray@2x.png, which are rendered from this geometry. */
export const IdeaSprout = createLucideIcon("idea-sprout", [
  [
    "path",
    {
      d: "M15 15.5C15.27 14.42 15.93 13.66 17 12.79C18.33 11.82 19 10.41 19 9A7 7 0 0 0 5 9C5 10.41 5.67 11.82 7 12.79C8.07 13.66 8.73 14.42 9 15.5",
      key: "bulb",
    },
  ],
  ["path", { d: "M9 18.75h6", key: "base" }],
  ["path", { d: "M10 22h4", key: "tip" }],
  ["path", { d: "M12 15.6V11.79", key: "stem" }],
  [
    "path",
    {
      d: "M12 11.41C14.89 11.86 17.18 9.45 16.57 6.58C13.68 6.13 11.39 8.54 12 11.41Z",
      fill: "currentColor",
      stroke: "none",
      key: "right-leaf",
    },
  ],
  [
    "path",
    {
      d: "M12 12.68C12.26 10.2 10.11 8.3 7.68 8.87C7.42 11.35 9.58 13.25 12 12.68Z",
      fill: "currentColor",
      stroke: "none",
      key: "left-leaf",
    },
  ],
]);
