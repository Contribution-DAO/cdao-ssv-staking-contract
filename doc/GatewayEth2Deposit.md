# GatewayEth2Deposit Contract Documentation

## Overview

The GatewayEth2Deposit contract serves as the single entry point for Validator ETH staking deposits. It temporarily holds client ETH until operators forward it to the Beacon (ETH2) Deposit Contract.

## Key Features

- Manages ETH deposits for validator staking
- Handles withdrawal credentials
- Supports EIP-7251 for flexible deposit amounts
- Integrates with SSV network for validator operations
- Provides deposit tracking and management

## Contract Inheritance

- ERC165
- IGatewayEth2Deposit
- Ownable

## State Variables

- `_ssvProxyFactory`: SSVProxyFactory contract reference
- `_depositContract`: Beacon DepositContract reference
- `_feeManagerFactory`: FeeManagerFactory contract reference
- `_deposits`: Mapping of deposit IDs to ClientDeposit structs
- `_eip7251Enabled`: Flag for EIP-7251 support

## Key Functions

### Constructor

```solidity
constructor(
    address feeManagerFactory_,
    address depositContract_
)
```

Initializes the gateway with FeeManagerFactory and DepositContract addresses.

### addEth

```solidity
function addEth(
    bytes32 _eth2WithdrawalCredentials,
    uint96 _ethAmountPerValidatorInWei,
    address _referenceFeeManager,
    address _sender,
    FeeRecipient calldata _clientConfig,
    FeeRecipient calldata _referrerConfig,
    bytes calldata _extraData
) external payable returns (bytes32 depositId, address feeManagerInstance)
```

Accepts ETH deposits and creates associated FeeManager instances.

### makeBeaconDeposit

```solidity
function makeBeaconDeposit(
    bytes32 _eth2WithdrawalCredentials,
    uint96 _ethAmountPerValidatorInWei,
    address _feeManagerInstance,
    bytes[] calldata _pubkeys,
    bytes[] calldata _signatures,
    bytes32[] calldata _depositDataRoots
) external
```

Forwards deposits to the Beacon DepositContract with validator credentials.

## Events

- `ClientEthAdded`
- `Eth2Deposit`
- `Eth2DepositCompleted`
- `Eth2DepositInProgress`
- `ServiceRejected`
- `Refund`
- `Eip7251Enabled`

## Access Control

- Only operator or owner can make beacon deposits
- Only FeeManagerFactory owner can enable EIP-7251
- Refunds restricted to client, operator, or ETH deposit operator

## Integration Points

- Interacts with Beacon DepositContract
- Works with FeeManagerFactory for fee management
- Connects with SSVProxyFactory for validator setup

## Security Considerations

- Validates withdrawal credentials format
- Enforces minimum deposit amounts
- Implements timeouts for deposit operations
- Prevents direct ETH transfers
- Validates contract interfaces using ERC165
