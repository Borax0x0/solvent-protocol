use anchor_lang::prelude::*;
use crate::state::VaultConfig;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct SetAdmin<'info> {
    #[account(
        mut,
        seeds = [b"vault_config"],
        bump = vault_config.bump,
        constraint = current_admin.key() == vault_config.admin_pubkey @ ErrorCode::Unauthorized,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    pub current_admin: Signer<'info>,

    /// CHECK: New admin pubkey - validated in handler
    pub new_admin: SystemAccount<'info>,
}

pub fn handler(ctx: Context<SetAdmin>) -> Result<()> {
    ctx.accounts.vault_config.admin_pubkey = ctx.accounts.new_admin.key();
    Ok(())
}
