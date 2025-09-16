# SecureInherit: Encrypted Ledger for Smart Contract-Based Inheritance Planning

## Overview

SecureInherit is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world challenges in inheritance planning, such as lengthy probate processes, family disputes, high legal fees, lack of privacy, and vulnerability to fraud or tampering. Traditional inheritance systems often rely on centralized authorities (e.g., lawyers, courts), leading to delays (sometimes years), costs (up to 5-10% of estate value), and privacy breaches where sensitive family details become public.

SecureInherit leverages blockchain for immutable, transparent, and automated inheritance execution. It introduces an encrypted ledger where inheritance plans are stored securely, with sensitive data (e.g., beneficiary details, asset allocations) encrypted on-chain. Smart contracts automate asset distribution upon verifiable events like the testator's death, confirmed via decentralized oracles. This reduces disputes by enforcing predefined rules, ensures privacy through encryption, and minimizes costs by eliminating intermediaries.

Key benefits:
- **Privacy**: Inheritance details are encrypted; only authorized parties (e.g., beneficiaries with keys) can decrypt.
- **Automation**: Assets (e.g., STX tokens, NFTs, or tokenized real-world assets) are locked and released automatically.
- **Security**: Immutable ledger prevents tampering; multi-signature and oracle verification add trust.
- **Global Accessibility**: Beneficiaries worldwide can claim inheritances without geographic barriers.
- **Tax Efficiency**: Integrates hooks for automated tax reporting (future extension).

The project consists of 6 core smart contracts written in Clarity, designed for modularity, security, and composability.

## Problem Solved

In the real world:
- Over 50% of people die without a will, leading to intestate succession disputes.
- Probate courts handle millions of cases annually, with average delays of 1-2 years.
- Privacy issues: Public records expose family wealth and relationships.
- Fraud: Forged wills or undue influence affect 10-15% of cases.
- Cross-border issues: International families face conflicting laws.

SecureInherit solves these by:
- Enabling users to create encrypted, on-chain wills that execute automatically.
- Using oracles for death verification (e.g., integrating with official registries or trusted notaries).
- Allowing encrypted asset allocation to prevent premature leaks.
- Providing a dispute mechanism backed by on-chain evidence.
- Supporting digital and tokenized assets, with bridges to traditional finance.

## Architecture

- **Blockchain**: Stacks (Bitcoin-secured, Clarity language).
- **Frontend**: (Not included; assume dApp built with React/Web3.js for user interaction).
- **Off-chain Components**: Encryption keys managed client-side (e.g., via Metamask); oracles for real-world events.
- **Flow**:
  1. User registers and creates an encrypted inheritance plan.
  2. Assets are locked in a vault.
  3. Upon event (e.g., death), oracle triggers verification.
  4. Beneficiaries claim decrypted shares.
  5. Disputes resolved via on-chain arbitration.

Contracts interact via traits for loose coupling. All contracts are audited for security (simulated here).

## Smart Contracts

The project includes 6 Clarity smart contracts:

1. **UserRegistry.clar**: Manages user registration and profiles. Stores hashed user data and links to inheritance plans. Ensures only verified users can create plans.
   
2. **InheritancePlan.clar**: Core contract for creating and managing inheritance plans. Allows users to define beneficiaries, conditions, and encrypted allocations. Emits events for plan creation/updates.

3. **EncryptionManager.clar**: Handles on-chain encryption primitives (using Clarity's limited crypto; integrates with STX SIP-009 for basic hashing/encryption). Manages public keys for asymmetric encryption of sensitive data.

4. **AssetVault.clar**: Locks assets (STX, NFTs, fungible tokens) until release conditions are met. Supports timed releases or event-triggered unlocks.

5. **OracleVerifier.clar**: Integrates with external oracles (e.g., Chainlink-like on Stacks) to verify real-world events like death certificates. Triggers plan execution upon confirmation.

6. **ClaimDispatcher.clar**: Manages beneficiary claims. Decrypts (via off-chain keys) and distributes assets. Includes multi-sig for high-value claims and dispute flagging.

### Contract Interactions
- `UserRegistry` → `InheritancePlan`: Registers user before plan creation.
- `InheritancePlan` → `EncryptionManager`: Encrypts plan details.
- `InheritancePlan` → `AssetVault`: Locks assets referenced in plan.
- `OracleVerifier` → `InheritancePlan`: Triggers execution on event.
- `ClaimDispatcher` → `AssetVault`: Releases assets to claimants.

## Installation and Deployment

### Prerequisites
- Stacks CLI (stacks-node, clarinet).
- Node.js for any frontend.
- Testnet STX for deployment.

### Steps
1. Clone the repo:
   ```
   git clone `git clone <repo-url>`
   cd SecureInherit
   ```

2. Install dependencies (if any):
   ```
   npm install  # For dev tools, if added
   ```

3. Test contracts locally:
   ```
   clarinet test
   ```

4. Deploy to Stacks Testnet:
   - Use Clarinet to generate deployment scripts.
   ```
   clarinet deploy --testnet
   ```

5. Interact via Stacks Explorer or custom dApp.

## Usage

1. **Register User**: Call `UserRegistry::register-user` with your principal and hashed info.
2. **Create Plan**: Use `InheritancePlan::create-plan` with encrypted beneficiary list and conditions.
3. **Lock Assets**: Transfer to `AssetVault::lock-assets` referencing the plan ID.
4. **Verify Event**: Oracle calls `OracleVerifier::submit-proof` with event data.
5. **Claim**: Beneficiaries call `ClaimDispatcher::claim-share` with decryption key proof.

## Security Considerations
- Use client-side encryption; never store private keys on-chain.
- Audit contracts for reentrancy, overflow (Clarity mitigates many via types).
- Rate-limit oracle submissions to prevent spam.
- Emergency pause trait for admins in case of exploits.

## Future Enhancements
- Integration with real oracles (e.g., Stacks Oracle protocols).
- Support for real-world asset tokenization (e.g., via RWA platforms).
- DAO governance for dispute resolution.
- Mobile app for easy plan management.

## License
MIT License. See LICENSE file.