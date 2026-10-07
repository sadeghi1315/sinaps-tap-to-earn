SINAPS fixes included:
1) Chart and Buy SNP buttons now open the exact supplied GeckoTerminal and STON.fi URLs through Telegram.WebApp.openLink.
2) Referral and Tasks show immediate loading state and are still loaded independently.
3) Wallet page can recover the current user's saved wallet from /api/wallet/get without overwriting an active TON Connect session.
4) Withdrawal backend now supports an actual SNP Jetton payout from the treasury after the fee is approved.

IMPORTANT Render environment variables for real SNP payouts:
- TREASURY_MNEMONIC = the 24-word seed for the SAME treasury wallet as TREASURY_WALLET.
- TREASURY_WALLET = UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX
- SNP_CONTRACT = EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls
- TONCENTER_API_KEY = recommended

Never put TREASURY_MNEMONIC in GitHub or frontend files.

The backend uses @ton/ton and @ton/crypto, so Render must run npm install before node server.js.
