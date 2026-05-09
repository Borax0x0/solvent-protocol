# Keeper Engine — Implementation Plan

## Overview

The Keeper Engine is an off-chain TypeScript daemon that deploys vault SOL into yield strategies, monitors positions, and pushes equity/yield data to the on-chain program.

### Core Loop
```
1. Read vault state (VaultConfig, StakingState, vault_escrow balance)
2. Read SOL/USD price from Pyth Hermes
3. Calculate total equity across all positions
4. Push update_equity to on-chain program
5. Calculate yield since last accrual
6. Push update_yield to on-chain program
7. Rebalance positions if allocation has drifted
8. Health check on Drift margin
9. Repeat
```

---

## Architecture Decisions (Decided)

### A1. Strategy Allocation: 50/50 Split
- 50% of deployable SOL → JitoSOL staking
- 50% of deployable SOL → Drift SOL-PERP short collateral
- **Why**: Simple, balanced, easy to explain in the pitch. Dynamic allocation is post-hackathon.
- **Rebalance threshold**: When actual ratio drifts >5% from target (45/55 or 55/45), rebalance.

### A2. Keypair: Reuse Admin Keypair
- Same keypair for on-chain admin and off-chain keeper
- `admin_withdraw` sends SOL to admin wallet → keeper naturally receives it
- One keypair to manage, one `.env` entry
- **Why**: Less complexity, no SOL transfer between wallets needed

### A3. No New On-Chain Instructions
- Keeper orchestrates off-chain using existing `admin_withdraw` + `admin_deposit`
- No CPI into Jito/Drift from the Anchor program
- **Why**: Zero risk of breaking 19 passing tests. Keeper is off-chain logic.

### A4. Oracle: Pyth Hermes (Off-Chain Only)
- Use `@pythnetwork/hermes-client` to read SOL/USD price
- No on-chain Pyth VAA submission needed
- Push price to Anchor program via `update_equity`
- **Feed ID**: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` (same for devnet + mainnet)
- **Why**: Free, simple, one function call. No on-chain cost.

### A5. Drift SDK: `@drift-labs/sdk`
- Official Drift Protocol v2 SDK
- Devnet supported, same program ID across networks: `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH`
- SOL spot market index: **1**, SOL-PERP market index: **0**
- **Why**: Proven, documented, TypeScript-native, devnet works

### A6. JitoSOL: `@solana/spl-stake-pool`
- Standard SPL Stake Pool program — JitoSOL is just a stake pool token
- No special Jito SDK needed for staking
- **Devnet pool**: `JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ`
- **Devnet JitoSOL mint**: `J1tos8mqbhdGcF3pgj4PCKyVjzWSURcpLZU7pPGHxSYi`
- **Mainnet pool**: `Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb`
- **Mainnet JitoSOL mint**: `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn`
- **Devnet stake pool program**: `DPoo15wWDqpPJJtS2MUZ49aRxqz5ZaaJCJP4z8bLuib`
- **Mainnet stake pool program**: `SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy`
- **Why**: It's how JitoSOL works — standard stake pool. No alternative.

### A7. Mock Mode: `MOCK_DRIFT` and `MOCK_JITO` Env Flags (FIRST-CLASS)
- `MOCK_DRIFT=true` → drift-client returns simulated collateral value and funding payments instead of calling real Drift SDK
- `MOCK_JITO=true` → jito-client returns simulated JitoSOL balance with slowly appreciating exchange rate (+0.001% per interval) instead of calling real SPL stake pool
- **These are not hacks** — they are legitimate modes that let the keeper loop run end-to-end even when devnet infrastructure is uncooperative
- **Production path**: both flags `false` → real SDK calls. Demo path: one or both `true` → mock data
- **Why**: Drift devnet orderbook for SOL-PERP is often completely empty. JitoSOL devnet pool may outright fail on `depositSol` if reserve is empty or validators aren't active. Mock mode de-risks external dependency hell completely. You always have something working to show.

---

## Architecture Decisions (Resolved)

### O1. Drift Short Entry: Market Order
- Use `getMarketOrderParams` for immediate fill
- **Why**: Simpler, no price discovery needed. If devnet books are empty, fall back to `MOCK_DRIFT=true`
- **Risk**: Slippage on thin devnet books → mitigated by mock mode

### O2. Drift User Account Creation: On Startup
- Check if Drift UserAccount exists on startup, create if missing
- **Why**: Self-contained, keeper handles its own setup. No manual pre-creation step.
- **Cost**: ~0.035 SOL rent (one-time)

### O3. JitoSOL Withdrawal: Adjust New Deposits Only (Hackathon)
- Don't withdraw from Jito for rebalancing — just redirect new `admin_withdraw` proceeds to the underweight strategy
- **Why**: `withdrawStake` requires epoch wait, `withdrawSol` usually blocked by Jito pool config, Jupiter swap adds slippage complexity. Adjusting new deposits is zero-friction.
- **Crisis scenario**: For Drift margin calls, use `withdrawStake` + epoch wait as fallback (post-hackathon hardening)

### O4. Equity Calculation Frequency: Every 60s + Yield Every 5min
- Equity update + health check every 60 seconds
- Yield accrual every 5 minutes
- **Why**: Matches architecture spec. Responsive enough to catch margin issues. 5min yield interval avoids excessive on-chain txs.

### O5. Yield Tracking: Stateful JSON File
- `keeper-state.json` stores `receipt_index`, `last_yield_timestamp`, `cumulative_jito_yield`, `cumulative_drift_funding`, `jito_exchange_rate_at_last_accrual`
- On restart, `receipt_index` recovered by scanning on-chain YieldReceipts
- **Why**: Drift funding PnL is cumulative on-chain — can't diff it stateless. Simple JSON file handles this. No SQLite overhead needed.

### O6. Error Recovery: Retry with Backoff
- 3 retries with exponential backoff for RPC/tx failures
- Skip non-critical errors (yield calculation when no positions)
- Halt only on keypair/env config errors
- **Why**: Handles transient RPC failures without stopping the keeper. Safe default.

---

## Critical Design Note: SOL in Limbo

After `admin_withdraw`, SOL leaves `vault_escrow` and goes to the keeper wallet before being deployed to Jito/Drift. If the keeper crashes between `admin_withdraw` and the deposit, that SOL is in limbo — not in vault_escrow, not in Jito, not in Drift. The equity calc will miss it.

**Mitigation**: On startup, check if keeper wallet SOL > expected tx fee reserve. If so, assume it's undeployed capital and re-deploy before starting the main loop.

```
startup:
  keeper_sol = getBalance(adminWallet)
  fee_reserve = 0.1 SOL
  if keeper_sol > fee_reserve:
    undeployed = keeper_sol - fee_reserve
    log("FOUND ${undeployed} undeployed SOL in keeper wallet — re-deploying")
    // split and deploy to Jito + Drift per 50/50 allocation
