# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
# Build with Foundry
forge build

# Build with Hardhat
npx hardhat compile

# Run Hardhat tests
npm run test:hardhat
npx hardhat test --network hardhat

# Run a single test file
npx hardhat test test/SSVProxyFactory.test.ts --network hardhat

# Run tests with coverage
npm run test:coverage

# Deploy all contracts
npx hardhat deploy:all --network holesky  # or kurtosis

# Verify contracts
npx hardhat verify:all --network holesky

# Post-deployment tasks
npx hardhat setSSVFactory --network <network>
npx hardhat setOperator --operator <address> --network <network>
```

## Architecture Overview

This is an ETH staking contract system built on the SSV Network for distributed validator technology (DVT). The system enables trustless ETH staking with automatic fee distribution.

### Core Contract Flow

```
User → SSVProxyFactory.addEth() → GatewayEth2Deposit (holds ETH)
                                          ↓
Operator → SSVProxyFactory.makeBeaconDepositsAndRegisterValidators()
                    ↓                     ↓
           Beacon Deposit Contract   SSV Network (via SSVProxy)
```

### Key Contracts

**SSVProxyFactory** (`src/ssvProxy/SSVProxyFactory.sol`)
- Entry point for validator registration
- Deploys SSVProxy instances (EIP-1167 clones)
- Manages operator permissions via `onlyOperatorOrOwner` modifier
- Holds SSV tokens and distributes them to SSVProxy instances

**SSVProxy** (`src/ssvProxy/SSVProxy.sol`)
- Per-client proxy for SSV Network interactions
- Each instance corresponds to 1 FeeManager instance
- Uses fallback to forward allowed calls to SSVNetwork
- Manages validator registration and cluster operations

**GatewayEth2Deposit** (`src/gatewayEth2Deposit/GatewayEth2Deposit.sol`)
- Temporary ETH custody before beacon chain deposit
- 24-hour expiration for client refunds if operator doesn't register
- Makes actual deposits to Beacon DepositContract

**FeeManager/RewardFeeManager** (`src/feeManager/`)
- Receives execution layer rewards (priority fees + MEV)
- Splits rewards between client, service, and referrer based on basis points
- FeeManagerFactory deploys clones with deterministic addresses

### Fee Distribution Model

- **Consensus Layer (CL) rewards**: Sent directly to withdrawal credentials (client-controlled)
- **Execution Layer (EL) rewards**: Sent to FeeManager, then split by `withdraw()`:
  - Client share: `clientBasisPoints / 10000`
  - Referrer share: `referrerBasisPoints / 10000` (optional)
  - Service share: remainder

### Access Control Pattern

The system uses a hierarchical permission model:
- **Owner**: Full admin, can change templates and configurations
- **Operator**: Can register validators and manage clusters
- **Client**: Can call allowed SSVNetwork functions via SSVProxy fallback

Allowed function selectors are managed via `setAllowedSelectorsForClient()` and `setAllowedSelectorsForOperator()`.

### Deployment Order

1. FeeManagerFactory
2. RewardFeeManager (reference implementation)
3. GatewayEth2Deposit
4. SSVProxyFactory
5. SSVProxy (reference implementation)
6. Configure: `setSSVProxyFactory()`, `setOperator()`, `setReferenceSSVProxy()`

## Development Notes

- Solidity 0.8.24 with IR optimizer and Cancun EVM
- Uses EIP-1167 minimal proxy pattern for gas-efficient cloning
- All clones are deterministic (predictable addresses before deployment)
- ERC165 interface detection is used extensively for contract validation
- Tests use Hardhat with Holesky fork at block 2790017
