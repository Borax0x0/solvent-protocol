# SUSD Protocol — Implementation Plan

## Current Status

### Anchor Program (`susd-core`)
- [x] Project scaffolded (Anchor.toml, Cargo.toml)
- [x] State structs (VaultConfig, StakingState)
- [x] Error enum (11 errors)
- [x] All 10 instruction files created
- [ ] **NOT COMPILED** — 21 compile errors reported
- [ ] No tests written
- [ ] Missing: YieldReceipt account struct
- [ ] Missing: Proportional redemption logic in redeem.rs
- [ ] Missing: Auto-unfreeze logic in update_equity.rs
- [ ] Missing: YieldReceipt creation in update_yield.rs

### Keeper Engine
- [x] Directory created (`keeper-engine/src/`)
- [ ] All files empty — nothing built

### Web Interface
- [x] Directory created (`web-interface/`)
- [ ] Empty — nothing built

### Tests
- [x] Directory created (`tests/`)
- [ ] Empty — nothing written

---

## Phase 1: Fix Anchor Program (Days 1–3)

### Task 1.1: Get Program Compiling
**Priority: Critical. Nothing else works until this is done.**

1. Run `anchor build` and collect all compile errors
2. Fix each error — likely issues:
   - `init_if_needed` requires `anchor-lang` feature flag (already in Cargo.toml)
   - Missing imports or incorrect type paths
   - PDA bump derivation mismatches
3. Get `anchor build` to pass with zero errors
4. Verify IDL generation

### Task 1.2: Add YieldReceipt Account Struct
**File: `programs/susd-core/src/state/mod.rs`**

Add new struct:
```rust
#[account]
pub struct YieldReceipt {
    pub timestamp: i64,
    pub jito_yield_usd: u64,
    pub drift_funding_usd: u64,
    pub total_yield_usd: u64,
    pub old_exchange_rate: u128,
    pub new_exchange_rate: u128,
    pub receipt_index: u32,
    pub bump: u8,
}
// LEN = 8 + 8 + 8 + 8 + 16 + 16 + 4 + 1
```

### Task 1.3: Implement Proportional Redemptions
**File: `programs/susd-core/src/instructions/redeem.rs`**

Current: hard `ProtocolUnderwater` error when `total_equity_usd < SUSD_supply`
New:
```
1. Calculate redeemable_ratio = min(100, total_equity_usd × 100 / SUSD_supply)
2. If redeemable_ratio == 0 → ProtocolUnderwater error
3. If redeemable_ratio == 100 → full redemption (same as before)
4. If redeemable_ratio < 100:
   - max_redeemable = susd_amount × redeemable_ratio / 100
   - Burn max_redeemable SUSD
   - Return SOL for max_redeemable
   - User retains (susd_amount - max_redeemable) SUSD in wallet
5. Return redeemable_ratio to client via event log (Anchor events)
```

Add new error: `PartialRedemption` (informational, not a failure — use Anchor event instead)

### Task 1.4: Fix Auto-Unfreeze in update_equity
**File: `programs/susd-core/src/instructions/update_equity.rs`**

Current: only freezes when `total_equity_usd == 0`
New:
```
if total_equity_usd < SUSD_supply (from susd_mint):
    is_frozen = true
elif is_frozen:
    is_frozen = false  // auto-unfreeze
```

Need to add `susd_mint: Account<'info, Mint>` to UpdateEquity accounts to read supply.

### Task 1.5: Update update_yield to Create YieldReceipts
**File: `programs/susd-core/src/instructions/update_yield.rs`**

Changes:
1. Add parameters: `jito_yield_usd: u64`, `drift_funding_usd: u64`, `receipt_index: u32`
2. Add `yield_receipt` account to accounts struct (init, PDA with `["yield_receipt", receipt_index.to_le_bytes()]`)
3. Populate YieldReceipt fields
4. Keep existing rate validation (new_rate >= old_rate)

### Task 1.6: Add Anchor Event for Proportional Redemption
**File: `programs/susd-core/src/lib.rs` or new `events.rs`**

```rust
#[event]
pub struct RedemptionEvent {
    pub user: Pubkey,
    pub susd_requested: u64,
    pub susd_burned: u64,
    pub sol_returned: u64,
    pub redeemable_ratio: u8,  // 0-100
}
```

---

## Phase 2: Anchor Tests (Days 4–5)

### Task 2.1: Setup Test Infrastructure
- Install `mollusk` or `bankrun` for Anchor testing
- Create test helpers: admin keypair, program ID, common account setups

### Task 2.2: Core Instruction Tests
| Test | What It Validates |
|---|---|
| `test_init_protocol` | VaultConfig + StakingState created, mints initialized |
| `test_deposit` | SOL in → SUSD minted at correct rate |
| `test_deposit_zero` | Fails with ZeroAmount |
| `test_deposit_frozen` | Fails with ProtocolFrozen |
| `test_redeem_full_solvency` | SUSD burned → SOL returned, 100% ratio |
| `test_redeem_proportional_90` | 90% solvency → 90% redemption, 10% SUSD retained |
| `test_redeem_proportional_50` | 50% solvency → 50% redemption |
| `test_redeem_zero_solvency` | 0% solvency → ProtocolUnderwater |
| `test_redeem_liquidity_buffer` | Fails with InsufficientLiquidity when buffer depleted |
| `test_stake` | SUSD → sSUSD at correct exchange rate |
| `test_unstake` | sSUSD → SUSD at appreciated exchange rate |
| `test_update_yield` | Rate increases, YieldReceipt created |
| `test_update_yield_decrease_rejected` | Rate cannot decrease |
| `test_update_equity_freeze` | Equity < supply → frozen |
| `test_update_equity_unfreeze` | Equity >= supply → auto-unfreeze |
| `test_admin_withdraw_buffer` | Cannot withdraw beyond buffer |
| `test_admin_deposit` | SOL added to vault |
| `test_set_admin` | Admin key rotated |

