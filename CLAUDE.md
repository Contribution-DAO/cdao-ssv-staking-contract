# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
# Foundry build (fast, ~5s — use for quick compile checks)
forge build

# Hardhat compile (slower; regenerates typechain-types/ needed by TS tests)
npx hardhat compile

# Unit tests (plain hardhat network, MockSSVNetwork — no forking)
npm run test:hardhat
npx hardhat test test/SSVProxyFactory.test.ts --network hardhat   # single file
npx hardhat test --grep "bulkRegisterValidators" --network hardhat

# E2E tests against a Hoodi fork (skipped unless FORK_HOODI=true)
npm run test:e2e
HOODI_RPC_URL=... HOODI_FORK_BLOCK=... npm run test:e2e

npm run test:coverage

# Deploy (networks: kurtosis, holesky, hoodi)
npx hardhat deploy:all --network hoodi
npx hardhat setSSVFactory --network hoodi                        # REQUIRED after deploy:all
npx hardhat setOperator --operator <address> --network hoodi     # REQUIRED after deploy:all
npx hardhat verify:all --network hoodi
```

`lib/forge-std` and `lib/openzeppelin-contracts` are the only submodules the build needs (see `remappings.txt`). `lib/ssv-network` is reference-only — nothing under `src/` imports from it; the SSV interfaces in `src/interfaces/ssv-network/` are hand-maintained mirrors, and the submodule is cited only in comments and for `MOCK_SHARES` in `test/e2e/constants/hoodi.ts`.

## Architecture Overview

ETH staking on the SSV Network (DVT) with trustless fee splitting. Two-phase flow: a client parks ETH in the gateway, then an operator (with off-chain DKG output) atomically makes beacon deposits and registers the validators on SSV.

```
Client → SSVProxyFactory.addEth()  ──► GatewayEth2Deposit (custody, expires after TIMEOUT)
                                          │  creates FeeManager clone
                                          └► SSVProxyFactory creates SSVProxy clone

Operator → SSVProxyFactory.makeBeaconDepositsAndRegisterValidators{value: ssvFundingEth}()
              ├─► GatewayEth2Deposit.makeBeaconDeposit() → Beacon DepositContract
              └─► SSVProxy.bulkRegisterValidators{value}() → SSVNetwork, then setFeeRecipientAddress(feeManager)
