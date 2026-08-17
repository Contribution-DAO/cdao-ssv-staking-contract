# Deployment Runbook

Step-by-step deployment of the CDAO SSV staking contracts. Supported networks: `hoodi`, `holesky`, `kurtosis` (`mainnet` is a placeholder in `tasks/config.ts` and is not deployable as-is).

Examples below use `hoodi`; substitute your network name.

## Checklist

- [ ] 0. Prerequisites — submodules, deps, `.env`, network config
- [ ] 1. `deploy:all`
- [ ] 2. `setSSVFactory` — **required**
- [ ] 3. `setOperator` — **required**
- [ ] 4. `enableEip7251` — optional
- [ ] 5. `verify:all`
- [ ] 6. Post-deploy sanity check

---

## 0. Prerequisites

```bash
git submodule update --init --recursive   # forge-std, openzeppelin-contracts, ssv-network
npm install                               # package-lock.json → npm, not pnpm
npx hardhat compile                       # only needed on a fresh clone — see below
```

### Do I need to compile?

Not for the main path: `deploy:all`, `setSSVFactory`, and `setOperator` each run `hre.run("compile")` as their first action.

Compile manually when:

- **Fresh clone** — `artifacts/`, `cache_hardhat/`, and `typechain-types/` are gitignored, so nothing exists yet.
- **Before `verify:all`** — it doesn't compile, and Etherscan verification needs the Hardhat build-info.
- **Before `deploy:rewardFeeManager`** — it doesn't compile either; `getContractFactory` just reads `artifacts/`.

`forge build` does **not** substitute: it writes to `out/`, while Hardhat reads `artifacts/`. Treat it as a fast syntax check only.

### Environment variables

`.env.example` is stale — it lists `DEPLOYER_SK` / `OWNER_SK` / `FEE_SK`, which nothing reads. `hardhat.config.ts` actually reads:

| Variable | Role |
| --- | --- |
| `HOODI_DEPLOYER` | `signers[0]` — deploys every contract, becomes **owner** of FeeManagerFactory and SSVProxyFactory |
| `HOODI_OWNER` | `signers[1]` — not used by `deploy:all` |
| `HOODI_FEE` | `signers[2]` — service fee recipient, baked into the reference `RewardFeeManager` constructor |
| `ETHERSCAN_API_KEY` | contract verification |

Use `HOLESKY_DEPLOYER` / `HOLESKY_OWNER` / `HOLESKY_FEE` for both `holesky` and `kurtosis`.

The deployer key must hold enough ETH for five contract deployments plus five setup transactions.

### Network config

Confirm the target network's entry in `tasks/config.ts`:

| Field | Notes |
| --- | --- |
| `ssvNetwork` | SSV Network contract |
| `ssvViews` | SSV Views contract |
| `nativeDeposit` | Beacon deposit contract — mainnet/hoodi use `0x00000000219ab540356cBB839Cbe05303d7705Fa`; kurtosis/holesky entries use `0x4242...4242` |
| `maxEthPerValidator` | Cap on ETH forwarded to SSV per validator. Must be within `[10**12, 10**24]` wei — the setter reverts `MaxEthAmountPerValidatorOutOfRange` outside that range, which fails `deploy:all` at setup call #5, *after* five contracts are already on-chain and *before* the addresses file is written. Verify this before deploying |
| `maxSSVOperator`, `operators`, `operatorsOwner`, `exchangeRate` | Passed to `task:setup` but **ignored** — leftovers from the SSV-token era |

### Verify contract constants

Check `src/constants/StakingConstants.sol` before deploying — these are compiled in and cannot be changed afterwards:

| Constant | Meaning |
| --- | --- |
| `TIMEOUT` | Client refund window. Ship `1 days`; a shortened value (used for fork testing) lets clients refund before the operator can realistically register |
| `MIN_DEPOSIT` | Minimum single `addEth` deposit (1 ETH) |
| `MIN_ACTIVATION_BALANCE` / `MAX_EFFECTIVE_BALANCE` | 32 / 2048 ETH per-validator bounds |
| `VALIDATORS_MAX_AMOUNT` | 400 — calldata-size ceiling per registration tx |