```

---

## Data Flow

```
Users deposit SOL → vault_escrow PDA
                         │
                    admin_withdraw
                         ↓
                   Keeper wallet (admin)
                    ╱              ╲
           depositSol()         driftClient.deposit()
                ↓                      ↓
          JitoSOL tokens         Drift collateral
          (appreciating)         + SOL-PERP short
                │                      │
           exchange rate          funding payments
                │                      │
                ╲              ╱
            yield-calculator.ts
                 new_exchange_rate
                 jito_yield_usd
                 drift_funding_usd
                       │
                 update_yield (on-chain)
                 update_equity (on-chain)
                       │
               YieldReceipt PDAs ← audit trail
               VaultConfig.total_equity_usd ← solvency tracking
```

## Detailed Data Flow for Equity Calculation

```
oracle.ts → SOL/USD price (cents)
jito-client.ts → JitoSOL balance × exchange rate = JitoSOL_value (SOL)
drift-client.ts → Drift collateral (SOL) + unrealized PnL (USD)
vault_escrow → remaining SOL balance
keeper_wallet → SOL in limbo (undeployed, detected at startup)

equity-calculator.ts:
  total_equity_usd = (
    vault_escrow_sol
    + jitoSOL_balance × jito_exchange_rate × sol_price / 1e9
    + drift_collateral_sol × sol_price / 1e9
    + drift_unrealized_pnl_usd
  ) in USD cents

  → push to update_equity(total_equity_usd, sol_price_usd)
```

## Detailed Data Flow for Yield Calculation

```
jito-client.ts → JitoSOL exchange rate (current vs at last accrual)
  jito_yield_sol = jitoSOL_balance × (current_rate - rate_at_last_accrual)
  jito_yield_usd = jito_yield_sol × sol_price

drift-client.ts → Cumulative funding payments on SOL-PERP short position
  drift_funding_usd = funding_pnl_since_last_accrual

