import { adminKeypair } from './config.js';

export interface JitoPosition {
  jitoSolBalance: number;
  exchangeRate: number;
  solValue: number;
  yieldSinceLastAccrualSol: number;
  hasPosition: boolean;
}

const MOCK_EXCHANGE_RATE_APPRECIATION = 0.00001;
const MOCK_YIELD_PER_INTERVAL_SOL = 0.0005;

let mockJitoSolBalance = 0;
let mockExchangeRate = 1.0;
let mockLastAccrualRate = 1.0;
let initialized = false;

export async function initJitoClient(): Promise<void> {
  if (initialized) return;
  console.log('[jito-mock] Initializing mock Jito client');
  initialized = true;
}

export async function depositSolToJito(lamports: number): Promise<void> {
  const sol = lamports / 1e9;
  const jitoSolMinted = sol / mockExchangeRate;
  mockJitoSolBalance += jitoSolMinted;
  console.log(`[jito-mock] Staked ${sol.toFixed(4)} SOL → ${jitoSolMinted.toFixed(6)} JitoSOL. Total: ${mockJitoSolBalance.toFixed(6)} JitoSOL`);
}

export async function withdrawStakeFromJito(jitoSolAmount: number): Promise<void> {
  mockJitoSolBalance = Math.max(0, mockJitoSolBalance - jitoSolAmount);
  console.log(`[jito-mock] Withdrew ${jitoSolAmount.toFixed(6)} JitoSOL. Remaining: ${mockJitoSolBalance.toFixed(6)} JitoSOL`);
}

export async function getJitoPosition(): Promise<JitoPosition> {
  const solValue = mockJitoSolBalance * mockExchangeRate;
  const yieldSinceLastAccrual = mockJitoSolBalance * (mockExchangeRate - mockLastAccrualRate);

  return {
    jitoSolBalance: mockJitoSolBalance,
    exchangeRate: mockExchangeRate,
    solValue,
    yieldSinceLastAccrualSol: yieldSinceLastAccrual,
    hasPosition: mockJitoSolBalance > 0,
  };
}

export function markYieldAccrued(): void {
  mockLastAccrualRate = mockExchangeRate;
}

export function simulateExchangeRateAppreciation(): void {
  if (mockJitoSolBalance > 0) {
    mockExchangeRate += MOCK_EXCHANGE_RATE_APPRECIATION;
  }
}