---

## 1. Deploy all contracts

```bash
npx hardhat deploy:all --network hoodi
```

Each constructor runs ERC165 `supportsInterface` checks against its dependencies, so this order is mandatory:

| # | Contract | Constructor args |
| --- | --- | --- |
| 1 | `FeeManagerFactory` | `defaultClientBasisPoints` (9000) |
| 2 | `GatewayEth2Deposit` | `feeManagerFactory`, `nativeDeposit` |
| 3 | `RewardFeeManager` (reference impl) | `feeManagerFactory`, `fee` (`signers[2]`) |
| 4 | `SSVProxyFactory` | `gateway`, `feeManagerFactory`, `refFeeManager`, `nativeDeposit`, `ssvNetwork`, `ssvViews` |
| 5 | `SSVProxy` (reference impl) | `ssvProxyFactory`, `ssvNetwork` |

Then `task:setup` sends exactly five transactions:

1. `ssvProxyFactory.setReferenceSSVProxy(ssvProxy)`
2. `feeManagerFactory.changeOperator(ssvProxyFactory)` — authorizes the factory to mint FeeManager clones. This is **not** the human operator role.
3. `feeManagerFactory.setGatewayEth2Deposit(gateway)`
4. `feeManagerFactory.setSSVProxyFactory(ssvProxyFactory)`
5. `ssvProxyFactory.setMaxEthAmountPerValidator(maxEthPerValidator)`

Addresses land in `deployments/deployment_<chainId>_<timestamp>.json`. Later tasks resolve contracts by reading the newest file for that chain ID, so don't delete or hand-edit it.

`deployments/` is gitignored, so that file exists only on the machine that ran `deploy:all` — and `setSSVFactory`, `setOperator`, and `verify:all` all depend on it. Back it up, or those tasks fail with `No deployment files found for chain ID <n>` elsewhere.

> `deploy:all` alone leaves the system non-functional. Steps 2 and 3 are required.

---

## 2. Link the gateway to the factory — required

```bash
npx hardhat setSSVFactory --network hoodi
```

Calls `gatewayEth2Deposit.setSSVProxyFactory(...)`. `task:setup` sets the FeeManagerFactory's pointer but never the gateway's own, so without this step **every `addEth` call reverts with `CallerNotSSVProxyFactory`**.

## 3. Set the operator — required

```bash
npx hardhat setOperator --operator 0x<operatorAddress> --network hoodi
```

Calls `ssvProxyFactory.changeOperator(...)`. Without it, only the owner can call `makeBeaconDepositsAndRegisterValidators`.

Both tasks sign with `signers[0]` and hit `onlyOwner` functions — run them with the same deployer key used in step 1, or they revert.

## 4. Optional: enable EIP-7251

Needed only when `_ethAmountPerValidatorInWei` ≠ 32 ETH, or for `0x02`-prefixed withdrawal credentials. Until enabled, `GatewayEth2Deposit.addEth` reverts `Eip7251NotEnabledYet` for anything else.

The gate reads the per-validator *parameter*, not `msg.value`. Deposits accumulate across calls (`amount = previous + msg.value`, `GatewayEth2Deposit.sol:158`), so a client can fund a 32 ETH validator in 1 ETH chunks with EIP-7251 disabled — partial funding is not what this flag is about.

No hardhat task exists; call it directly as the FeeManagerFactory owner:

```bash
npx hardhat console --network hoodi
```

```js
const d = require("./deployments/deployment_560048_<timestamp>.json").contracts
const g = await ethers.getContractAt("GatewayEth2Deposit", d.GatewayEth2Deposit)
await (await g.enableEip7251()).wait()
```

---

## 5. Verify on Etherscan

```bash
npx hardhat verify:all --network hoodi
```

Re-derives constructor args from the saved deployment file plus the current `tasks/config.ts` and `defaultClientBasisPoints`. Run it **before** editing that config — otherwise the args won't match the deployed bytecode and verification fails.

---

## 6. Post-deploy sanity check

```bash
npx hardhat console --network hoodi
```

