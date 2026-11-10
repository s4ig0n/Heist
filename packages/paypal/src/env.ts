// Loads packages/paypal/.env wherever a script is run from. Variables already set, such as a host's, win.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

export const MERCHANT_PATH = fileURLToPath(new URL('../../../data/merchant.json', import.meta.url));
