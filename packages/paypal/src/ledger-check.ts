import 'dotenv/config';
import { createPayPalClient } from './client';
import { LedgerReader } from './ledger';

const ledger = new LedgerReader(createPayPalClient());

async function main() {
  console.log(await ledger.capture('0LG43187XS929994B')); // A: expect PARTIALLY_REFUNDED, $40
  console.log(await ledger.capture('5HK89395SD077770B')); // B: expect REFUNDED, $40
  console.log(await ledger.refund('4C249073HD434721G'));  // expect $10, captureId 0LG43187XS929994B
  console.log(await ledger.refund('18R189968Y891684C'));  // expect $40, captureId 5HK89395SD077770B
  console.log(await ledger.refund('NOTAREALREFUND123'));  // expect null
}

main().catch((err) => { console.error(err); process.exit(1); });