yield-calculator.ts:
  total_yield_usd = jito_yield_usd + drift_funding_usd

  new_exchange_rate = old_rate × (total_staked_slvt + total_yield_usd) / total_staked_slvt

  → push to update_yield(new_exchange_rate, jito_yield_usd, drift_funding_usd, receipt_index)
  → receipt_index++
  → save to keeper-state.json
```

---

## File Structure

```
keeper-engine/
├── src/
│   ├── index.ts              # Entry point, starts cron jobs
│   ├── config.ts             # Loads .env (admin keypair, RPC endpoint, program ID)
│   ├── drift-client.ts       # Drift SDK wrapper (deposit, short, health, withdraw) + mock mode
│   ├── jito-client.ts        # JitoSOL staking via @solana/spl-stake-pool + mock mode
│   ├── oracle.ts             # Pyth Hermes client (SOL/USD price)
│   ├── vault-interactions.ts # Calls Anchor program (admin_withdraw/deposit, update_equity, update_yield)
│   ├── equity-calculator.ts  # total_equity = vault_SOL + JitoSOL_value + Drift_collateral+PnL
│   ├── yield-calculator.ts   # new sSLVT rate from Jito yield + Drift funding
│   └── rebalancer.ts         # Decides when to move SOL between vault/strategies
├── keeper-state.json         # Persisted state (receipt_index, last_yield_timestamp, yield tracking)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Implementation Steps (Deadline-Aware Order)

**Goal**: Have a working keeper loop running end-to-end by tomorrow night, regardless of external SDK cooperation. Then layer in real integrations.

| Step | File | What | Mock/Real | Est. Time |
|------|------|------|-----------|-----------|
| **1** | Project scaffold | `keeper-engine/` with package.json, tsconfig, .env.example, src/ dirs | N/A | 15 min |
| **2** | `config.ts` + `index.ts` skeleton | Load .env, init provider, set up cron loop structure with logging | N/A | 45 min |
| **3** | `oracle.ts` | Pyth Hermes client, SOL/USD price feed | Real (just works) | 30 min |
| **4** | `vault-interactions.ts` | Build Anchor instructions for `admin_withdraw`, `admin_deposit`, `update_equity`, `update_yield`. Read VaultConfig + StakingState | Real (testable on devnet immediately) | 1 hr |
| **5** | Mock `drift-client.ts` | Stub that returns simulated collateral, funding, health. Accepts deposit/withdraw calls (no-ops). | **Mock** | 30 min |
| **6** | Mock `jito-client.ts` | Stub that returns simulated JitoSOL balance with slowly appreciating exchange rate (+0.001%/interval). Accepts deposit calls (no-op). | **Mock** | 30 min |
| **7** | `equity-calculator.ts` | Sum vault_SOL + JitoSOL_value + Drift_collateral + Drift_PnL, convert to USD cents. Uses oracle + strategy clients. | Mock inputs | 45 min |
| **8** | `yield-calculator.ts` | Track jito_yield + drift_funding since last accrual. Compute new sSLVT exchange rate. Track receipt_index via keeper-state.json | Mock inputs | 1 hr |
| **9** | `rebalancer.ts` | 50/50 target. Rebalance when >5% drift. Buffer replenishment. Health check. Funding rate monitoring | Mock inputs | 1 hr |
| **10** | Wire `index.ts` | Cron loop: equity every 60s, yield every 5min, health every 5min. Startup: re-deploy limbo SOL. Full loop working with mocks. | **Mock mode working end-to-end** | 1 hr |
| **11** | Devnet deploy | Deploy program to devnet, init protocol, deposit test SOL, run keeper → verify update_equity + update_yield txs land | Real (on-chain) | 1 hr |
| **12** | Real `drift-client.ts` | Init DriftClient (devnet), create UserAccount, deposit SOL, open SOL-PERP short, check health/PnL/funding, withdraw. Gate behind `MOCK_DRIFT` flag. Timebox: 4 hours max, fall back to mock if blocked. | **Real (with mock fallback)** | 2-4 hr |
| **13** | Real `jito-client.ts` | `depositSol` into Jito stake pool, check JitoSOL balance + exchange rate. Gate behind `MOCK_JITO` flag. Timebox: 2 hours max, fall back to mock if blocked. | **Real (with mock fallback)** | 1-2 hr |
| **14** | Integration test | Run keeper against devnet with real or mock strategies. Verify YieldReceipts on-chain, sSLVT rate increases, equity tracks correctly. | Either | 1 hr |
| **15** | Document | Update AGENTS.md with keeper details, addresses, commands | N/A | 30 min |

