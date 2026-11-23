// Grote, gewogen antwoordregisters per vraag. De modules zijn vraagspecifiek:
// ze bevatten tientallen synoniemen, varianten en deep cuts per signaal,
// verdeeld over zes cyberpunk-bands:
//   civilian → noise → runner → operator → ghost → singularity.

import { SIGNAL_GRID_RECOGNITION } from './signal-grid.js';
import { NEON_BIO_RECOGNITION } from './neon-bio.js';
import { ARCHIVE_VOID_RECOGNITION } from './archive-void.js';
import { STREET_GLITCH_RECOGNITION } from './street-glitch.js';
import { TERRAIN_RECOGNITION } from './terrain.js';
import { CLIMATE_RECOGNITION } from './climate.js';
import { CULTURE_RECOGNITION } from './culture.js';
import { CREDITS_RECOGNITION } from './credits.js';

export const RECOGNITION = {
  ...SIGNAL_GRID_RECOGNITION,
  ...NEON_BIO_RECOGNITION,
  ...ARCHIVE_VOID_RECOGNITION,
  ...STREET_GLITCH_RECOGNITION,
  ...TERRAIN_RECOGNITION,
  ...CLIMATE_RECOGNITION,
  ...CULTURE_RECOGNITION,
  ...CREDITS_RECOGNITION,
};

export const RECOGNITION_TIERS = ['civilian', 'noise', 'runner', 'operator', 'ghost', 'singularity'];
