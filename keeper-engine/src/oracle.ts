import { HermesClient } from '@pythnetwork/hermes-client';

const SOL_USD_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

const hermes = new HermesClient('https://hermes.pyth.network');

export async function getSolPriceUsd(): Promise<{ priceCents: number; priceUsd: number }> {
  const updates = await hermes.getLatestPriceUpdates([SOL_USD_FEED_ID]);
  const parsed = updates.parsed?.[0];
  if (!parsed) throw new Error('No SOL/USD price from Pyth Hermes');

  const { price, expo } = parsed.price;
  const priceUsd = Number(price) * Math.pow(10, Number(expo));
  const priceCents = Math.round(priceUsd * 100);

  return { priceCents, priceUsd };
}