```

### Key contracts

- **SSVProxyFactory** (`src/ssvProxy/SSVProxyFactory.sol`) — entry point. Deploys deterministic EIP-1167 clones of SSVProxy (salt = the FeeManager address), gates operator actions with `onlyOperatorOrOwner`, owns the client/operator selector allowlists, and forwards ETH to SSV.
- **SSVProxy** (`src/ssvProxy/SSVProxy.sol`) — one instance per FeeManager instance; it is the SSV *cluster owner*. Its `fallback()` forwards arbitrary SSVNetwork calls, permitted per-caller: owner (anything), operator (`isOperatorSelectorAllowed`), client (`isClientSelectorAllowed`).
- **GatewayEth2Deposit** (`src/gatewayEth2Deposit/GatewayEth2Deposit.sol`) — holds client ETH until deposit; `refund()` after `TIMEOUT` if the operator never registered. `addEth` is callable only by SSVProxyFactory. Direct ETH sends revert.
- **FeeManager / RewardFeeManager / FeeManagerFactory** (`src/feeManager/`) — deterministic clones that receive EL rewards and split them on `withdraw()`.

### Payment model: ETH-denominated SSV (post-migration)

SSV cluster funding is **ETH**, not the SSV token. There is no SSV token anywhere in the flow — no `ssvToken` constructor arg, no approvals, no exchange rate on-chain.

- `registerValidator` / `bulkRegisterValidator` / `deposit` / `reactivate` are `payable` and take `msg.value` instead of a token amount.
- `SSVProxy` constructor: `(ssvProxyFactory, ssvNetwork)`. `SSVProxyFactory` constructor: `(gateway, feeManagerFactory, refFeeManager, depositContract, ssvNetwork, ssvViews)`.
- Both have `receive() external payable {}`; `SSVProxy.callAnyContract` is `payable`.
- `migrateClusterToETH` exists for legacy token-funded clusters. `ISSVViews.getBalance` returns `(balance, ebBalance)`.
- Sizing is capped by `_maxEthAmountPerValidator` (`setMaxEthAmountPerValidator`), checked in `_checkEthAmount` against `msg.value / validatorCount`.

Because `SSVProxy` has a payable fallback, casting an address requires `SSVProxy(payable(addr))`.

### Fee distribution

- CL rewards go straight to the withdrawal credentials (client-controlled).
- EL rewards land in the FeeManager and are split on `withdraw()`: client `clientBasisPoints/10000`, referrer `referrerBasisPoints/10000` (optional), service the remainder. Splits are fixed at initialization.

### Access control

Ownership is delegated upward rather than stored per-instance:

- `SSVProxy.owner()/operator()` → `SSVProxyFactory.owner()/operator()`
- `FeeManager.owner()` → `FeeManagerFactory.owner()`

`FeeManagerFactory.createFeeManager` gates on `checkOperatorOrOwnerOrGatewayEth2Deposit`, so there are two ways in. The live path is `GatewayEth2Deposit.addEth` → `createFeeManager`, authorized by `setGatewayEth2Deposit` — **not** by the operator role. The `changeOperator(ssvProxyFactory)` call in `task:setup` only covers `SSVProxyFactory._createFeeManager`, which is private with no call sites (dead code as of this writing).

Roles: **owner** (templates, config, unrestricted proxy calls), **operator** (register validators, cluster ops), **client** (allowlisted SSVNetwork selectors via the proxy fallback).

### Deposit constraints (EIP-7251)

Until `enableEip7251()` is called by the FeeManagerFactory owner, `GatewayEth2Deposit.addEth` requires `_ethAmountPerValidatorInWei == MIN_ACTIVATION_BALANCE` (32 ETH) **and** a `0x01` credentials prefix. Note this gates the per-validator *parameter*, not `msg.value` — deposits accumulate across calls (`amount = previous + msg.value`), so funding 32 ETH in smaller chunks needs no EIP-7251.

Credentials must be `0x01`/`0x02`-prefixed. The zero-bytes check at `GatewayEth2Deposit.sol:106` is `(wc << 16) >> 176`, which covers bytes **2–11** only — byte 1 is unvalidated, so a malformed `0x01`-prefixed credential with a nonzero byte 1 is accepted and deposited. Treat that as a known gap, not intended behavior.

Tunables live in `src/constants/StakingConstants.sol` (`TIMEOUT`, `VALIDATORS_MAX_AMOUNT`, `MIN_DEPOSIT`, `MAX_EFFECTIVE_BALANCE`) — `TIMEOUT` is often lowered locally for testing; do not commit a shortened value by accident.

### Deployment

`deploy:all` uses signers `[deployer, owner, fee]` from the network's `accounts` array: the deployer deploys everything and ends up as owner of both factories; `fee` (index 2) is baked into the reference `RewardFeeManager` as the service recipient. Constructors run ERC165 `supportsInterface` checks on their dependencies, so the order is forced:

1. `FeeManagerFactory(defaultClientBasisPoints)`
2. `GatewayEth2Deposit(feeManagerFactory, nativeDeposit)`
3. `RewardFeeManager(feeManagerFactory, fee)` — the reference impl
4. `SSVProxyFactory(gateway, feeManagerFactory, refFeeManager, nativeDeposit, ssvNetwork, ssvViews)`
5. `SSVProxy(ssvProxyFactory, ssvNetwork)` — the reference impl
6. `task:setup` — five wiring calls, one of which is `feeManagerFactory.changeOperator(ssvProxyFactory)`; that is **not** the human operator role

Addresses are then written to `deployments/deployment_<chainId>_<timestamp>.json` (gitignored); the other tasks resolve contracts by reading the newest file for the chain.

**`deploy:all` alone leaves the system non-functional** — `task:setup` never sets the gateway's own factory pointer or the operator, so `setSSVFactory` and `setOperator` are both required afterwards. Without the first, every `addEth` reverts `CallerNotSSVProxyFactory`; without the second, only the owner can register validators.

`task:setup` also accepts `maxSSVOperator`, `operators`, `operatorsOwner`, and `exchangeRate` from `tasks/config.ts` but ignores all four — leftovers from the SSV-token era. SSV operator allowlisting is not performed at deploy time.

See `DEPLOYMENT.md` for the full runbook: env vars, when a manual compile is needed, the EIP-7251 step, reference-FeeManager swaps, and a revert-to-cause table.

## Configuration Layout

Per-network SSV/deposit-contract addresses, operator IDs, and limits are duplicated in three places — keep them in sync when adding a network:

- `tasks/config.ts` — deploy-time config (`kurtosis`, `holesky`, `hoodi`, `mainnet`, `hardhat`)
- `test/constants/index.ts` — unit-test config
- `test/e2e/constants/hoodi.ts` — fork-test config

Deployer keys come from `.env` (`HOODI_DEPLOYER`/`HOODI_OWNER`/`HOODI_FEE`, `HOLESKY_*`, `ETHERSCAN_API_KEY`).

## Development Notes

- Solidity 0.8.24, `via_ir`, optimizer runs 200, Cancun EVM — matched in both `foundry.toml` and `hardhat.config.ts`; change both together.
- All clones are deterministic; `predictSSVProxyAddress`/`predictFeeManagerAddress` give the address before deployment and are used as identity throughout.
- ERC165 is used pervasively for contract-type validation; a mock or stub passed into a constructor must implement the expected interface.
- Unit tests deploy `MockSSVNetwork` (`src/mocks/`); E2E tests hit the real Hoodi SSV Network with `MOCK_SHARES` (SSV shares are not validated on-chain, only emitted).
- Per-file docs live in `doc/`; the full deploy runbook is `DEPLOYMENT.md`.
- `README.md` has the client-facing flow walkthrough but is **stale on the ETH migration**: it documents `makeBeaconDepositsAndRegisterValidators` with a `uint256 _amount` SSV-token param and no `_operatorAddress`, claims the flow "transfers SSV tokens to SSVProxy", and shows `refund` as a factory function (it lives on `GatewayEth2Deposit`). Trust the contracts over the README.
