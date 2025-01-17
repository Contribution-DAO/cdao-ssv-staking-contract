# FeeManagerFactory Contract Documentation

## Overview

The FeeManagerFactory contract is responsible for deploying and managing FeeManager instances. Each FeeManager instance handles the fee distribution between clients and referrers for validator operations.

## Key Features

- Deploys new FeeManager instances using a reference implementation
- Manages fee distribution configurations for clients and referrers
- Provides predictable addresses for FeeManager deployments
- Supports ERC165 interface detection

## Contract Inheritance

- OwnableAssetRecover
- ERC165
- IFeeManagerFactory

## State Variables

- `_referenceFeeManager`: Template contract used for new FeeManager deployments
- `_deployedFeeManagers`: Mapping to track deployed FeeManager instances

## Key Functions

### Constructor

```solidity
constructor(address referenceFeeManager_)
```

Initializes the factory with a reference FeeManager implementation.

### createFeeManager

```solidity
function createFeeManager(
    address referenceFeeManager_,
    FeeRecipient calldata _clientConfig,
    FeeRecipient calldata _referrerConfig
) external returns (address)
```

Deploys a new FeeManager instance with specified client and referrer configurations.

### predictFeeManagerAddress

```solidity
function predictFeeManagerAddress(
    address referenceFeeManager_,
    FeeRecipient calldata _clientConfig,
    FeeRecipient calldata _referrerConfig
) external view returns (address)
```

Predicts the address where a FeeManager will be deployed based on given parameters.

## Events

- `FeeManagerCreated(address indexed instance, address indexed client)`
- `ReferenceFeeManagerSet(address indexed instance)`

## Access Control

- Only owner can set reference FeeManager
- FeeManager creation is permissionless but deterministic

## Integration Points

- Works with SSVProxyFactory for validator management
- Integrates with GatewayEth2Deposit for deposit handling
- Manages fee distribution for validator operations

## Security Considerations

- Uses deterministic deployment addresses for predictability
- Implements access control for critical functions
- Validates contract interfaces using ERC165
