use anchor_lang::prelude::*;
use crate::state::VaultConfig;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct AdminWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault_config"],
        bump = vault_config.bump,
        constraint = admin.key() == vault_config.admin_pubkey @ ErrorCode::Unauthorized,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: PDA that holds SOL
    #[account(
        mut,
        seeds = [b"vault_escrow"],
        bump,
    )]
    pub vault_escrow: SystemAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = susd_mint.key() == vault_config.susd_mint,
    )]
    pub susd_mint: Account<'info, anchor_spl::token::Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AdminWithdraw>, amount_lamports: u64) -> Result<()> {
    require!(amount_lamports > 0, ErrorCode::ZeroAmount);

    let vault_sol = ctx.accounts.vault_escrow.lamports();
    let susd_supply = ctx.accounts.susd_mint.supply;

    let min_buffer = (susd_supply as u128)
        .checked_mul(ctx.accounts.vault_config.liquidity_buffer_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(100_000_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(ctx.accounts.vault_config.sol_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let max_withdraw = vault_sol
        .checked_sub(min_buffer)
        .ok_or(ErrorCode::BufferExceeded)?;

    let actual_withdraw = amount_lamports.min(max_withdraw);
    require!(actual_withdraw > 0, ErrorCode::BufferExceeded);

    **ctx.accounts.vault_escrow.to_account_info().try_borrow_mut_lamports()? -= actual_withdraw;
    **ctx.accounts.admin.to_account_info().try_borrow_mut_lamports()? += actual_withdraw;

    Ok(())
}
