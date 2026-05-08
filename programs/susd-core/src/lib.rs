pub mod instructions;
pub mod state;
pub mod error;

#[allow(ambiguous_glob_reexports)]
pub use instructions::*;

use anchor_lang::prelude::*;

declare_id!("2jHyq6V2wcxHSA1Wk4shY3B4bZooKoW1VjMWnagd1tda");

#[event]
pub struct RedemptionEvent {
    pub user: Pubkey,
    pub susd_requested: u64,
    pub susd_burned: u64,
    pub sol_returned: u64,
    pub redeemable_ratio: u8,
}

#[program]
pub mod susd_core {
    use super::*;

    pub fn init_protocol(ctx: Context<InitProtocol>, liquidity_buffer_bps: u16) -> Result<()> {
        init_protocol::handler(ctx, liquidity_buffer_bps)
    }

    pub fn deposit(ctx: Context<Deposit>, amount_lamports: u64) -> Result<()> {
        deposit::handler(ctx, amount_lamports)
    }

    pub fn redeem(ctx: Context<Redeem>, susd_amount: u64) -> Result<()> {
        redeem::handler(ctx, susd_amount)
    }

    pub fn admin_withdraw(ctx: Context<AdminWithdraw>, amount_lamports: u64) -> Result<()> {
        admin_withdraw::handler(ctx, amount_lamports)
    }

    pub fn admin_deposit(ctx: Context<AdminDeposit>, amount_lamports: u64) -> Result<()> {
        admin_deposit::handler(ctx, amount_lamports)
    }

    pub fn update_equity(ctx: Context<UpdateEquity>, total_equity_usd: u64, sol_price_usd: u64) -> Result<()> {
        update_equity::handler(ctx, total_equity_usd, sol_price_usd)
    }

    pub fn stake(ctx: Context<Stake>, susd_amount: u64) -> Result<()> {
        stake::handler(ctx, susd_amount)
    }

    pub fn unstake(ctx: Context<Unstake>, ssusd_amount: u64) -> Result<()> {
        unstake::handler(ctx, ssusd_amount)
    }

    pub fn update_yield(ctx: Context<UpdateYield>, new_exchange_rate: u128, jito_yield_usd: u64, drift_funding_usd: u64, receipt_index: u32) -> Result<()> {
        update_yield::handler(ctx, new_exchange_rate, jito_yield_usd, drift_funding_usd, receipt_index)
    }

    pub fn set_admin(ctx: Context<SetAdmin>) -> Result<()> {
        set_admin::handler(ctx)
    }
}