**Total: ~12 hours** (mock-first path: ~8 hours to working demo, real integrations: +4 hours)

### Timebox Rules
- **Drift integration (Step 12)**: 4 hours max. If Drift SDK fights you (empty orderbook, silent init failures, API confusion), switch to `MOCK_DRIFT=true` and move on. The architecture is proven; the demo doesn't depend on Drift being cooperative.
- **Jito integration (Step 13)**: 2 hours max. If `depositSol` fails on devnet (empty reserve, no validators), switch to `MOCK_JITO=true`. Same reasoning.

---

## Dependencies

| Package | Version | Purpose | Required For |
|---------|---------|---------|-------------|
| `@drift-labs/sdk` | ^2.x | Drift perp positions, deposits, withdrawals | Real drift-client only |
| `@solana/spl-stake-pool` | ^1.1.8 | JitoSOL staking (depositSol/withdrawStake) | Real jito-client only |
| `@pythnetwork/hermes-client` | latest | Off-chain SOL/USD price | oracle.ts (always) |
| `@coral-xyz/anchor` | ^0.32.1 | Anchor instruction building | vault-interactions.ts (always) |
| `@solana/web3.js` | ^1.98.4 | Connection, transactions, keypairs | config.ts (always) |
| `@solana/spl-token` | ^0.4.x | Token account ops | Real jito-client only |
| `dotenv` | ^16.x | .env loading | config.ts (always) |
| `node-cron` | ^3.x | Cron scheduling | index.ts (always) |

> Drift and Jito packages are optional — only needed when running with `MOCK_DRIFT=false` and `MOCK_JITO=false`. The keeper runs without them in mock mode.

---

## Key Addresses

| Item | Devnet | Mainnet |
|------|--------|---------|
| Solvent Program | `5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho` | TBD (deploy) |
| Drift Program | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` | same |
| Jito Stake Pool | `JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ` | `Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb` |
| JitoSOL Mint | `J1tos8mqbhdGcF3pgj4PCKyVjzWSURcpLZU7pPGHxSYi` | `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` |
| SPL Stake Pool Program | `DPoo15wWDqpPJJtS2MUZ49aRxqz5ZaaJCJP4z8bLuib` | `SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy` |
| Pyth SOL/USD Feed | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | same |
| SOL Spot Market (Drift) | index **1** | index **1** |
| SOL-PERP Market (Drift) | index **0** | index **0** |

---

## Mock Mode Details

### Mock Drift Client (`MOCK_DRIFT=true`)
```typescript
// Returns simulated values:
// - collateral: 0.5 SOL (as if 0.5 SOL was deposited)
// - health: 3.0 (healthy, between 2x and 5x)
// - unrealizedPnl: +0.001 SOL equivalent (simulated positive funding)
// - fundingPnlSinceLastAccrual: increases by ~0.00005 SOL per 5min interval
// - deposit/withdraw: no-ops, just update internal tracking
// - openShort: no-op, just update internal tracking
```

### Mock Jito Client (`MOCK_JITO=true`)
```typescript
// Returns simulated values:
// - jitoSOLBalance: 0.5 JitoSOL (as if 0.5 SOL was staked)
// - exchangeRate: starts at 1.0, appreciates by +0.001% per yield interval
// - depositSol: no-op, just update internal tracking
// - This simulates ~7% APY staking yield visually in the demo
```

### Why This Is Legitimate
- The on-chain program is fully tested (19/19 tests passing)
- `update_equity` and `update_yield` instructions work correctly — they accept any values the admin pushes
- The keeper's job is to compute and push correct values — mock mode pushes simulated-but-structurally-correct values
- The YieldReceipt PDA audit trail still works — each receipt has `jito_yield_usd` and `drift_funding_usd` breakdown
- For the demo, the sSLVT exchange rate still appreciates, proving the yield accrual mechanism
- Post-hackathon: switch both flags to `false` for production

---

## Drift SDK Quick Reference

```typescript
import { DriftClient, Wallet, BulkAccountLoader, initialize,
         BN, BASE_PRECISION, PositionDirection, OrderType,
         PerpMarkets, SpotMarkets, getMarketOrderParams } from '@drift-labs/sdk';

// Init client (can take 10-30s for account caches to populate)
const driftClient = new DriftClient({
  connection, wallet, env: 'devnet',
  accountSubscription: { type: 'polling' },
});
await driftClient.subscribe();

// Create user account (if needed)
await driftClient.initializeUserAccount(0, "keeper");

