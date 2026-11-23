// Grote, gewogen antwoordregisters per vraag. De vier modules zijn
// vraagspecifiek: ze bevatten tientallen synoniemen, varianten en deep cuts
// per signaal, verdeeld over common → uncommon → rare → ghost.

import { SIGNAL_GRID_RECOGNITION } from './signal-grid.js';
import { NEON_BIO_RECOGNITION } from './neon-bio.js';
import { ARCHIVE_VOID_RECOGNITION } from './archive-void.js';
import { STREET_GLITCH_RECOGNITION } from './street-glitch.js';

export const RECOGNITION = {
  ...SIGNAL_GRID_RECOGNITION,
  ...NEON_BIO_RECOGNITION,
  ...ARCHIVE_VOID_RECOGNITION,
  ...STREET_GLITCH_RECOGNITION,
};

export const RECOGNITION_TIERS = ['common', 'uncommon', 'rare', 'ghost'];