---

## Phase 3: Keeper Engine (Days 6–10)

### Task 3.1: Project Setup
- `pnpm init`, `tsconfig.json`, install deps: `@drift-finance/drift-sdk`, `@solana/web3.js`, `@pythnetwork/pyth-solana-receiver`, `dotenv`, `node-cron`
- `config.ts` — load env vars

### Task 3.2: Drift Client (`drift-client.ts`)
- Create Drift UserAccount on devnet
- Deposit SOL as collateral
- Open SOL-PERP short position
- Query position PnL + health factor
- Close/unwind position
- Withdraw collateral

### Task 3.3: Jito Client (`jito-client.ts`)
- Stake SOL → JitoSOL via Jito staking interface
- Query JitoSOL balance + current value
- Unstake JitoSOL → SOL

### Task 3.4: Vault Interactions (`vault-interactions.ts`)
- Build + send transactions to Anchor program
- `update_equity` tx
- `update_yield` tx (with yield breakdown + receipt_index)
- `admin_deposit` tx
- `admin_withdraw` tx

### Task 3.5: Equity Calculator (`equity-calculator.ts`)
- Total equity = vault SOL value + JitoSOL value + Drift PnL
- All in USD cents using Pyth price

### Task 3.6: Yield Calculator (`yield-calculator.ts`)
- Compute yield since last accrual
- Break down: JitoSOL staking yield vs Drift funding payments
- Calculate new sSUSD exchange rate
- Track receipt_index (read last from on-chain or local state)

### Task 3.7: Rebalancer (`rebalancer.ts`)
- Buffer replenishment logic
- Drift health factor monitoring
- Funding rate monitoring (negative for >48h → flat rate)

### Task 3.8: Main Loop (`index.ts`)
- Wire up cron jobs (1min equity, 5min yield, 5min health)
- Logging and error handling
- Graceful shutdown

---

## Phase 4: Frontend (Days 11–13)

### Task 4.1: Next.js Setup
- `npx create-next-app` with App Router, Tailwind, TypeScript
- Solana wallet adapter (`@solana/wallet-adapter-react`)
- `@solana/web3.js` for RPC calls

### Task 4.2: Deposit Card
- SOL input with live Pyth price
- Shows SUSD to be minted
- "Deposit" button → sends tx

### Task 4.3: Stake Card
- SUSD input with current sSUSD exchange rate
- Shows sSUSD to be minted
- "Stake" button → sends tx

### Task 4.4: Redeem/Unstake
- Redeem SUSD → SOL (with proportional status if solvency < 100%)
- Unstake sSUSD → SUSD
- Clear UI for partial redemption: "You can redeem X% right now"

### Task 4.5: Yield Analytics
- Current sSUSD exchange rate + APY
- Yield breakdown chart (JitoSOL vs Drift) from YieldReceipts
- Blended APY display

### Task 4.6: Protocol Health Dashboard
- Total equity, SUSD supply, solvency %
- Liquidity buffer %
- Frozen status indicator
- Drift position health

---

## Phase 5: Integration + Devnet (Days 14–16)

### Task 5.1: Devnet Deployment
- Deploy Anchor program to devnet
- Init protocol with admin keypair
- Fund vault with initial SOL

### Task 5.2: End-to-End Flow
1. User deposits SOL → gets SUSD
2. User stakes SUSD → gets sSUSD
3. Keeper runs: updates equity, opens Drift position, stakes JitoSOL
4. Keeper accrues yield: updates exchange rate, creates YieldReceipt
5. User unstakes: gets more SUSD back (yield earned)
6. User redeems: burns SUSD → gets SOL back
7. Test proportional redemption by manipulating equity

### Task 5.3: Error Scenarios
- Test with low equity → proportional redemption triggers
- Test with depleted buffer → InsufficientLiquidity
- Test keeper crash recovery

---

## Phase 6: Submit (Days 17–18)

### Task 6.1: Demo Video
- 3-5 minute walkthrough
- Show deposit → stake → yield accrual → redeem
- Highlight proportional redemption
- Highlight YieldReceipt audit trail

### Task 6.2: README
- What is SUSD
- Architecture overview
- How to run locally
- Devnet address

### Task 6.3: Colosseum Submission
- Submit via colosseum.org
- Include demo video, repo link, team info

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Anchor 1.0.1 compile issues | High — blocks everything | Fix first, no other work until build passes |
| Drift SDK gaps | High — blocks keeper | Start Drift integration early (day 6), fallback: mock keeper for demo |
| Proportional math rounding | Medium — could lose dust | Use ceil for SOL returned, floor for SUSD burned |
| 18 days is tight | High — solo builder | Skip Blinks, Solana Pay, dynamic buffer. Only committed features. |
| Phantom Token2022 issues | Low — using standard SPL | Not using Token2022 extensions for SUSD/sSUSD, no risk |