// Deposit SOL (spot market index 1)
await driftClient.deposit(depositAmount, 1, wallet.publicKey);

// Open SOL-PERP short (perp market index 0)
await driftClient.placePerpOrder(getMarketOrderParams({
  marketIndex: 0,
  direction: PositionDirection.SHORT,
  baseAssetAmount: new BN(1).mul(BASE_PRECISION),
}));

// Check health
const user = driftClient.getUser();
const health = user.getHealth();
const freeCollateral = user.getFreeCollateral();
const unrealizedPnl = user.getUnrealizedPerpPnl(0);
const fundingPnl = user.getUnrealizedFundingPnl(0);

// Withdraw
await driftClient.withdraw(withdrawAmount, 1, wallet.publicKey);

// Close short
await driftClient.placePerpOrder({
  orderType: OrderType.MARKET,
  marketIndex: 0,
  direction: PositionDirection.LONG,
  baseAssetAmount: user.getPerpPosition(0).baseAssetAmount,
  reduceOnly: true,
});
```

### Drift Gotchas
- `driftClient.subscribe()` can take 10-30 seconds for account caches to populate. Do NOT assume it's ready immediately.
- Devnet SOL-PERP orderbook is often completely empty. Market orders may fail silently or error.
- Always check `user.hasPerpPosition(0)` before reading position data.
- `getUnrealizedFundingPnl(0)` returns cumulative funding, not incremental. You need to diff it with your stored value.

---

## JitoSOL Quick Reference

```typescript
import * as solanaStakePool from '@solana/spl-stake-pool';

const JITO_STAKE_POOL = new PublicKey('JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ'); // devnet

// Stake SOL → JitoSOL
const { instructions, signers } = await solanaStakePool.depositSol(
  connection, JITO_STAKE_POOL, payer, lamports
);

// Check exchange rate
const pool = await solanaStakePool.getStakePoolAccount(connection, JITO_STAKE_POOL);
const exchangeRate = Number(pool.account.data.totalLamports) / Number(pool.account.data.poolTokenSupply);

// Check JitoSOL token balance
const ata = getAssociatedTokenAddressSync(JITOSOL_MINT, owner);
const tokenAccount = await getAccount(connection, ata);
const balance = Number(tokenAccount.amount);
```

### JitoSOL Gotchas
- `depositSol` may outright fail on devnet if the pool's reserve is empty or validators aren't active. Don't assume it works.
- `withdrawSol` (instant) is usually blocked by Jito pool config. Always use `withdrawStake`.
- `withdrawStake` returns a deactivating stake account — need to wait 1 epoch for SOL.
- JitoSOL is reward-bearing: token count stays the same, each token worth more SOL over time.

---

## Rebalancer Logic (Pseudocode)

```
startup:
  // Check for SOL in limbo (undeployed from previous crash)
  keeper_sol = getBalance(adminWallet)
  fee_reserve = 0.1 SOL
  if keeper_sol > fee_reserve:
    undeployed = keeper_sol - fee_reserve
    log("FOUND ${undeployed} undeployed SOL in keeper wallet — re-deploying")
    // Deploy per 50/50 allocation to Jito + Drift

every 60s:
  sol_price = oracle.getSolPrice()
  vault_sol = getVaultEscrowBalance()
  jito_value_sol = getJitoSOLBalance() × getJitoExchangeRate()
  drift_collateral_sol = driftClient.getCollateralValue()
  drift_pnl_usd = driftClient.getUnrealizedPnl()
  
  total_equity_usd = (vault_sol + jito_value_sol + drift_collateral_sol) × sol_price + drift_pnl_usd
  → update_equity(total_equity_usd, sol_price_cents)

  deployable_sol = vault_sol - min_buffer
  if deployable_sol > 0:
    jito_target = total_deployed × 0.5
    drift_target = total_deployed × 0.5
    
    // If first time: deploy both
    if no_jito_position AND no_drift_position:
      admin_withdraw(deployable_sol)
      jito_deposit(deployable_sol × 0.5)
      drift_deposit(deployable_sol × 0.5)
      drift_open_short(deployable_sol × 0.5 × sol_price) // notional = collateral

every 5min:
  jito_yield = computeJitoYieldSinceLastAccrual()
  drift_funding = computeDriftFundingSinceLastAccrual()
  new_rate = computeNewExchangeRate(jito_yield, drift_funding)
  if new_rate > old_rate:
    → update_yield(new_rate, jito_yield_usd, drift_funding_usd, receipt_index)
    receipt_index++
    saveState()
  else:
    log("Yield flat — rate stays unchanged. (Negative funding offset by Jito yield floor)")

