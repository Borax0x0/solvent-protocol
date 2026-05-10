# Solvent Protocol

**Delta-neutral stablecoin on Solana with proportional redemptions.**

Users deposit SOL, receive SLVT (a $1-pegged token), and the Keeper Engine deploys the SOL into JitoSOL staking + Drift SOL-PERP shorts to maintain delta neutrality and earn yield. Yield accrues to sSLVT, a staking token with an appreciating exchange rate. Every yield update is an on-chain YieldReceipt PDA — fully auditable, no trust required.

**Key differentiator**: Proportional redemptions. If the protocol is 90% solvent, you redeem 90% of your position. No hard freeze, no bank-run cliff.

## Architecture

```
User deposits SOL → SLVT minted at oracle rate
                    ↓
         Keeper Engine splits 50/50
          ↙              ↘
   JitoSOL staking    Drift SOL-PERP short
    (~7% APY)         (hedge + funding)
          ↘              ↙
         Yield accrues to sSLVT
   (appreciating exchange rate)
```

## Quick Start

### Prerequisites

- Solana CLI v3.1+, Anchor CLI v1.0.1+, Node v20+, pnpm v10+
- A Solana wallet with devnet SOL (`solana airdrop 2`)

### Build the Program

```bash
cargo build-sbf --skip-tools-install --manifest-path programs/slvt-core/Cargo.toml
anchor idl build
```

### Run Tests

```bash
pnpm install
pnpm test
```

19/19 tests pass in ~141ms using LiteSVM (no local validator needed).

### Deploy to Devnet

```bash
solana program deploy target/deploy/slvt_core.so \
  --program-id target/deploy/slvt_core-keypair.json \
  --url devnet
```

### Frontend

```bash
cd web-interface/app
pnpm install
pnpm dev --port 3000
```

Open http://localhost:3000 — connect Phantom wallet (devnet), deposit SOL.

### Keeper Engine

```bash
cd keeper-engine
cp .env.example .env
# Set ADMIN_KEYPAIR_PATH and PROGRAM_ID
pnpm install
pnpm start
```

Runs in mock mode by default (`MOCK_DRIFT=true`, `MOCK_JITO=true`). Updates equity every 60s, yield every 5min.

## Program Instructions

| # | Instruction | What It Does |
|---|---|---|
| 1 | `init_protocol` | Creates VaultConfig, StakingState, mints, vault escrow |
| 2 | `deposit` | SOL in → SLVT minted at oracle rate |
| 3 | `redeem` | Proportional redemption (ratio-based) + RedemptionEvent |
| 4 | `admin_deposit` | Admin SOL → vault escrow |
| 5 | `admin_withdraw` | Vault SOL → admin, capped by liquidity buffer |
| 6 | `update_equity` | Push equity + price, auto-freeze/unfreeze |
| 7 | `stake` | SLVT → sSLVT at exchange rate |
| 8 | `unstake` | sSLVT → SLVT at exchange rate |
| 9 | `update_yield` | Increase exchange rate, create YieldReceipt PDA |
| 10 | `set_admin` | Rotate admin key |

## Program ID (Devnet)

`5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho`

## Key Math

**Minting**: `SLVT_minted = SOL_lamports × oracle_price_cents × 1e6 / 1e11`

**Redemption**: `SOL_returned = SLVT_burned × 1e11 / (oracle_price_cents × 1e6)`

**Proportional Redemption**: `redeemable_ratio = min(100, equity × 100 / supply)`

**Staking**: `sSLVT_minted = SLVT_locked × 1e12 / exchange_rate`

## PDA Seeds

| Account | Seeds |
|---|---|
| VaultConfig | `["vault_config"]` |
| StakingState | `["staking_state"]` |
| Vault Escrow | `["vault_escrow"]` |
| SLVT Mint | `["slvt_mint"]` |
| sSLVT Mint | `["sslvt_mint"]` |
| YieldReceipt | `["yield_receipt", receipt_index.to_le_bytes()]` |

## Tech Stack

- **On-chain**: Anchor 1.0.1, Solana SBF, SPL Token
- **Keeper Engine**: TypeScript, Anchor SDK, Pyth Hermes, Drift SDK, Jito Stake Pool SDK
- **Frontend**: Next.js 16, Tailwind CSS, Framer Motion, Solana Wallet Adapter

## License

MIT
