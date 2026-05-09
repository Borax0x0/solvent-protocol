import { adminWithdraw, adminDeposit, updateEquity, fetchVaultConfig, type VaultConfigData } from './vault-interactions.js';
import { depositToDrift, openSolPerpShort, withdrawFromDrift, getDriftPosition } from './drift-client.js';
import { depositSolToJito, getJitoPosition } from './jito-client.js';
import { getSolPriceUsd } from './oracle.js';
import { adminKeypair, connection, MOCK_DRIFT, MOCK_JITO } from './config.js';
import type { EquityReport } from './equity-calculator.js';

const TARGET_RATIO = 0.5;
const REBALANCE_THRESHOLD = 0.05;
const FEE_RESERVE_LAMPORTS = 0.1 * 1e9;

export async function checkAndRedeployLimboSol(): Promise<void> {
  const balance = await connection.getBalance(adminKeypair.publicKey);
  if (balance > FEE_RESERVE_LAMPORTS * 2) {
    const undeployed = balance - FEE_RESERVE_LAMPORTS;
    console.log(`[rebalancer] Found ${(undeployed / 1e9).toFixed(4)} SOL in keeper wallet — re-deploying`);
    await deployToStrategies(undeployed);
  }
}

export async function deployToStrategies(lamports: number): Promise<void> {
  const jitoShare = Math.floor(lamports * TARGET_RATIO);
  const driftShare = lamports - jitoShare;

  console.log(`[rebalancer] Deploying ${(lamports / 1e9).toFixed(4)} SOL: Jito=${(jitoShare / 1e9).toFixed(4)} Drift=${(driftShare / 1e9).toFixed(4)}`);

  try {
    if (!MOCK_JITO) {
      await depositSolToJito(jitoShare);
    } else {
      await depositSolToJito(jitoShare);
    }
  } catch (err) {
    console.error('[rebalancer] Jito deposit failed:', err);
  }

  try {
    if (!MOCK_DRIFT) {
      await depositToDrift(driftShare);
      const { priceUsd } = await getSolPriceUsd();
      const notionalSol = driftShare / 1e9;
      await openSolPerpShort(notionalSol);
    } else {
      await depositToDrift(driftShare);
      const notionalSol = driftShare / 1e9;
      await openSolPerpShort(notionalSol);
    }
  } catch (err) {
    console.error('[rebalancer] Drift deposit/short failed:', err);
  }
}

export async function rebalance(equity: EquityReport): Promise<void> {
  if (equity.deployableSolLamports > 0) {
    const jitoPos = await getJitoPosition();
    const driftPos = await getDriftPosition();

    const totalDeployedSol = jitoPos.solValue + driftPos.collateralSol;

    if (totalDeployedSol === 0 && equity.deployableSolLamports > 0) {
      console.log('[rebalancer] No positions yet — initial deployment');
      try {
        const txSig = await adminWithdraw(BigInt(equity.deployableSolLamports));
        console.log(`[rebalancer] Withdrew ${(equity.deployableSolLamports / 1e9).toFixed(4)} SOL from vault sig=${txSig}`);
        await deployToStrategies(equity.deployableSolLamports);
      } catch (err) {
        console.error('[rebalancer] Initial deployment failed:', err);
      }
      return;
    }

    if (totalDeployedSol > 0) {
      const jitoRatio = jitoPos.solValue / totalDeployedSol;
      const driftRatio = driftPos.collateralSol / totalDeployedSol;

      if (Math.abs(jitoRatio - TARGET_RATIO) > REBALANCE_THRESHOLD) {
        console.log(`[rebalancer] Allocation drifted: Jito=${(jitoRatio * 100).toFixed(1)}% Drift=${(driftRatio * 100).toFixed(1)}% — redirecting new deposits`);
      }
    }

    if (equity.deployableSolLamports > 1_000_000) {
      console.log(`[rebalancer] Excess deployable SOL: ${(equity.deployableSolLamports / 1e9).toFixed(4)} — deploying`);
      try {
        const txSig = await adminWithdraw(BigInt(equity.deployableSolLamports));
        console.log(`[rebalancer] Withdrew excess SOL sig=${txSig}`);
        await deployToStrategies(equity.deployableSolLamports);
      } catch (err) {
        console.error('[rebalancer] Excess deployment failed:', err);
      }
    }
  }
}

export async function healthCheck(equity: EquityReport): Promise<void> {
  const driftPos = await getDriftPosition();

  if (driftPos.hasPosition && driftPos.health < 2.0) {
    console.warn(`[rebalancer] DRIFT MARGIN LOW: health=${driftPos.health.toFixed(2)} — adding collateral`);
    const rebalanceAmount = Math.floor(equity.vaultSolLamports * 0.1);
    if (rebalanceAmount > 0) {
      try {
        const txSig = await adminWithdraw(BigInt(rebalanceAmount));
        await depositToDrift(rebalanceAmount);
        console.log(`[rebalancer] Added ${(rebalanceAmount / 1e9).toFixed(4)} SOL to Drift sig=${txSig}`);
      } catch (err) {
        console.error('[rebalancer] Drift collateral add failed:', err);
      }
    }
  }

  if (driftPos.hasPosition && driftPos.health > 5.0 && equity.vaultSolLamports < equity.minBufferLamports) {
    console.log('[rebalancer] Drift excess margin — withdrawing some back to vault');
    const excessLamports = Math.floor(driftPos.collateralSol * 0.1 * 1e9);
    if (excessLamports > 0) {
      try {
        await withdrawFromDrift(excessLamports);
        const txSig = await adminDeposit(BigInt(excessLamports));
        console.log(`[rebalancer] Returned ${(excessLamports / 1e9).toFixed(4)} SOL to vault sig=${txSig}`);
      } catch (err) {
        console.error('[rebalancer] Drift excess withdrawal failed:', err);
      }
    }
  }

  if (equity.vaultSolLamports < equity.minBufferLamports) {
    const jitoPos = await getJitoPosition();
    if (jitoPos.hasPosition) {
      console.warn(`[rebalancer] BUFFER LOW: vault=${(equity.vaultSolLamports / 1e9).toFixed(4)} SOL < min=${(equity.minBufferLamports / 1e9).toFixed(4)} SOL. Consider manual rebalancing.`);
    }
  }
}

export async function pushEquityUpdate(equity: EquityReport): Promise<void> {
  try {
    const txSig = await updateEquity(BigInt(equity.totalEquityUsd), BigInt(equity.solPriceUsd));
    console.log(`[equity] equity=${equity.totalEquityUsd}¢ price=${equity.solPriceUsd}¢ solvency=${equity.solvencyPercent}% sig=${txSig}`);
  } catch (err) {
    console.error('[equity] Failed to update equity:', err);
  }
}
