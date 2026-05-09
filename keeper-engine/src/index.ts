import {
  MOCK_DRIFT, MOCK_JITO, EQUITY_INTERVAL_MS, YIELD_INTERVAL_MS,
  connection, adminKeypair,
} from './config.js';
import { initDriftClient, createDriftUserAccount, simulateFundingAccrual } from './drift-client.js';
import { initJitoClient, simulateExchangeRateAppreciation } from './jito-client.js';
import { fetchVaultConfig, fetchSlvtSupply } from './vault-interactions.js';
import { calculateEquity } from './equity-calculator.js';
import { accrueYield } from './yield-calculator.js';
import { pushEquityUpdate, rebalance, healthCheck, checkAndRedeployLimboSol } from './rebalancer.js';

let equityInterval: ReturnType<typeof setInterval> | null = null;
let yieldInterval: ReturnType<typeof setInterval> | null = null;

async function equityTick(): Promise<void> {
  try {
    const vaultConfig = await fetchVaultConfig();
    if (!vaultConfig) {
      console.log('[keeper] No VaultConfig found — is protocol initialized?');
      return;
    }
    const slvtSupply = await fetchSlvtSupply();
    const equity = await calculateEquity(slvtSupply, vaultConfig.liquidityBufferBps);

    console.log(`[keeper] vault=${(equity.vaultSolLamports / 1e9).toFixed(4)} SOL | equity=${equity.totalEquityUsd}¢ | solvency=${equity.solvencyPercent}% | price=${equity.solPriceUsd}¢`);

    await pushEquityUpdate(equity);
    await rebalance(equity);
    await healthCheck(equity);
  } catch (err) {
    console.error('[keeper] Equity tick failed:', err);
  }
}

async function yieldTick(): Promise<void> {
  try {
    if (MOCK_DRIFT) simulateFundingAccrual();
    if (MOCK_JITO) simulateExchangeRateAppreciation();
    await accrueYield();
  } catch (err) {
    console.error('[keeper] Yield tick failed:', err);
  }
}

async function startup(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Solvent Protocol — Keeper Engine');
  console.log('='.repeat(60));
  console.log(`  RPC:          ${process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com'}`);
  console.log(`  Admin:        ${adminKeypair.publicKey.toBase58()}`);
  console.log(`  MOCK_DRIFT:   ${MOCK_DRIFT}`);
  console.log(`  MOCK_JITO:    ${MOCK_JITO}`);
  console.log(`  Equity tick:  ${EQUITY_INTERVAL_MS}ms`);
  console.log(`  Yield tick:   ${YIELD_INTERVAL_MS}ms`);
  console.log('='.repeat(60));

  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`[startup] Admin wallet balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.05 * 1e9) {
    console.warn('[startup] Low SOL balance — may not have enough for tx fees');
  }

  await initDriftClient();
  if (!MOCK_DRIFT) {
    await createDriftUserAccount();
  }

  await initJitoClient();

  await checkAndRedeployLimboSol();

  const vaultConfig = await fetchVaultConfig();
  if (!vaultConfig) {
    console.error('[startup] No VaultConfig found — run init_protocol first!');
    process.exit(1);
  }
  console.log(`[startup] Protocol loaded: admin=${vaultConfig.adminPubkey.toBase58()} frozen=${vaultConfig.isFrozen} buffer_bps=${vaultConfig.liquidityBufferBps}`);

  console.log('[startup] Running initial equity tick...');
  await equityTick();

  console.log('[startup] Running initial yield tick...');
  await yieldTick();

  equityInterval = setInterval(equityTick, EQUITY_INTERVAL_MS);
  yieldInterval = setInterval(yieldTick, YIELD_INTERVAL_MS);

  console.log(`[startup] Keeper running. Equity every ${EQUITY_INTERVAL_MS / 1000}s, Yield every ${YIELD_INTERVAL_MS / 1000}s`);
}

function shutdown(): void {
  if (equityInterval) clearInterval(equityInterval);
  if (yieldInterval) clearInterval(yieldInterval);
  console.log('[shutdown] Keeper stopped.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startup().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
