# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Testing
- `npm run test:hardhat` - Run all tests using Hardhat
- `npm run test:coverage` - Generate test coverage report
- `npx hardhat test test/<filename>.test.ts --network hardhat` - Run a single test file

### Deployment
- `npx hardhat deploy:all --network <network>` - Deploy all contracts to specified network
- `npx hardhat verify:all --network <network>` - Verify all deployed contracts on Etherscan

### Configuration
- `npx hardhat setSSVFactory --network <network>` - Configure SSV Factory after deployment
- `npx hardhat setOperator --operator <address> --network <network>` - Set operator address

### Supported Networks
- `hardhat` - Local hardhat network (forked from mainnet)
- `holesky` - Holesky testnet
- `kurtosis` - Kurtosis testnet
- `mainnet` - Ethereum mainnet

## Architecture Overview

This is a staking contract system for SSV (Secret Shared Validators) that enables distributed validator operations on Ethereum 2.0. The system handles ETH deposits, validator registration, and reward distribution.

### Core Components

1. **SSVProxyFactory** (`src/ssvProxy/SSVProxyFactory.sol`)
   - Main entry point for staking operations
   - Handles ETH deposits via `addEth()` function
   - Manages validator registration via `makeBeaconDepositsAndRegisterValidators()`
   - Provides refund mechanism if operators don't register validators within timeout

2. **FeeManagerFactory** (`src/feeManager/FeeManagerFactory.sol`)
   - Creates fee manager instances for each client
   - Handles execution layer reward distribution
   - Splits rewards between clients, operators, and referrers

3. **GatewayEth2Deposit** (`src/gatewayEth2Deposit/GatewayEth2Deposit.sol`)
   - Interfaces with Ethereum 2.0 deposit contract
   - Handles beacon chain validator deposits

4. **SSVProxy** (`src/ssvProxy/SSVProxy.sol`)
   - Manages SSV network interactions
   - Handles validator registration with SSV operators
   - Manages SSV token deposits and withdrawals

### Key Workflow

1. **User Deposits**: Users call `addEth()` on SSVProxyFactory with:
   - ETH amount (minimum 32 ETH per validator)
   - Withdrawal credentials (must start with 0x01 + padded address)
   - Fee configuration for client and referrer (basis points)

2. **Operator Registration**: CDAO operators create validator keys using SSV DKG and register validators by calling `makeBeaconDepositsAndRegisterValidators()`

3. **Reward Distribution**:
   - Consensus layer rewards go directly to withdrawal credentials
   - Execution layer rewards are split via FeeManager contracts

4. **Refund Protection**: Users can reclaim ETH if operators don't register validators within the timeout period

### Important Constants

Located in `src/constants/StakingConstants.sol`:
- `MIN_ACTIVATION_BALANCE`: 32 ETH minimum per validator
- `MAX_EFFECTIVE_BALANCE`: 2048 ETH maximum
- `TIMEOUT`: 3 minutes for operator registration
- `VALIDATORS_MAX_AMOUNT`: 400 validators per transaction
- `COLLATERAL`: 32 ETH per validator

### Network Configuration

Network-specific addresses (SSV contracts, deposit contracts) are defined in `tasks/config.ts`. Default client basis points is 9000 (90%).

### Testing Structure

- Test files located in `test/` directory
- Uses Hardhat testing framework with TypeScript
- Shared fixture in `test/fixtures/deployContracts.ts` - sets up all contracts with proper linking
- Helper functions in `test/helpers/index.ts` (e.g., `addressToWithdrawalCredentials`)
- Test constants in `test/constants/index.ts`

### Development Environment

- Uses both Hardhat and Foundry for development
- Solidity version: 0.8.24 with Cancun EVM version and viaIR enabled
- TypeScript configuration for tasks and tests
- Deployment artifacts saved in `deployments/` directory

### Security Considerations

- All contracts inherit from OpenZeppelin's access control patterns
- Asset recovery mechanisms for stuck tokens/ETH (`src/assetRecover/`)
- Timeout-based refund protection for users
- Operator-based access control for validator registration
- ERC-4337 account abstraction support (`src/erc4337/`)