```js
const d = require("./deployments/deployment_560048_<timestamp>.json").contracts
const g = await ethers.getContractAt("GatewayEth2Deposit", d.GatewayEth2Deposit)
const f = await ethers.getContractAt("SSVProxyFactory", d.SSVProxyFactory)

await g.getSSVProxyFactory()           // === d.SSVProxyFactory       (step 2)
await f.operator()                     // === your operator address   (step 3)
await f.getReferenceSSVProxy()         // === d.SSVProxy              (step 1, setup #1)
await f.getReferenceFeeManager()       // === d.ReferenceFeeManager
await f.getMaxEthAmountPerValidator()  // non-zero                    (step 1, setup #5)
await f.owner()                        // === deployer address
```

A zero address or zero amount means the corresponding step didn't land — re-run it.

---

## Maintenance tasks

### Swap the reference FeeManager

Deploys a new `RewardFeeManager` and optionally points the factory at it. Existing FeeManager clones are unaffected; only future ones use the new reference — and because clone addresses are derived from the reference address, a client's predicted FeeManager/SSVProxy addresses change after this.

```bash
npx hardhat deploy:rewardFeeManager \
  --fee-manager-factory 0x<feeManagerFactory> \
  --service 0x<serviceRecipient> \
  --update-reference true \
  --ssv-proxy-factory 0x<ssvProxyFactory> \
  --network hoodi

npx hardhat verify:rewardFeeManager \
  --address 0x<newRewardFeeManager> \
  --fee-manager-factory 0x<feeManagerFactory> \
  --service 0x<serviceRecipient> \
  --network hoodi
```

### Change the operator later

Re-run `setOperator` (step 3). Owner-only.

### Allow client/operator selectors on SSVProxy

`SSVProxy`'s fallback forwards SSVNetwork calls only for allowlisted selectors. No task exists — call these on `SSVProxyFactory` as owner:

- `setAllowedSelectorsForClient(bytes4[])` / `removeAllowedSelectorsForClient(bytes4[])`
- `setAllowedSelectorsForOperator(bytes4[])` / `removeAllowedSelectorsForOperator(bytes4[])`

The owner can always call any selector through the proxy without an allowlist entry.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `CallerNotSSVProxyFactory` on `addEth` | Step 2 (`setSSVFactory`) was skipped |
| `CallerNeitherOperatorNorOwner` on registration | Step 3 (`setOperator`) was skipped, or wrong signer |
| `AddressNeitherOperatorNorOwner` on `refund` / `rejectService` | Same cause, different error — these paths use `checkOperatorOrOwner` |
| `MaxEthAmountPerValidatorOutOfRange` during `deploy:all` | `maxEthPerValidator` in `tasks/config.ts` is outside `[10**12, 10**24]` wei |
| `MaxEthAmountPerValidatorNotSet` | Setup call #5 never ran — the setter rejects 0, so this can't come from config |
| `MaxEthAmountPerValidatorExceeded` | `msg.value` on registration exceeds `maxEthPerValidator × validatorCount` |
| `Eip7251NotEnabledYet` | `_ethAmountPerValidatorInWei` ≠ 32 ETH or credentials aren't `0x01`-prefixed, and step 4 wasn't done. Not about `msg.value` |
| `IncorrectWithdrawalCredentialsPrefix` | Credentials must start with `0x01` or `0x02` |
| `WithdrawalCredentialsBytesNotZero` | Bytes 2–11 must be zero. Byte 1 is **not** checked (`GatewayEth2Deposit.sol:106`) — a malformed credential with a nonzero byte 1 passes and gets deposited |
| `NoSmallDeposits` | Deposit below `MIN_DEPOSIT` (1 ETH) |
| `NotGatewayEth2Deposit` / `NotFeeManagerFactory` / `NotFeeManager` in a constructor | Wrong address passed, or contracts deployed out of order |
| `No deployment files found for chain ID <n>` | No `deployments/deployment_<chainId>_*.json` — run `deploy:all` first, or you're on the wrong network |
| Verification fails with mismatched args | `tasks/config.ts` changed after deployment |
