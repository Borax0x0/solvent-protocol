import { getSolPriceUsd } from './oracle.js';
import { fetchVaultEscrowBalance, fetchVaultConfig, type VaultConfigData } from './vault-interactions.js';
import { getDriftPosition, type DriftPosition } from './drift-client.js';
import { getJitoPosition, type JitoPosition } from './jito-client.js';

export interface EquityReport {
  totalEquityUsd: number;
  solPriceUsd: number;
  vaultSolLamports: number;
  jitoSolValueLamports: number;
  driftCollateralLamports: number;
  driftUnrealizedPnlUsd: number;
  deployableSolLamports: number;
  minBufferLamports: number;
  slvtSupply: number;
  solvencyPercent: number;
}

export async function calculateEquity(slvtSupply: number, bufferBps: number): Promise<EquityReport> {
  const { priceCents, priceUsd } = await getSolPriceUsd();
  const solPriceCents = priceCents;

  const vaultSolLamports = await fetchVaultEscrowBalance();
  const jitoPosition = await getJitoPosition();
  const driftPosition = await getDriftPosition();

  const vaultSolUsd = (vaultSolLamports / 1e9) * priceCents;
  const jitoSolUsd = jitoPosition.solValue * priceCents;
  const driftCollateralUsd = driftPosition.collateralSol * priceCents;
  const driftPnlUsd = driftPosition.unrealizedPnlUsd;

  const totalEquityUsd = Math.floor(vaultSolUsd + jitoSolUsd + driftCollateralUsd + driftPnlUsd);

  const minBufferLamports = slvtSupply > 0 && solPriceCents > 0
    ? Number((BigInt(slvtSupply) * BigInt(bufferBps) * BigInt(100_000_000_000)) / BigInt(10000) / BigInt(solPriceCents))
    : 0;
  const deployableSolLamports = Math.max(0, vaultSolLamports - Number(minBufferLamports));

  const solvencyPercent = slvtSupply > 0
    ? Math.min(100, Math.floor(totalEquityUsd * 100 / slvtSupply))
    : 100;

  return {
    totalEquityUsd,
    solPriceUsd: solPriceCents,
    vaultSolLamports,
    jitoSolValueLamports: Math.floor(jitoPosition.solValue * 1e9),
    driftCollateralLamports: Math.floor(driftPosition.collateralSol * 1e9),
    driftUnrealizedPnlUsd: driftPnlUsd,
    deployableSolLamports,
    minBufferLamports: Number(minBufferLamports),
    slvtSupply,
    solvencyPercent,
  };
}