every 5min (health check):
  health = driftClient.getUser().getHealth()
  if health < 2.0:
    // Margin too thin — add more collateral from vault
    admin_withdraw(rebalance_amount)
    drift_deposit(rebalance_amount)
  if health > 5.0 AND vault_sol < min_buffer:
    // Excess margin — withdraw some back to vault
    drift_withdraw(excess_amount)
    admin_deposit(excess_amount)

on every equity update:
  if vault_sol < min_buffer AND jito_value_sol > 0:
    // Buffer depleted — log warning
    // (for hackathon: don't auto-unwind Jito, just warn)
    log("BUFFER LOW: vault_sol below minimum. Consider manual rebalancing.")
```

---

## .env.example

```
# Keeper Engine Configuration
ADMIN_KEYPAIR_PATH=~/.config/solana/id.json
RPC_ENDPOINT=https://api.devnet.solana.com
PROGRAM_ID=5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho
DRIFT_ENV=devnet

# Strategy Modes (set to false for real SDK calls, true for simulated data)
MOCK_DRIFT=true
MOCK_JITO=true

# Cron Intervals
EQUITY_INTERVAL_MS=60000
YIELD_INTERVAL_MS=300000

# Jito Addresses (used when MOCK_JITO=false)
JITO_STAKE_POOL=JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ
JITO_SOL_MINT=J1tos8mqbhdGcF3pgj4PCKyVjzWSURcpLZU7pPGHxSYi
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Drift devnet orderbook empty | High — market orders fail, short can't open | `MOCK_DRIFT=true` as first-class mode. Timebox real integration to 4 hours. |
| JitoSOL devnet pool dead | High — `depositSol` outright fails | `MOCK_JITO=true` as first-class mode. Timebox real integration to 2 hours. |
| Drift SDK init slow/fails silently | Medium — `subscribe()` takes 10-30s | Wait for subscription confirm before starting loop. Log readiness status. |
| `@drift-labs/sdk` API breaking changes | Medium — docs may be stale | Pin version, reference GitHub examples. Fall back to mock. |
| SOL in limbo after crash | Medium — equity calc misses undeployed capital | Startup sanity check: redeploy any SOL in keeper wallet above fee reserve |
| Keeper wallet SOL for tx fees | Low | Airdrop devnet SOL, auto-fund check on startup |
| Admin keypair security | Critical | `.env` only, `.gitignore` enforced, never committed |
| `withdrawStake` epoch delay | Low | Hackathon: adjust new deposits only. Don't withdraw. |
| Funding rate negative for extended period | Medium — yield goes flat | Rate stays flat (floor = Jito staking), per architecture spec |
| Keeper state file corruption | Low — lose receipt_index | Recover receipt_index by scanning on-chain YieldReceipts |
| **Frontend empty with 3 days left** | **High — judges weight UX heavily** | **Run keeper + frontend in parallel. Keeper morning, frontend evening.** |

---

## Parallel Execution Strategy

With 3 days remaining, keeper and frontend must run in parallel:

| Day | Morning | Evening |
|-----|---------|---------|
| **Day 1** | Keeper Steps 1-6 (skeleton + mocks + oracle + vault-interactions) | Frontend: scaffold Next.js, wallet connect, deposit card |
| **Day 2** | Keeper Steps 7-10 (equity + yield + rebalancer + working loop) | Frontend: stake card, protocol health, SLVT/sSLVT balance display |
| **Day 3** | Keeper Steps 11-13 (devnet deploy + real Drift/Jito attempt) | Frontend: yield history, redemption status, polish |
| **Day 3 night** | Integration test + submit | |

---

## Testing Strategy

1. **Unit tests** — each module with mocked RPC/SDK calls
2. **Integration test** — run keeper against devnet with small amounts
3. **End-to-end flow**:
   - Deploy program to devnet
   - Init protocol
   - Deposit SOL (user)
   - Start keeper → watch it deploy to Jito + Drift
   - Watch update_equity + update_yield transactions
   - Verify YieldReceipt PDAs on-chain
   - Verify sSLVT exchange rate increases
4. **Error scenarios**:
   - Drift position liquidation (health check triggers)
   - Buffer depletion (rebalancer warning)
   - RPC timeout (retry with backoff)
   - Keeper restart (state recovery from on-chain)
   - SOL in limbo (startup re-deploy)
