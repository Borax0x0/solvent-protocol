use anchor_lang::prelude::*;

#[account]
pub struct VaultConfig {
    pub admin_pubkey: Pubkey,
    pub susd_mint: Pubkey,
    pub ssusd_mint: Pubkey,
    pub liquidity_buffer_bps: u16,
    pub total_equity_usd: u64,
    pub is_frozen: bool,
    pub sol_price_usd: u64,
    pub bump: u8,
}

impl VaultConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 2 + 8 + 1 + 8 + 1;
}

#[account]
pub struct StakingState {
    pub ssusd_exchange_rate: u128,
    pub total_staked_susd: u64,
    pub last_yield_timestamp: i64,
    pub bump: u8,
}

impl StakingState {
    pub const LEN: usize = 8 + 16 + 8 + 8 + 1;
}

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

impl YieldReceipt {
    pub const LEN: usize = 8 + 8 + 8 + 8 + 8 + 16 + 16 + 4 + 1;
}
