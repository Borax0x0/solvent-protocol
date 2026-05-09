import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSolPriceUsd } from './oracle.js';
import { fetchStakingState, updateYield, type StakingStateData } from './vault-interactions.js';
import { getDriftPosition, markFundingAccrued } from './drift-client.js';
import { getJitoPosition, markYieldAccrued } from './jito-client.js';

const STATE_FILE = resolve(import.meta.dirname, '../keeper-state.json');

export interface KeeperState {
  receiptIndex: number;
  lastYieldTimestamp: number;
  lastJitoExchangeRate: number;
  lastDriftFundingUsd: number;
}

function loadState(): KeeperState {
  if (!existsSync(STATE_FILE)) {
    return {
      receiptIndex: 0,
      lastYieldTimestamp: 0,
      lastJitoExchangeRate: 1.0,
      lastDriftFundingUsd: 0,
    };
  }
  const raw = readFileSync(STATE_FILE, 'utf-8');
  return JSON.parse(raw) as KeeperState;
}

function saveState(state: KeeperState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function recoverReceiptIndexFromChain(): Promise<number> {
  const stakingState = await fetchStakingState();
  if (!stakingState) return 0;
  let idx = 0;
  try {
    for (let i = 0; i < 1000; i++) {
      const { PublicKey } = await import('@solana/web3.js');
      const { PROGRAM_ID } = await import('./config.js');
      const idxBuf = Buffer.alloc(4);
      idxBuf.writeUInt32LE(i, 0);
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('yield_receipt'), idxBuf],
        PROGRAM_ID
      );
      const { connection } = await import('./config.js');
      const acct = await connection.getAccountInfo(pda);
      if (!acct) break;
      idx = i + 1;
    }
  } catch {
    idx = 0;
  }
  return idx;
}

export async function accrueYield(): Promise<{ success: boolean; newRate: bigint; txSig?: string }> {
  const state = loadState();
  const stakingState = await fetchStakingState();

  if (!stakingState) {
    console.log('[yield] No staking state found — skipping yield accrual');
    return { success: false, newRate: 0n };
  }

  if (stakingState.totalStakedSlvt === 0n) {
    console.log('[yield] No staked SLVT — skipping yield accrual');
    return { success: false, newRate: stakingState.sslvtExchangeRate };
  }

  const { priceCents } = await getSolPriceUsd();
  const jitoPosition = await getJitoPosition();
  const driftPosition = await getDriftPosition();

  const jitoYieldSol = jitoPosition.yieldSinceLastAccrualSol;
  const jitoYieldUsd = Math.floor(jitoYieldSol * priceCents);
  const driftFundingUsd = Math.floor(driftPosition.fundingPnlSinceLastAccrual);
  const totalYieldUsd = jitoYieldUsd + driftFundingUsd;

  if (totalYieldUsd === 0) {
    console.log('[yield] No yield to accrue — skipping');
    return { success: false, newRate: stakingState.sslvtExchangeRate };
  }

  const totalStaked = Number(stakingState.totalStakedSlvt);
  const oldRate = Number(stakingState.sslvtExchangeRate);
  const newRateNum = Math.floor(oldRate * (totalStaked + totalYieldUsd) / totalStaked);
  const newRate = BigInt(newRateNum);

  if (newRate <= stakingState.sslvtExchangeRate) {
    console.log('[yield] New rate would not increase — keeping flat');
    return { success: false, newRate: stakingState.sslvtExchangeRate };
  }

  try {
    const txSig = await updateYield(newRate, BigInt(jitoYieldUsd), BigInt(driftFundingUsd), state.receiptIndex);
    console.log(`[yield] Accrued yield: jito=${jitoYieldUsd}¢ drift=${driftFundingUsd}¢ total=${totalYieldUsd}¢ rate=${oldRate}→${newRateNum} receipt=#${state.receiptIndex} sig=${txSig}`);

    markFundingAccrued();
    markYieldAccrued();

    state.receiptIndex++;
    state.lastYieldTimestamp = Date.now();
    state.lastJitoExchangeRate = jitoPosition.exchangeRate;
    state.lastDriftFundingUsd = driftPosition.unrealizedPnlUsd;
    saveState(state);

    return { success: true, newRate, txSig };
  } catch (err) {
    console.error('[yield] Failed to update yield:', err);
    return { success: false, newRate: stakingState.sslvtExchangeRate };
  }
}
