/** Block-letter "GIT MENTOR" banner — shared by CLI and README. */
export const LOGO = [
  "   ________________   __  __________   ____________  ____ ",
  "  / ____/  _/_  __/  /  |/  / ____/ | / /_  __/ __ \\/ __ \\",
  " / / __ / /  / /    / /|_/ / __/ /  |/ / / / / / / / /_/ /",
  "/ /_/ // /  / /    / /  / / /___/ /|  / / / / /_/ / _, _/ ",
  "\\____/___/ /_/    /_/  /_/_____/_/ |_/ /_/  \\____/_/ |_|  ",
] as const;

export const LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length));

export const LOGO_TAGLINE = "Evidence-backed GitHub career coach";
