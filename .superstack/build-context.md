{
  "project": "susd-protocol",
  "description": "Delta-neutral stablecoin vault with proportional redemptions and yield staking",
  "stack": {
    "program": "Anchor 1.0.1",
    "program_id": "2jHyq6V2wcxHSA1Wk4shY3B4bZooKoW1VjMWnagd1tda",
    "client": "TypeScript",
    "frontend": "Next.js",
    "testing": "bankrun"
  },
  "build_status": {
    "milestones": [
      "Phase 1: Anchor program compiles with all features (proportional redemptions, YieldReceipt, auto-unfreeze, RedemptionEvent)"
    ],
    "mvp_complete": false,
    "tests_passing": false,
    "devnet_deployed": false,
    "program_id": "2jHyq6V2wcxHSA1Wk4shY3B4bZooKoW1VjMWnagd1tda"
  },
  "debug": {
    "issues_resolved": [
      {
        "error": "__client_accounts_instructions not found in crate root",
        "cause": "Anchor 1.0.1 #[program] macro cannot resolve nested module paths for Accounts structs",
        "fix": "Flatten imports: pub use submod::* in instructions/mod.rs + use direct struct names in program module"
      },
      {
        "error": "anchor_lang::system_program::transfer::Transfer not found",
        "cause": "Anchor 1.0.1 changed the system_program module structure",
        "fix": "Use anchor_lang::system_program::Transfer (struct) instead of transfer::Transfer"
      },
      {
        "error": "cargo-build-sbf panic on Windows",
        "cause": "cargo-build-sbf v4.0.0 can't find SBF toolchain on Windows",
        "fix": "Use cargo build-sbf --skip-tools-install to bypass toolchain discovery"
      }
    ],
    "last_debug_session": "2026-04-25T16:55:00Z"
  },
  "build_command": "cargo build-sbf --skip-tools-install --manifest-path programs/susd-core/Cargo.toml"
}
