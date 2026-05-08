use anchor_lang::prelude::*;
use crate::state::VaultConfig;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct UpdateEquity<'info> {
    #[account(
        mut,
        seeds = [b"vault_config"],
        bump = vault_config.bump,
        constraint = admin.key() == vault_config.admin_pubkey @ ErrorCode::Unauthorized,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: PDA that holds SOL - used to calculate vault SOL value
    #[account(
        seeds = [b"vault_escrow"],
        bump,
    )]
    pub vault_escrow: SystemAccount<'info>,

    #[account(
        constraint = susd_mint.key() == vault_config.susd_mint @ ErrorCode::MintMismatch,
    )]
    pub susd_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateEquity>, total_equity_usd: u64, sol_price_usd: u64) -> Result<()> {
    require!(sol_price_usd > 0, ErrorCode::OracleNotSet);

    ctx.accounts.vault_config.total_equity_usd = total_equity_usd;
    ctx.accounts.vault_config.sol_price_usd = sol_price_usd;

    let susd_supply = ctx.accounts.susd_mint.supply;

    if total_equity_usd < susd_supply {
        ctx.accounts.vault_config.is_frozen = true;
    } else if ctx.accounts.vault_config.is_frozen {
        ctx.accounts.vault_config.is_frozen = false;
    }

    Ok(())
}
