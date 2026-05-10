use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{Mint, Token, MintTo};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::VaultConfig;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault_config"],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: PDA that holds SOL
    #[account(
        mut,
        seeds = [b"vault_escrow"],
        bump,
    )]
    pub vault_escrow: SystemAccount<'info>,

    #[account(
        mut,
        constraint = slvt_mint.key() == vault_config.slvt_mint @ ErrorCode::MintMismatch,
    )]
    pub slvt_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = slvt_mint,
        associated_token::authority = user,
    )]
    pub user_slvt_ata: Account<'info, anchor_spl::token::TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, amount_lamports: u64) -> Result<()> {
    require!(!ctx.accounts.vault_config.is_frozen, ErrorCode::ProtocolFrozen);
    require!(ctx.accounts.vault_config.sol_price_usd > 0, ErrorCode::OracleNotSet);
    require!(amount_lamports > 0, ErrorCode::ZeroAmount);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
            },
        ),
        amount_lamports,
    )?;

    let slvt_amount = (amount_lamports as u128)
        .checked_mul(ctx.accounts.vault_config.sol_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(1_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(100_000_000_000)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let bump = ctx.accounts.vault_config.bump;
    anchor_spl::token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.slvt_mint.to_account_info(),
                to: ctx.accounts.user_slvt_ata.to_account_info(),
                authority: ctx.accounts.vault_config.to_account_info(),
            },
            &[&[b"vault_config", &[bump]]],
        ),
        slvt_amount,
    )?;

    Ok(())
}
